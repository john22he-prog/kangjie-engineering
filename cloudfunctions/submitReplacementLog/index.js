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
    const { assetId, type, fixType, locationId, selectedPartSkuIds, qtyMap, remark, images, clientOfflineId, noParts, module: rawModule } = event
    const module = ['equipment', 'facility', 'boiler'].includes(rawModule) ? rawModule : 'equipment'
    const isNonEquipment = module === 'facility' || module === 'boiler'

    if (!clientOfflineId) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 clientOfflineId' } }
    }

    if (noParts) {
      // 无需换件模式：需要 fixType + remark + images
      if (!assetId) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少设备ID' } }
      }
      const validFixTypes = ['重启/复位', '简单调整', '清洁维护', '误报/虚报', '其他']
      if (!fixType || !validFixTypes.includes(fixType)) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请选择故障处理类型' } }
      }
      if (!remark || !String(remark).trim()) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: '无需换件时请填写处理说明' } }
      }
      if (!Array.isArray(images) || images.length < 1) {
        return { ok: false, error: { code: 'UPLOAD_REQUIRED', message: '至少上传 1 张照片' } }
      }
    } else {
      // 更换配件模式：原有校验逻辑
      if (!isNonEquipment && (!assetId || !type)) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少必填字段（设备ID和更换类型）' } }
      }
      if (!isNonEquipment && !['维修', '保养', '预防', '紧急'].includes(type)) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: '更换类型无效' } }
      }
      if (!Array.isArray(selectedPartSkuIds) || selectedPartSkuIds.length === 0) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请选择至少 1 个配件' } }
      }
      if (!qtyMap || typeof qtyMap !== 'object') {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少数量信息' } }
      }
      for (const skuId of selectedPartSkuIds) {
        const qty = qtyMap[skuId]
        if (!qty || !Number.isInteger(qty) || qty < 1) {
          return { ok: false, error: { code: 'VALIDATION_FAILED', message: '数量必须为正整数' } }
        }
      }
      if (!isNonEquipment && (!Array.isArray(images) || images.length < 1)) {
        return { ok: false, error: { code: 'UPLOAD_REQUIRED', message: '至少上传 1 张照片' } }
      }
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
    let asset = null
    let location = null
    if (isNonEquipment) {
      asset = { assetId: '', assetName: module === 'facility' ? '厂务' : '锅炉房', assetNo: '', factoryId: user.factoryId || null }
    } else {
      const { data: assets } = await db.collection('assets').where({ assetId, status: 'active' }).limit(1).get()
      if (assets.length === 0) {
        return { ok: false, error: { code: 'ASSET_NOT_FOUND', message: '设备不存在或已停用' } }
      }
      asset = assets[0]

      if (locationId) {
        const { data: locs } = await db.collection('asset_locations').where({ locationId, assetId, active: true }).limit(1).get()
        if (locs.length > 0) {
          location = locs[0]
        }
      }
    }

    // 查配件快照（无需换件时跳过）
    const partsSnapshot = {}
    const safeSkuIds = (noParts || !Array.isArray(selectedPartSkuIds)) ? [] : selectedPartSkuIds
    for (let i = 0; i < safeSkuIds.length; i += 20) {
      const batch = safeSkuIds.slice(i, i + 20)
      const { data: batchParts } = await db.collection('parts').where({ partSkuId: _.in(batch) }).get()
      batchParts.forEach(p => { partsSnapshot[p.partSkuId] = p })
    }

    // ========== 5) 服务端重写 & 写入 ==========
    const yearMonth = getYearMonth(now)
    const logId = `log_${now}_${Math.random().toString(36).slice(2, 8)}`

    const items = safeSkuIds.map(skuId => {
      const part = partsSnapshot[skuId] || {}
      return {
        partSkuId: skuId,
        partNameSnapshot: part.partName || skuId,
        partCodeSnapshot: part.partCode || '',
        qty: (qtyMap && qtyMap[skuId]) || 0
      }
    })

    // factoryId 从设备继承
    const factoryId = asset.factoryId || user.factoryId || null

    const logDoc = {
      logId,
      module,
      factoryId,
      assetId: asset.assetId,
      assetNameSnapshot: asset.assetName,
      assetNoSnapshot: asset.assetNo,
      reporterUserIdSnapshot: user.userId,
      reporterNameSnapshot: user.displayName,
      ts: now,
      yearMonth,
      noParts: !!noParts,
      type: noParts ? '简单处理' : (type || '维修'),
      fixType: noParts ? (fixType || '') : '',
      locationIdSnapshot: locationId || '',
      locationNameSnapshot: location ? location.locationName : '',
      items,
      remark: remark || '',
      images: images || [],
      clientOfflineId,
      createdAt: now
    }

    await db.collection('replacement_logs').add({ data: logDoc })

    // ========== 6) 更新月度用量 & 检查阈值（仅设备模块） ==========
    const createdAlerts = []
    if (isNonEquipment) {
      // 厂务/锅炉房不做月度用量统计和阈值报警，直接跳到库存扣减
    } else {
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
    } // end if (!isNonEquipment) for threshold checks

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

    // ========== 8) 异步发送通知（不阻断主流程） ==========
    try {
      const fmtTime = formatTime(now)

      // 处理通知
      let description
      if (noParts) {
        description = `简单处理（${fixType || '无需换件'}）：${(remark || '').slice(0, 50)}`
      } else {
        const partNames = items.map(i => i.partNameSnapshot).join('、')
        description = `更换${items.length}项配件：${partNames}`
      }
      await cloud.callFunction({
        name: 'sendNotification',
        data: {
          type: 'REPLACEMENT',
          factoryId,
          excludeOpenid: openid,
          data: {
            logId,
            description,
            reporterName: user.displayName,
            assetName: asset.assetName,
            time: fmtTime,
          }
        }
      })

      // 超阈值报警通知
      for (const alertId of createdAlerts) {
        const { data: alertDocs } = await db.collection('alerts').where({ alertId }).limit(1).get()
        if (alertDocs.length > 0) {
          const alert = alertDocs[0]
          await cloud.callFunction({
            name: 'sendNotification',
            data: {
              type: 'THRESHOLD_ALERT',
              factoryId,
              data: {
                factoryName: asset.factoryId || '',
                target: `${alert.assetName} - ${alert.partName}`,
                currentValue: alert.currentQty,
                threshold: alert.thresholdValue,
                time: fmtTime,
              }
            }
          })
        }
      }

      // 低库存报警通知
      for (const warn of inventoryWarnings) {
        if (warn.threshold !== undefined) {
          const partSnap = partsSnapshot[warn.partSkuId] || {}
          await cloud.callFunction({
            name: 'sendNotification',
            data: {
              type: 'LOW_INVENTORY',
              factoryId,
              data: {
                partName: partSnap.partName || warn.partSkuId,
                currentQty: warn.currentQty,
                alertType: '低库存预警',
                time: fmtTime,
                factoryName: factoryId || '',
              }
            }
          })
        }
      }
    } catch (notifyErr) {
      console.warn('通知发送失败（不影响主流程）:', notifyErr.message || notifyErr)
    }

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

function formatTime(ts) {
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
