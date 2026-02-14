// 云函数：submitReplacementLog — 核心：写入+汇总+报警
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 确保集合存在（首次调用时初始化）
const REQUIRED_COLLECTIONS = [
  'users', 'assets', 'parts', 'replacement_logs', 'monthly_part_usage',
  'asset_locations', 'location_part_map', 'asset_part_thresholds',
  'alerts', 'inventory', 'inventory_outbound_logs', 'inventory_alerts'
]
let _ensured = false
async function ensureCollections() {
  if (_ensured) return
  for (const name of REQUIRED_COLLECTIONS) {
    try { await db.createCollection(name) } catch (e) {}
  }
  _ensured = true
}

exports.main = async (event, context) => {
  await ensureCollections()
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '无法获取用户身份' } }
    }
    const now = Date.now()

    // ========== 1) 权限校验 ==========
    const { data: users } = await db.collection('users').where({ openid, status: 'active' }).limit(1).get()
    if (users.length === 0) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '未绑定或账号已禁用' } }
    }
    const user = users[0]
    if (!['Engineer', 'Supervisor', 'Admin'].includes(user.role)) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '仅工程人员/主管/管理员可提交' } }
    }

    // ========== 2) 入参校验 ==========
    const { assetId, type, locationId, selectedPartSkuIds, qtyMap, remark, images, clientOfflineId } = event

    if (!clientOfflineId) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 clientOfflineId' } }
    }
    if (!assetId || !type) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少必填字段（设备ID和更换类型）' } }
    }
    if (!['维修', '预防', '紧急'].includes(type)) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '更换类型无效' } }
    }
    if (!Array.isArray(selectedPartSkuIds) || selectedPartSkuIds.length === 0) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请选择至少 1 个配件' } }
    }
    if (!qtyMap || typeof qtyMap !== 'object') {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少数量信息' } }
    }
    // 验证 qty
    for (const skuId of selectedPartSkuIds) {
      const qty = qtyMap[skuId]
      if (!qty || !Number.isInteger(qty) || qty < 1) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: '数量必须为正整数' } }
      }
    }
    if (!Array.isArray(images) || images.length < 1) {
      return { ok: false, error: { code: 'UPLOAD_REQUIRED', message: '至少上传 1 张照片' } }
    }

    // ========== 3) 幂等检查 ==========
    const { data: existingLogs } = await db.collection('replacement_logs')
      .where({ clientOfflineId })
      .limit(1)
      .get()
    if (existingLogs.length > 0) {
      return { ok: true, data: { logId: existingLogs[0].logId, yearMonth: existingLogs[0].yearMonth, duplicate: true } }
    }

    // ========== 4) 数据校验：设备必须存在，部位为可选 ==========
    const { data: assets } = await db.collection('assets').where({ assetId, status: 'active' }).limit(1).get()
    if (assets.length === 0) {
      return { ok: false, error: { code: 'ASSET_NOT_FOUND', message: '设备不存在或已停用' } }
    }
    const asset = assets[0]

    // 部位为可选：如果提供了 locationId 则校验，否则跳过
    let location = null
    if (locationId) {
      const { data: locs } = await db.collection('asset_locations').where({ locationId, assetId, active: true }).limit(1).get()
      if (locs.length > 0) {
        location = locs[0]
      }
      // 部位不存在也不阻断，只是不记录部位快照
    }

    // 查配件快照
    const partsSnapshot = {}
    for (let i = 0; i < selectedPartSkuIds.length; i += 20) {
      const batch = selectedPartSkuIds.slice(i, i + 20)
      const { data: batchParts } = await db.collection('parts').where({ partSkuId: _.in(batch) }).get()
      batchParts.forEach(p => { partsSnapshot[p.partSkuId] = p })
    }

    // ========== 5) 服务端重写 & 写入 ==========
    const yearMonth = getYearMonth(now)
    const logId = `log_${now}_${Math.random().toString(36).slice(2, 8)}`

    const items = selectedPartSkuIds.map(skuId => {
      const part = partsSnapshot[skuId] || {}
      return {
        partSkuId: skuId,
        partNameSnapshot: part.partName || skuId,
        partCodeSnapshot: part.partCode || '',
        qty: qtyMap[skuId]
      }
    })

    // factoryId 从设备继承
    const factoryId = asset.factoryId || user.factoryId || null

    const logDoc = {
      logId,
      factoryId,
      assetId: asset.assetId,
      assetNameSnapshot: asset.assetName,
      assetNoSnapshot: asset.assetNo,
      reporterUserIdSnapshot: user.userId,
      reporterNameSnapshot: user.displayName,
      ts: now,
      yearMonth,
      type,
      locationIdSnapshot: locationId || '',
      locationNameSnapshot: location ? location.locationName : '',
      items,
      remark: remark || '',
      images,
      clientOfflineId,
      createdAt: now
    }

    await db.collection('replacement_logs').add({ data: logDoc })

    // ========== 6) 更新月度用量 & 检查阈值 ==========
    const createdAlerts = []
    for (const item of items) {
      // upsert monthly_part_usage
      const usageKey = { factoryId, assetId: asset.assetId, partSkuId: item.partSkuId, yearMonth }
      const { data: existingUsage } = await db.collection('monthly_part_usage').where(usageKey).limit(1).get()

      let newQtySum = item.qty
      if (existingUsage.length > 0) {
        await db.collection('monthly_part_usage').doc(existingUsage[0]._id).update({
          data: { qtySum: _.inc(item.qty), lastUpdatedAt: now }
        })
        newQtySum = existingUsage[0].qtySum + item.qty
      } else {
        await db.collection('monthly_part_usage').add({
          data: { ...usageKey, qtySum: item.qty, lastUpdatedAt: now }
        })
      }

      // 检查阈值
      const { data: thresholds } = await db.collection('asset_part_thresholds')
        .where({ assetId: asset.assetId, partSkuId: item.partSkuId, active: true })
        .limit(1)
        .get()

      if (thresholds.length > 0 && newQtySum > thresholds[0].thresholdMonthly) {
        // 本月是否已报警
        const { data: existingAlerts } = await db.collection('alerts')
          .where({ assetId: asset.assetId, partSkuId: item.partSkuId, yearMonth })
          .limit(1)
          .get()

        if (existingAlerts.length === 0) {
          const alertId = `alert_${now}_${Math.random().toString(36).slice(2, 8)}`
          await db.collection('alerts').add({
            data: {
              alertId,
              factoryId,
              assetId: asset.assetId,
              partSkuId: item.partSkuId,
              yearMonth,
              thresholdValue: thresholds[0].thresholdMonthly,
              currentQty: newQtySum,
              status: 'OPEN',
              ackByUserId: null,
              ackTs: null,
              ackNote: null,
              createdAt: now,
              // 冗余快照
              assetName: asset.assetName,
              partName: partsSnapshot[item.partSkuId] ? partsSnapshot[item.partSkuId].partName : item.partSkuId
            }
          })
          createdAlerts.push(alertId)
        } else {
          // 更新 currentQty
          await db.collection('alerts').doc(existingAlerts[0]._id).update({
            data: { currentQty: newQtySum }
          })
        }
      }
    }

    // ========== 7) 自动出库：扣减库存 + 记录出库 + 低库存报警 ==========
    let totalRepairCost = 0
    const inventoryWarnings = []

    for (const item of items) {
      // 查找库存
      const { data: invList } = await db.collection('inventory')
        .where({ factoryId, partSkuId: item.partSkuId })
        .limit(1)
        .get()

      let unitCostAtTime = 0
      if (invList.length > 0) {
        const inv = invList[0]
        unitCostAtTime = inv.avgUnitCost || 0
        const itemCost = item.qty * unitCostAtTime

        // 添加成本信息到 item
        item.unitCost = unitCostAtTime
        item.itemCost = Math.round(itemCost * 100) / 100
        totalRepairCost += itemCost

        // 扣减库存（允许为负，不阻断工作）
        const newQty = inv.currentQty - item.qty
        await db.collection('inventory').doc(inv._id).update({
          data: {
            currentQty: _.inc(-item.qty),
            totalCostValue: Math.round(Math.max(0, newQty) * inv.avgUnitCost * 100) / 100,
            lastOutboundAt: now,
            updatedAt: now
          }
        })

        // 写出库记录
        const outboundId = `ob_${now}_${Math.random().toString(36).slice(2, 8)}_${item.partSkuId}`
        await db.collection('inventory_outbound_logs').add({
          data: {
            outboundId,
            factoryId,
            partSkuId: item.partSkuId,
            partNameSnapshot: item.partNameSnapshot,
            partCodeSnapshot: item.partCodeSnapshot,
            qty: item.qty,
            unitCostAtTime,
            totalCost: Math.round(itemCost * 100) / 100,
            replacementLogId: logId,
            assetId: asset.assetId,
            assetNameSnapshot: asset.assetName,
            reporterNameSnapshot: user.displayName,
            ts: now,
            yearMonth,
            createdAt: now
          }
        })

        // 检查低库存
        if (newQty <= inv.lowStockThreshold) {
          // 检查是否已有 OPEN 低库存报警
          const { data: existingInvAlerts } = await db.collection('inventory_alerts')
            .where({ factoryId, partSkuId: item.partSkuId, status: 'OPEN' })
            .limit(1)
            .get()
          if (existingInvAlerts.length === 0) {
            const invAlertId = `ia_${now}_${Math.random().toString(36).slice(2, 8)}`
            await db.collection('inventory_alerts').add({
              data: {
                alertId: invAlertId,
                factoryId,
                partSkuId: item.partSkuId,
                partNameSnapshot: item.partNameSnapshot,
                currentQty: newQty,
                threshold: inv.lowStockThreshold,
                status: 'OPEN',
                ackByUserId: null,
                ackTs: null,
                ackNote: null,
                createdAt: now
              }
            })
            inventoryWarnings.push({ partSkuId: item.partSkuId, currentQty: newQty, threshold: inv.lowStockThreshold })
          }
        }
      } else {
        // 库存记录不存在，不阻断，但记录警告
        item.unitCost = 0
        item.itemCost = 0
        inventoryWarnings.push({ partSkuId: item.partSkuId, message: '库存记录不存在' })
      }
    }

    // 更新 replacement_log 的成本字段
    totalRepairCost = Math.round(totalRepairCost * 100) / 100
    await db.collection('replacement_logs').where({ logId }).limit(1).get().then(async ({ data: logDocs }) => {
      if (logDocs.length > 0) {
        await db.collection('replacement_logs').doc(logDocs[0]._id).update({
          data: { items, totalRepairCost }
        })
      }
    })

    return {
      ok: true,
      data: { logId, yearMonth, createdAlerts, totalRepairCost, inventoryWarnings }
    }
  } catch (err) {
    console.error('submitReplacementLog error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '提交失败: ' + (err.message || String(err)) } }
  }
}

function getYearMonth(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
