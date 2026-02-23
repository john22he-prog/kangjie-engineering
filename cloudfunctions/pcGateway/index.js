// 云函数：pcGateway — PC 端统一入口，验证 JWT 后按 action 执行业务
// 调用方：通过 HTTP API 或网关调用，event 需含 { token, action, data }
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function buildTimeQuery(data) {
  if (data.yearMonths === null || data.yearMonths === undefined) {
    if (data.yearMonth) return { yearMonth: data.yearMonth }
    return {}
  }
  if (Array.isArray(data.yearMonths)) {
    if (data.yearMonths.length === 1) return { yearMonth: data.yearMonths[0] }
    if (data.yearMonths.length > 1) return { yearMonth: _.in(data.yearMonths) }
  }
  return {}
}

// ====== 数据库集合自动初始化 ======
const ALL_COLLECTIONS = [
  'users', 'assets', 'parts', 'factories',
  'asset_locations', 'location_part_map', 'asset_part_thresholds',
  'replacement_logs', 'alerts', 'config', 'ai_reports',
  'inventory', 'inventory_inbound_logs', 'inventory_outbound_logs'
]
let _collectionsEnsured = false

async function ensureAllCollections(db) {
  if (_collectionsEnsured) return
  for (const name of ALL_COLLECTIONS) {
    try {
      await db.createCollection(name)
      console.log('Collection created:', name)
    } catch (e) {
      // 集合已存在则忽略
    }
  }
  _collectionsEnsured = true
}

// 优先从环境变量读取 JWT 密钥，生产环境必须配置 JWT_SECRET 环境变量
const JWT_SECRET_ENV = process.env.JWT_SECRET
if (!JWT_SECRET_ENV) {
  console.warn('[pcGateway] 警告：未设置 JWT_SECRET 环境变量，使用默认密钥，请尽快在云函数环境变量中配置！')
}
const JWT_SECRET = JWT_SECRET_ENV || 'kangjie-pc-admin-' + (process.env.TCB_ENV || 'dev') + '-secret'

function base64UrlDecode(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4
  if (pad) b64 += '===='.slice(0, 4 - pad)
  return Buffer.from(b64, 'base64').toString('utf8')
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    const crypto = require('crypto')
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(parts[0] + '.' + parts[1]).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    if (sig !== parts[2]) return null
    return payload
  } catch (e) {
    return null
  }
}

// ====== 业务处理函数 ======

async function getMe(db, userId) {
  const { data: users } = await db.collection('users').where({ userId, status: 'active' }).limit(1).get()
  if (users.length === 0) return { ok: false, error: { code: 'USER_NOT_FOUND', message: '用户不存在或已禁用' } }
  const u = users[0]
  return {
    ok: true,
    data: {
      userId: u.userId,
      displayName: u.displayName || u.username,
      role: u.role,
      status: u.status,
      factoryId: u.factoryId || null,
    },
  }
}

async function loadMe(db, userId) {
  const { data: users } = await db.collection('users').where({ userId }).limit(1).get()
  return users[0] || null
}

async function listReplacementLogs(db, data) {
  const { factoryId, assetId, userId, status, module: moduleFilter, page = 1, pageSize = 20 } = data
  const where = {}
  if (factoryId) where.factoryId = factoryId
  Object.assign(where, buildTimeQuery(data))
  if (assetId) where.assetId = assetId
  if (userId) where.reporterUserIdSnapshot = userId
  if (moduleFilter === 'facility' || moduleFilter === 'boiler') {
    where.module = moduleFilter
  } else if (moduleFilter === 'equipment') {
    where.module = _.or(_.eq('equipment'), _.exists(false))
  }
  if (status === 'active') where.disabled = db.command.neq(true)
  else if (status === 'disabled') where.disabled = true

  const countResult = await db.collection('replacement_logs').where(where).count()
  const total = countResult.total

  const { data: list } = await db.collection('replacement_logs')
    .where(where)
    .orderBy('ts', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  // 为每条记录补充成本数据
  const logIds = list.map(l => l.logId).filter(Boolean)
  let obLogMap = {}
  if (logIds.length > 0) {
    // 查询这些记录关联的出库日志
    for (let i = 0; i < logIds.length; i += 20) {
      const batch = logIds.slice(i, i + 20)
      const { data: obLogs } = await db.collection('inventory_outbound_logs')
        .where({ replacementLogId: _.in(batch) })
        .limit(500)
        .get()
      obLogs.forEach(ob => {
        if (!obLogMap[ob.replacementLogId]) obLogMap[ob.replacementLogId] = []
        obLogMap[ob.replacementLogId].push(ob)
      })
    }
  }

  // 一次性查询全部配件表、库存表、入库日志（避免分批 _.in 的潜在问题）
  const partsMap = {}
  const invMap = {}
  const ibCostMap = {}
  try {
    const { data: allParts } = await db.collection('parts').limit(1000).get()
    allParts.forEach(p => { partsMap[p.partSkuId] = p })
  } catch (e) { console.log('listReplacementLogs: parts query error', e.message) }
  try {
    const invWhere = {}
    if (data.factoryId) invWhere.factoryId = data.factoryId
    const { data: allInv } = await db.collection('inventory').where(invWhere).limit(1000).get()
    allInv.forEach(inv => { invMap[inv.partSkuId] = inv })
  } catch (e) { console.log('listReplacementLogs: inventory query error', e.message) }
  try {
    const ibWhere = {}
    if (data.factoryId) ibWhere.factoryId = data.factoryId
    const { data: ibAll } = await db.collection('inventory_inbound_logs').where(ibWhere).limit(2000).get()
    for (const log of ibAll) {
      if (!ibCostMap[log.partSkuId]) ibCostMap[log.partSkuId] = { totalCost: 0, totalQty: 0 }
      ibCostMap[log.partSkuId].totalCost += (log.totalPrice || (log.qty || 0) * (log.unitPrice || 0))
      ibCostMap[log.partSkuId].totalQty += (log.qty || 0)
    }
  } catch (e) { console.log('listReplacementLogs: inbound_logs query error', e.message) }

  // 辅助函数：获取某配件最优单价（完整回退链）
  function getBestPrice(partSkuId) {
    // 1. 库存表 avgUnitCost（最可靠的加权均价）
    const inv = invMap[partSkuId]
    if (inv && inv.avgUnitCost > 0) return inv.avgUnitCost
    // 2. 入库日志回算均价
    const ibc = ibCostMap[partSkuId]
    if (ibc && ibc.totalQty > 0) return ibc.totalCost / ibc.totalQty
    // 3. 配件表参考单价
    const part = partsMap[partSkuId]
    if (part && part.unitPrice > 0) return part.unitPrice
    return 0
  }

  // 为每条记录的 items 补充成本、编号、型号
  list.forEach(record => {
    const obLogs = obLogMap[record.logId] || []
    const obByPart = {}
    obLogs.forEach(ob => { obByPart[ob.partSkuId] = ob })

    let recordTotalCost = 0

    ;(record.items || []).forEach(item => {
      const part = partsMap[item.partSkuId] || {}
      item.specModelSnapshot = item.specModelSnapshot || part.specModel || ''
      item.unitSnapshot = item.unitSnapshot || part.unit || '个'
      item.partCodeSnapshot = item.partCodeSnapshot || part.partCode || ''

      // 补充成本：完整回退链
      // 1. item 自身有有效成本
      if (item.unitCost > 0 && item.itemCost > 0) {
        // 已有有效成本，使用
      } else {
        // 2. 从出库记录获取
        const ob = obByPart[item.partSkuId]
        if (ob && ob.unitCostAtTime > 0) {
          item.unitCost = ob.unitCostAtTime
          item.itemCost = ob.totalCost || (ob.qty || 0) * ob.unitCostAtTime
        } else {
          // 3. 从库存 avgUnitCost 或配件表 unitPrice 回退
          const bestPrice = getBestPrice(item.partSkuId)
          item.unitCost = bestPrice
          item.itemCost = Math.round((item.qty || 0) * bestPrice * 100) / 100
        }
      }
      recordTotalCost += (item.itemCost || 0)
    })

    record.totalRepairCost = Math.round(recordTotalCost * 100) / 100
  })

  return { ok: true, data: { list, total, page, pageSize } }
}

// ====== PC端提交厂务/锅炉房记录 ======
async function submitFacilityLog(db, data, meUser) {
  const { module, type, selectedPartSkuIds, qtyMap, remark } = data
  if (!['facility', 'boiler'].includes(module)) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: 'module 必须为 facility 或 boiler' } }
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

  const now = Date.now()
  const yearMonth = `${new Date(now).getFullYear()}-${String(new Date(now).getMonth() + 1).padStart(2, '0')}`
  const logId = `log_${now}_${Math.random().toString(36).slice(2, 8)}`
  const factoryId = meUser.factoryId || data.factoryId || null

  const partsSnapshot = {}
  for (let i = 0; i < selectedPartSkuIds.length; i += 20) {
    const batch = selectedPartSkuIds.slice(i, i + 20)
    const { data: batchParts } = await db.collection('parts').where({ partSkuId: _.in(batch) }).get()
    batchParts.forEach(p => { partsSnapshot[p.partSkuId] = p })
  }

  const items = selectedPartSkuIds.map(skuId => {
    const part = partsSnapshot[skuId] || {}
    return {
      partSkuId: skuId,
      partNameSnapshot: part.partName || skuId,
      partCodeSnapshot: part.partCode || '',
      specModelSnapshot: part.specModel || '',
      qty: qtyMap[skuId]
    }
  })

  const moduleLabel = module === 'facility' ? '厂务' : '锅炉房'
  const logDoc = {
    logId,
    module,
    factoryId,
    assetId: '',
    assetNameSnapshot: moduleLabel,
    assetNoSnapshot: '',
    reporterUserIdSnapshot: meUser.userId,
    reporterNameSnapshot: meUser.displayName || '',
    ts: now,
    yearMonth,
    type: type || '维修',
    locationIdSnapshot: '',
    locationNameSnapshot: '',
    items,
    remark: remark || '',
    images: [],
    clientOfflineId: `pc_${logId}`,
    createdAt: now
  }

  await db.collection('replacement_logs').add({ data: logDoc })

  let totalRepairCost = 0
  for (const item of items) {
    const { data: invList } = await db.collection('inventory')
      .where({ factoryId, partSkuId: item.partSkuId })
      .limit(1)
      .get()

    let unitCostAtTime = 0
    if (invList.length > 0) {
      const inv = invList[0]
      unitCostAtTime = inv.avgUnitCost || 0
      const itemCost = item.qty * unitCostAtTime
      item.unitCost = unitCostAtTime
      item.itemCost = Math.round(itemCost * 100) / 100
      totalRepairCost += itemCost

      const newQty = inv.currentQty - item.qty
      await db.collection('inventory').doc(inv._id).update({
        data: {
          currentQty: _.inc(-item.qty),
          totalCostValue: Math.round(Math.max(0, newQty) * inv.avgUnitCost * 100) / 100,
          lastOutboundAt: now,
          updatedAt: now
        }
      })

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
          assetId: '',
          assetNameSnapshot: moduleLabel,
          reporterNameSnapshot: meUser.displayName || '',
          ts: now,
          yearMonth,
          createdAt: now
        }
      })
    }
  }

  totalRepairCost = Math.round(totalRepairCost * 100) / 100
  await db.collection('replacement_logs').where({ logId }).limit(1).get().then(async ({ data: logDocs }) => {
    if (logDocs.length > 0) {
      await db.collection('replacement_logs').doc(logDocs[0]._id).update({
        data: { items, totalRepairCost }
      })
    }
  })

  return { ok: true, data: { logId, yearMonth, totalRepairCost } }
}

// ====== 厂务/锅炉房出库汇总 ======
async function getFacilityOutboundSummary(db, data) {
  const { module } = data
  if (!['facility', 'boiler'].includes(module)) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: 'module 必须为 facility 或 boiler' } }
  }
  const where = { module }
  if (data.factoryId) where.factoryId = data.factoryId
  Object.assign(where, buildTimeQuery(data))

  const queryLimit = data.yearMonths === null ? 5000 : 2000
  const { data: logs } = await db.collection('replacement_logs').where(where).orderBy('ts', 'desc').limit(queryLimit).get()

  let totalQty = 0
  let totalCost = 0
  let totalRecords = logs.length
  const partMap = {}

  logs.forEach(log => {
    (log.items || []).forEach(item => {
      const qty = item.qty || 0
      const cost = item.itemCost || 0
      totalQty += qty
      totalCost += cost
      const key = item.partSkuId
      if (!partMap[key]) {
        partMap[key] = {
          partSkuId: key,
          partName: item.partNameSnapshot || '',
          partCode: item.partCodeSnapshot || '',
          specModel: item.specModelSnapshot || '',
          totalQty: 0,
          totalCost: 0,
        }
      }
      partMap[key].totalQty += qty
      partMap[key].totalCost += cost
    })
  })

  const partList = Object.values(partMap).sort((a, b) => b.totalCost - a.totalCost || b.totalQty - a.totalQty)

  return {
    ok: true,
    data: {
      totalRecords,
      totalQty,
      totalCost: Math.round(totalCost * 100) / 100,
      partList,
    }
  }
}

// ====== 切换更换记录启用/停用状态 ======
async function toggleLogStatus(db, data) {
  const { logId, disabled } = data
  if (!logId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 logId' } }

  const { data: logs } = await db.collection('replacement_logs').where({ logId }).limit(1).get()
  if (logs.length === 0) return { ok: false, error: { code: 'NOT_FOUND', message: '记录不存在' } }

  const newDisabled = disabled === true || disabled === 'true'
  await db.collection('replacement_logs').doc(logs[0]._id).update({
    data: { disabled: newDisabled, disabledAt: newDisabled ? Date.now() : null }
  })

  return { ok: true, data: { logId, disabled: newDisabled } }
}

// ====== 管理员编辑更换记录配件 ======
async function editReplacementLogItems(db, data, meUser) {
  if (!meUser || meUser.role !== 'Admin') {
    return { ok: false, error: { code: 'FORBIDDEN', message: '仅管理员可编辑配件' } }
  }
  const { logId, items } = data
  if (!logId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 logId' } }
  if (!items || !items.length) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '至少需要一个配件' } }

  // 1) 查找原记录
  const { data: logs } = await db.collection('replacement_logs').where({ logId }).limit(1).get()
  if (!logs.length) return { ok: false, error: { code: 'NOT_FOUND', message: '记录不存在' } }
  const log = logs[0]
  const factoryId = log.factoryId
  const yearMonth = log.yearMonth
  const now = Date.now()

  // 2) 撤销旧的库存扣减和出库日志
  const { data: oldOutbounds } = await db.collection('inventory_outbound_logs')
    .where({ replacementLogId: logId }).limit(100).get()
  for (const ob of oldOutbounds) {
    // 恢复库存数量
    try {
      const { data: invList } = await db.collection('inventory')
        .where({ factoryId, partSkuId: ob.partSkuId }).limit(1).get()
      if (invList.length > 0) {
        const inv = invList[0]
        const restoredQty = (inv.currentQty || 0) + (ob.qty || 0)
        await db.collection('inventory').doc(inv._id).update({
          data: {
            currentQty: _.inc(ob.qty || 0),
            totalCostValue: Math.round(restoredQty * (inv.avgUnitCost || 0) * 100) / 100,
            updatedAt: now
          }
        })
      }
    } catch (e) { console.log('restore inventory error', e.message) }
    // 删除旧出库日志
    try {
      await db.collection('inventory_outbound_logs').doc(ob._id).remove()
    } catch (e) {}
  }

  // 3) 查询配件表和库存表
  const partsMap = {}
  try {
    const { data: allParts } = await db.collection('parts').where({ factoryId }).limit(1000).get()
    allParts.forEach(p => { partsMap[p.partSkuId] = p })
  } catch (e) {}
  const invMap = {}
  try {
    const { data: allInv } = await db.collection('inventory').where({ factoryId }).limit(1000).get()
    allInv.forEach(inv => { invMap[inv.partSkuId] = inv })
  } catch (e) {}
  // 入库日志回算均价
  const ibCostMap = {}
  try {
    const { data: ibAll } = await db.collection('inventory_inbound_logs').where({ factoryId }).limit(2000).get()
    for (const l of ibAll) {
      if (!ibCostMap[l.partSkuId]) ibCostMap[l.partSkuId] = { totalCost: 0, totalQty: 0 }
      ibCostMap[l.partSkuId].totalCost += (l.totalPrice || (l.qty || 0) * (l.unitPrice || 0))
      ibCostMap[l.partSkuId].totalQty += (l.qty || 0)
    }
  } catch (e) {}

  function getBestPrice(partSkuId) {
    const inv = invMap[partSkuId]
    if (inv && inv.avgUnitCost > 0) return inv.avgUnitCost
    const ibc = ibCostMap[partSkuId]
    if (ibc && ibc.totalQty > 0) return ibc.totalCost / ibc.totalQty
    const part = partsMap[partSkuId]
    if (part && part.unitPrice > 0) return part.unitPrice
    return 0
  }

  // 4) 处理新配件列表：扣减库存 + 生成出库日志 + 计算成本
  let totalRepairCost = 0
  const newItems = []
  for (const item of items) {
    const part = partsMap[item.partSkuId] || {}
    const unitCost = getBestPrice(item.partSkuId)
    const itemCost = Math.round((item.qty || 0) * unitCost * 100) / 100

    newItems.push({
      partSkuId: item.partSkuId,
      partNameSnapshot: part.partName || item.partNameSnapshot || '',
      partCodeSnapshot: part.partCode || item.partCodeSnapshot || '',
      specModelSnapshot: part.specModel || item.specModelSnapshot || '',
      qty: item.qty || 1,
      unitCost,
      itemCost
    })
    totalRepairCost += itemCost

    // 扣减库存
    const inv = invMap[item.partSkuId]
    if (inv) {
      const newQty = (inv.currentQty || 0) - (item.qty || 0)
      await db.collection('inventory').doc(inv._id).update({
        data: {
          currentQty: _.inc(-(item.qty || 0)),
          totalCostValue: Math.round(Math.max(0, newQty) * (inv.avgUnitCost || 0) * 100) / 100,
          lastOutboundAt: now,
          updatedAt: now
        }
      })
      // 更新 invMap 防止同一配件多次使用时数据不一致
      inv.currentQty = newQty

      // 写出库日志
      const outboundId = `ob_edit_${now}_${item.partSkuId}`
      await db.collection('inventory_outbound_logs').add({
        data: {
          outboundId,
          factoryId,
          partSkuId: item.partSkuId,
          partNameSnapshot: part.partName || '',
          partCodeSnapshot: part.partCode || '',
          qty: item.qty || 0,
          unitCostAtTime: unitCost,
          totalCost: itemCost,
          replacementLogId: logId,
          assetId: log.assetId,
          assetNameSnapshot: log.assetNameSnapshot || '',
          reporterNameSnapshot: meUser.displayName || '',
          ts: log.ts,
          yearMonth,
          createdAt: now,
          editedBy: meUser.userId
        }
      })
    }
  }

  // 5) 更新替换记录
  totalRepairCost = Math.round(totalRepairCost * 100) / 100
  await db.collection('replacement_logs').doc(log._id).update({
    data: {
      items: newItems,
      totalRepairCost,
      editedAt: now,
      editedBy: meUser.userId,
      editNote: `管理员 ${meUser.displayName} 于 ${new Date(now).toLocaleString('zh-CN')} 修改了配件`
    }
  })

  return { ok: true, data: { logId, items: newItems, totalRepairCost } }
}

async function listAlerts(db, data) {
  const { factoryId, status, assetId, page = 1, pageSize = 20 } = data
  const where = {}
  if (factoryId) where.factoryId = factoryId
  if (status) where.status = status
  Object.assign(where, buildTimeQuery(data))
  if (assetId) where.assetId = assetId

  const countResult = await db.collection('alerts').where(where).count()
  const total = countResult.total

  const { data: list } = await db.collection('alerts')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  return { ok: true, data: { list, total, page, pageSize } }
}

async function ackAlert(db, data, meUser) {
  const { alertId, ackNote } = data
  if (!alertId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 alertId' } }

  const { data: alerts } = await db.collection('alerts').where({ alertId }).limit(1).get()
  if (alerts.length === 0) return { ok: false, error: { code: 'ALERT_NOT_FOUND', message: '报警不存在' } }
  if (alerts[0].status !== 'OPEN') return { ok: false, error: { code: 'ALERT_NOT_OPEN', message: '该报警已处理' } }

  await db.collection('alerts').where({ alertId }).update({
    data: {
      status: 'ACK',
      ackByUserId: meUser.userId,
      ackTs: Date.now(),
      ackNote: ackNote || '',
    },
  })
  return { ok: true, data: {} }
}

async function listAssets(db, data) {
  const where = {}
  if (data.factoryId) where.factoryId = data.factoryId

  const { data: list } = await db.collection('assets').where(where).limit(1000).get()
  return { ok: true, data: { list } }
}

async function listParts(db, data) {
  const _ = db.command
  if (data && data.factoryId) {
    // 返回该工厂的配件 + 未分配工厂的配件（兼容迁移前数据）
    const { data: list } = await db.collection('parts')
      .where(_.or([
        { factoryId: data.factoryId },
        { factoryId: _.exists(false) },
        { factoryId: '' },
      ]))
      .limit(1000).get()
    return { ok: true, data: { list } }
  }
  const { data: list } = await db.collection('parts').limit(1000).get()
  return { ok: true, data: { list } }
}

async function listThresholds(db, data) {
  const where = { active: true }
  if (data.assetId) where.assetId = data.assetId

  // 如果传了 factoryId，先查该工厂的设备，再过滤阈值
  let factoryAssetIds = null
  if (data.factoryId && !data.assetId) {
    const { data: factoryAssets } = await db.collection('assets').where({ factoryId: data.factoryId }).field({ assetId: true }).limit(500).get()
    factoryAssetIds = factoryAssets.map(a => a.assetId)
    if (factoryAssetIds.length === 0) return { ok: true, data: { list: [] } }
    where.assetId = db.command.in(factoryAssetIds)
  }

  const { data: list } = await db.collection('asset_part_thresholds').where(where).limit(1000).get()

  if (list.length === 0) return { ok: true, data: { list: [] } }

  // ====== 关联查询：设备名称、配件名称、配件编号 ======
  const assetIds = [...new Set(list.map(t => t.assetId).filter(Boolean))]
  const partSkuIds = [...new Set(list.map(t => t.partSkuId).filter(Boolean))]

  // 查设备
  const assetMap = {}
  if (assetIds.length > 0) {
    for (let i = 0; i < assetIds.length; i += 20) {
      const batch = assetIds.slice(i, i + 20)
      const { data: assets } = await db.collection('assets').where({ assetId: db.command.in(batch) }).limit(100).get()
      assets.forEach(a => { assetMap[a.assetId] = a })
    }
  }

  // 查配件
  const partMap = {}
  if (partSkuIds.length > 0) {
    for (let i = 0; i < partSkuIds.length; i += 20) {
      const batch = partSkuIds.slice(i, i + 20)
      const { data: parts } = await db.collection('parts').where({ partSkuId: db.command.in(batch) }).limit(100).get()
      parts.forEach(p => { partMap[p.partSkuId] = p })
    }
  }

  // ====== 计算当月用量：从 replacement_logs 统计 ======
  const now = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const usageMap = {} // key: "assetId|partSkuId" => qtySum

  try {
    const logWhere = { yearMonth: currentYM }
    if (data.assetId) logWhere.assetId = data.assetId
    const { data: logs } = await db.collection('replacement_logs').where(logWhere).limit(1000).get()
    for (const log of logs) {
      if (!log.items || !Array.isArray(log.items)) continue
      for (const item of log.items) {
        const key = `${log.assetId}|${item.partSkuId}`
        usageMap[key] = (usageMap[key] || 0) + (item.qty || 0)
      }
    }
  } catch (e) {
    console.warn('listThresholds: 查询当月用量失败', e.message)
  }

  // ====== 组装返回数据 ======
  const enrichedList = list.map(t => {
    const asset = assetMap[t.assetId] || {}
    const part = partMap[t.partSkuId] || {}
    const usageKey = `${t.assetId}|${t.partSkuId}`
    return {
      ...t,
      assetName: asset.assetName || t.assetId || '',
      partName: part.partName || '',
      partCode: part.partCode || '',
      currentMonthQty: usageMap[usageKey] || 0,
    }
  })

  return { ok: true, data: { list: enrichedList } }
}

async function upsertThreshold(db, data) {
  const { assetId, partSkuId, thresholdMonthly } = data
  if (!assetId || !partSkuId || thresholdMonthly === undefined) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少必要参数' } }
  }

  const { data: existing } = await db.collection('asset_part_thresholds')
    .where({ assetId, partSkuId })
    .limit(1)
    .get()

  if (existing.length > 0) {
    await db.collection('asset_part_thresholds')
      .where({ assetId, partSkuId })
      .update({ data: { thresholdMonthly, active: true, updatedAt: Date.now() } })
    return { ok: true, data: { thresholdId: existing[0].thresholdId || existing[0]._id } }
  }

  const thresholdId = 'th-' + Date.now()
  await db.collection('asset_part_thresholds').add({
    data: { thresholdId, assetId, partSkuId, thresholdMonthly, active: true, updatedAt: Date.now() },
  })
  return { ok: true, data: { thresholdId } }
}

async function listUsers(db, meUser) {
  const { data: list } = await db.collection('users').limit(1000).get()
  const safe = list.map(u => {
    const { pcPassword, passwordHash, ...rest } = u
    return rest
  })
  return { ok: true, data: { list: safe } }
}

async function createUser(db, data) {
  const { username, displayName, role, factoryId, password, canPcLogin } = data
  if (!username || !displayName || !role) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '用户名、姓名和角色为必填项' } }
  }
  // 检查用户名是否已存在
  const { data: existing } = await db.collection('users').where({ username }).limit(1).get()
  if (existing.length > 0) {
    return { ok: false, error: { code: 'DUPLICATE', message: '用户名已存在' } }
  }
  const userId = 'u-' + Date.now()
  const crypto = require('crypto')
  const hashedPassword = password ? crypto.createHash('sha256').update(password).digest('hex') : ''
  await db.collection('users').add({
    data: {
      userId, username, displayName, role,
      factoryId: factoryId || '',
      pcPassword: hashedPassword,
      canPcLogin: canPcLogin || false,
      status: 'active', openid: '',
      createdAt: Date.now(), updatedAt: Date.now(),
    },
  })
  return { ok: true, data: { userId } }
}

async function updateUser(db, data) {
  const { userId, displayName, role, factoryId, canPcLogin } = data
  if (!userId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 userId' } }
  const updateData = { updatedAt: Date.now() }
  if (displayName !== undefined) updateData.displayName = displayName
  if (role !== undefined) updateData.role = role
  if (factoryId !== undefined) updateData.factoryId = factoryId
  if (canPcLogin !== undefined) updateData.canPcLogin = canPcLogin
  await db.collection('users').where({ userId }).update({ data: updateData })
  return { ok: true, data: {} }
}

async function disableUser(db, data) {
  const { userId } = data
  if (!userId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 userId' } }
  const { data: users } = await db.collection('users').where({ userId }).limit(1).get()
  if (users.length === 0) return { ok: false, error: { code: 'NOT_FOUND', message: '用户不存在' } }
  const newStatus = users[0].status === 'active' ? 'disabled' : 'active'
  await db.collection('users').where({ userId }).update({ data: { status: newStatus, updatedAt: Date.now() } })
  return { ok: true, data: { newStatus } }
}

async function deleteUser(db, data, meUser) {
  const { userId } = data
  if (!userId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 userId' } }
  // 只有管理员可以删除
  if (meUser.role !== 'Admin') return { ok: false, error: { code: 'FORBIDDEN', message: '仅管理员可删除用户' } }
  // 不能删除自己
  if (userId === meUser.userId) return { ok: false, error: { code: 'FORBIDDEN', message: '不能删除自己的账号' } }
  const { data: users } = await db.collection('users').where({ userId }).limit(1).get()
  if (users.length === 0) return { ok: false, error: { code: 'NOT_FOUND', message: '用户不存在' } }
  await db.collection('users').where({ userId }).remove()
  return { ok: true, data: {} }
}

async function unbindOpenid(db, data) {
  const { userId } = data
  if (!userId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 userId' } }
  await db.collection('users').where({ userId }).update({ data: { openid: '', updatedAt: Date.now() } })
  return { ok: true, data: {} }
}

async function listLocations(db, data) {
  const where = {}
  if (data.assetId) where.assetId = data.assetId
  try {
    const { data: list } = await db.collection('asset_locations').where(where).limit(1000).get()
    return { ok: true, data: { list } }
  } catch (e) {
    console.log('listLocations error (collection may not exist):', e.message)
    return { ok: true, data: { list: [] } }
  }
}

async function listLocationPartMap(db, data) {
  const where = { active: true }
  if (data.assetId) where.assetId = data.assetId
  if (data.locationId) where.locationId = data.locationId
  try {
    const { data: list } = await db.collection('location_part_map').where(where).limit(1000).get()
    return { ok: true, data: { list } }
  } catch (e) {
    console.log('listLocationPartMap error (collection may not exist):', e.message)
    return { ok: true, data: { list: [] } }
  }
}

async function getFactories(db, meUser) {
  try {
    if (meUser.factoryId) {
      const { data: list } = await db.collection('factories').where({ factoryId: meUser.factoryId }).limit(100).get()
      return { ok: true, data: { list } }
    }
    if (!meUser.factoryId && meUser.role !== 'Admin') {
      const fullUser = await loadMe(db, meUser.userId)
      if (fullUser && fullUser.factoryId) {
        const { data: list } = await db.collection('factories').where({ factoryId: fullUser.factoryId }).limit(100).get()
        return { ok: true, data: { list } }
      }
    }
    const { data: list } = await db.collection('factories').limit(100).get()
    return { ok: true, data: { list } }
  } catch (e) {
    // 集合不存在时返回空列表
    console.log('getFactories error (collection may not exist):', e.message)
    return { ok: true, data: { list: [] } }
  }
}

async function getDashboardStats(db, data, meUser) {
  const timeQuery = buildTimeQuery(data)
  const yearMonth = data.yearMonth || (data.yearMonths ? null : new Date().toISOString().slice(0, 7))
  if (!timeQuery.yearMonth && yearMonth) timeQuery.yearMonth = yearMonth
  let factoryId = data.factoryId || meUser.factoryId || null

  if (!factoryId && meUser.role !== 'Admin') {
    const fullUser = await loadMe(db, meUser.userId)
    if (fullUser && fullUser.factoryId) factoryId = fullUser.factoryId
  }

  const logWhere = { ...timeQuery }
  const alertWhere = { ...timeQuery }
  if (factoryId) {
    logWhere.factoryId = factoryId
    alertWhere.factoryId = factoryId
  }

  logWhere.disabled = _.neq(true)
  logWhere.module = _.or(_.eq('equipment'), _.exists(false))
  const queryLimit = data.yearMonths === null ? 5000 : 1000
  const { data: logs } = await db.collection('replacement_logs').where(logWhere).limit(queryLimit).get()
  const { data: alerts } = await db.collection('alerts').where(alertWhere).limit(queryLimit).get()

  const openAlerts = alerts.filter(a => a.status === 'OPEN')
  let totalPartsQty = 0
  const partUsageMap = {}
  const assetCountMap = {}

  const engineerMap = {}
  logs.forEach(l => {
    const items = l.items || []
    items.forEach(item => {
      totalPartsQty += item.qty || 0
      if (!partUsageMap[item.partSkuId]) {
        partUsageMap[item.partSkuId] = { partSkuId: item.partSkuId, partName: item.partNameSnapshot || '', partCode: item.partCodeSnapshot || '', totalQty: 0 }
      }
      partUsageMap[item.partSkuId].totalQty += item.qty || 0
      if (!partUsageMap[item.partSkuId].partName && item.partNameSnapshot) {
        partUsageMap[item.partSkuId].partName = item.partNameSnapshot
      }
    })
    if (!assetCountMap[l.assetId]) {
      assetCountMap[l.assetId] = { assetId: l.assetId, assetName: l.assetNameSnapshot, assetNo: l.assetNoSnapshot, logCount: 0 }
    }
    assetCountMap[l.assetId].logCount++
    const reporterId = l.reporterUserIdSnapshot || l.userId
    const reporterName = l.reporterNameSnapshot || '未知'
    if (reporterId) {
      if (!engineerMap[reporterId]) engineerMap[reporterId] = { userId: reporterId, name: reporterName, logCount: 0 }
      engineerMap[reporterId].logCount++
    }
  })

  // partName 仍为空的条目，回查 parts 集合补名称
  const missingNameIds = Object.values(partUsageMap).filter(p => !p.partName).map(p => p.partSkuId)
  if (missingNameIds.length > 0) {
    for (let i = 0; i < missingNameIds.length; i += 20) {
      const batch = missingNameIds.slice(i, i + 20)
      const { data: batchParts } = await db.collection('parts').where({ partSkuId: _.in(batch) }).get()
      batchParts.forEach(p => {
        if (partUsageMap[p.partSkuId]) {
          partUsageMap[p.partSkuId].partName = p.partName
          if (!partUsageMap[p.partSkuId].partCode) partUsageMap[p.partSkuId].partCode = p.partCode
        }
      })
    }
    Object.values(partUsageMap).forEach(p => {
      if (!p.partName) p.partName = p.partSkuId
    })
  }

  const topParts = Object.values(partUsageMap).sort((a, b) => b.totalQty - a.totalQty).slice(0, 5)
  const topAssets = Object.values(assetCountMap).sort((a, b) => b.logCount - a.logCount).slice(0, 5)
  const engineerWorkload = Object.values(engineerMap).sort((a, b) => b.logCount - a.logCount)

  // 趋势数据：月模式按最近7天、其他模式按月聚合
  const dailyTrend = []
  const isSingleMonth = !data.yearMonths || (Array.isArray(data.yearMonths) && data.yearMonths.length === 1)
  if (isSingleMonth) {
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const label = (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0')
      const count = logs.filter(l => {
        if (!l.ts) return false
        const logDate = new Date(l.ts).toISOString().slice(0, 10)
        return logDate === dateStr
      }).length
      dailyTrend.push({ date: dateStr, label, count })
    }
  } else {
    const monthMap = {}
    logs.forEach(l => {
      const ym = l.yearMonth || (l.ts ? new Date(l.ts).toISOString().slice(0, 7) : null)
      if (ym) {
        if (!monthMap[ym]) monthMap[ym] = 0
        monthMap[ym]++
      }
    })
    const sortedMonths = Object.keys(monthMap).sort()
    sortedMonths.forEach(ym => {
      dailyTrend.push({ date: ym, label: ym, count: monthMap[ym] })
    })
  }

  // 报警设备分布（仅 OPEN 状态）
  const alertAssetMap = {}
  openAlerts.forEach(a => {
    if (!alertAssetMap[a.assetId]) {
      alertAssetMap[a.assetId] = {
        assetId: a.assetId,
        assetName: a.assetNameSnapshot || a.assetName || a.assetId,
        workshop: a.workshop || '',
        openCount: 0,
      }
    }
    alertAssetMap[a.assetId].openCount++
  })
  const alertsByAsset = Object.values(alertAssetMap).sort((a, b) => b.openCount - a.openCount)

  return {
    ok: true,
    data: {
      yearMonth: yearMonth || (data.yearMonths ? data.yearMonths.join(',') : ''),
      totalLogs: logs.length,
      totalPartsQty,
      openAlerts: openAlerts.length,
      totalAlerts: alerts.length,
      topParts,
      topAssets,
      engineerWorkload,
      dailyTrend,
      alertsByAsset,
      trendMode: isSingleMonth ? 'daily' : 'monthly',
    },
  }
}

// ====== 设备管理 ======

async function createAsset(db, data) {
  const { assetName, assetNo, deviceTypeId, workshop, factoryId } = data
  if (!assetName || !assetNo) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '设备名称和编号为必填项' } }
  }
  const assetId = data.assetId || ('ZB-' + Date.now())
  const { data: existing } = await db.collection('assets').where({ assetId }).limit(1).get()
  if (existing.length > 0) {
    // 重复时自动覆盖更新
    await db.collection('assets').where({ assetId }).update({
      data: {
        assetName, assetNo,
        deviceTypeId: deviceTypeId || '',
        workshop: workshop || '',
        factoryId: factoryId || '',
        updatedAt: Date.now(),
      },
    })
    return { ok: true, data: { assetId, updated: true } }
  }
  await db.collection('assets').add({
    data: {
      assetId, assetName, assetNo,
      deviceTypeId: deviceTypeId || '',
      workshop: workshop || '',
      factoryId: factoryId || '',
      status: 'active',
      createdAt: Date.now(), updatedAt: Date.now(),
    },
  })
  return { ok: true, data: { assetId } }
}

async function updateAsset(db, data) {
  const { assetId, assetName, assetNo, deviceTypeId, workshop, factoryId } = data
  if (!assetId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 assetId' } }
  const updateData = { updatedAt: Date.now() }
  if (assetName !== undefined) updateData.assetName = assetName
  if (assetNo !== undefined) updateData.assetNo = assetNo
  if (deviceTypeId !== undefined) updateData.deviceTypeId = deviceTypeId
  if (workshop !== undefined) updateData.workshop = workshop
  if (factoryId !== undefined) updateData.factoryId = factoryId
  await db.collection('assets').where({ assetId }).update({ data: updateData })
  return { ok: true, data: {} }
}

async function setAssetStatus(db, data) {
  const { assetId, status } = data
  if (!assetId || !status) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少参数' } }
  await db.collection('assets').where({ assetId }).update({ data: { status, updatedAt: Date.now() } })
  return { ok: true, data: {} }
}

// ====== 部位管理 ======

async function upsertLocation(db, data) {
  const { assetId, locationName, locationId, sortOrder } = data
  if (!assetId || !locationName) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '设备ID和部位名称为必填项' } }
  }
  await ensureCollection(db, 'asset_locations')
  if (locationId) {
    // 更新
    const updateData = { locationName, updatedAt: Date.now() }
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder
    await db.collection('asset_locations').where({ locationId }).update({
      data: updateData,
    })
    return { ok: true, data: { locationId } }
  }
  // 查找是否已存在同名部位
  try {
    const { data: existing } = await db.collection('asset_locations')
      .where({ assetId, locationName }).limit(1).get()
    if (existing.length > 0) {
      return { ok: true, data: { locationId: existing[0].locationId || existing[0]._id } }
    }
  } catch (e) {
    console.log('upsertLocation check existing:', e.message)
  }
  // 新建
  const newId = 'loc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  await db.collection('asset_locations').add({
    data: { locationId: newId, assetId, locationName, sortOrder: sortOrder || 1, active: true, createdAt: Date.now(), updatedAt: Date.now() },
  })
  return { ok: true, data: { locationId: newId } }
}

async function deleteLocation(db, data) {
  const { locationId } = data
  if (!locationId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 locationId' } }
  await db.collection('asset_locations').where({ locationId }).remove()
  // 同时删除该部位下的配件映射
  await db.collection('location_part_map').where({ locationId }).remove()
  return { ok: true, data: {} }
}

async function copyLocations(db, data) {
  const { fromAssetId, toAssetId } = data
  if (!fromAssetId || !toAssetId) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少参数' } }
  }
  const { data: srcLocations } = await db.collection('asset_locations').where({ assetId: fromAssetId }).limit(1000).get()
  let count = 0
  for (const loc of srcLocations) {
    const newLocId = 'loc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
    await db.collection('asset_locations').add({
      data: { locationId: newLocId, assetId: toAssetId, locationName: loc.locationName, createdAt: Date.now(), updatedAt: Date.now() },
    })
    // 复制该部位下的配件映射
    const { data: maps } = await db.collection('location_part_map').where({ locationId: loc.locationId || loc._id, active: true }).limit(1000).get()
    for (const m of maps) {
      await db.collection('location_part_map').add({
        data: {
          mapId: 'lpm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          assetId: toAssetId, locationId: newLocId,
          partSkuId: m.partSkuId, partName: m.partName || '',
          active: true, createdAt: Date.now(),
        },
      })
    }
    count++
  }
  return { ok: true, data: { copiedCount: count } }
}

// ====== 部位-配件映射 ======

async function upsertLocationPartMap(db, data) {
  const { assetId, locationId, partSkuId, partName, mapId } = data
  if (!assetId || !locationId || !partSkuId) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少必要参数' } }
  }
  await ensureCollection(db, 'location_part_map')
  if (mapId) {
    await db.collection('location_part_map').where({ mapId }).update({
      data: { partSkuId, partName: partName || '', active: true, updatedAt: Date.now() },
    })
    return { ok: true, data: { mapId } }
  }
  // 检查是否已存在
  try {
    const { data: existing } = await db.collection('location_part_map')
      .where({ assetId, locationId, partSkuId, active: true }).limit(1).get()
    if (existing.length > 0) {
      return { ok: true, data: { mapId: existing[0].mapId || existing[0]._id } }
    }
  } catch (e) {
    console.log('upsertLocationPartMap check existing:', e.message)
  }
  const newId = 'lpm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  await db.collection('location_part_map').add({
    data: {
      mapId: newId, assetId, locationId, partSkuId,
      partName: partName || '', active: true,
      createdAt: Date.now(), updatedAt: Date.now(),
    },
  })
  return { ok: true, data: { mapId: newId } }
}

async function deleteLocationPartMap(db, data) {
  const { mapId } = data
  if (!mapId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 mapId' } }
  await db.collection('location_part_map').where({ mapId }).update({ data: { active: false, updatedAt: Date.now() } })
  return { ok: true, data: {} }
}

// ====== 配件管理 ======

async function createPart(db, data) {
  const { partCode, partName, specModel, unit, unitPrice, category, factoryId } = data
  if (!partCode || !partName) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '配件编号和名称为必填项' } }
  }
  // 同工厂下检查重复
  const dupWhere = { partCode }
  if (factoryId) dupWhere.factoryId = factoryId
  const { data: existing } = await db.collection('parts').where(dupWhere).limit(1).get()
  if (existing.length > 0) {
    // 重复时自动覆盖更新
    await db.collection('parts').where(dupWhere).update({
      data: {
        partName,
        specModel: specModel || '', unit: unit || '个',
        unitPrice: unitPrice || 0, category: category || '',
        active: true, updatedAt: Date.now(),
      },
    })
    return { ok: true, data: { partSkuId: existing[0].partSkuId || existing[0]._id, updated: true } }
  }
  const partSkuId = data.partSkuId || ('PSK-' + Date.now())
  await db.collection('parts').add({
    data: {
      partSkuId, partCode, partName,
      factoryId: factoryId || '',
      specModel: specModel || '', unit: unit || '个',
      unitPrice: unitPrice || 0, category: category || '',
      active: true, createdAt: Date.now(), updatedAt: Date.now(),
    },
  })
  return { ok: true, data: { partSkuId } }
}

// ====== 获取云存储文件临时URL ======
async function getFileUrls(data) {
  const { fileIds } = data
  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return { ok: true, data: { fileList: [] } }
  }
  try {
    const result = await cloud.getTempFileURL({ fileList: fileIds })
    return { ok: true, data: { fileList: result.fileList } }
  } catch (err) {
    console.error('getTempFileURL 失败:', err)
    return { ok: false, error: { code: 'FILE_URL_ERROR', message: '获取文件URL失败: ' + err.message } }
  }
}

// ====== 配件清理：重命名+去重 ======
async function cleanupParts(db, data) {
  const where = {}
  if (data && data.factoryId) where.factoryId = data.factoryId
  const { data: allParts } = await db.collection('parts').where(where).limit(2000).get()
  if (allParts.length === 0) return { ok: true, data: { message: '配件字典为空', renamed: 0, deleted: 0 } }

  // 按 partName 分组
  const groups = {}
  for (const p of allParts) {
    const name = (p.partName || '').trim()
    if (!name) continue
    if (!groups[name]) groups[name] = []
    groups[name].push(p)
  }

  let renamedCount = 0
  let deletedCount = 0
  const renamedList = []
  const deletedList = []

  for (const [name, items] of Object.entries(groups)) {
    if (items.length <= 1) continue

    // 判断每个 item 的"规格"信息
    // specModel 或 unit 中可能包含规格型号
    // 有些 Excel 数据把 规格型号 和 单位 搞反了，需要智能判断
    const UNIT_WORDS = ['个', '条', '根', '米', '套', '把', '片', '只', '台', '块', '件', '卷', '瓶', '组', '付', '幅', '公斤', 'kg', 'm']

    function getSpec(p) {
      // specModel 字段
      let spec = (p.specModel || '').trim()
      // 如果 specModel 看起来像单位（个、米等），那真正的规格可能在 unit 字段
      if (spec && UNIT_WORDS.includes(spec.toLowerCase())) {
        // specModel 是单位，真正的规格可能在 unit 里
        const altSpec = (p.unit || '').trim()
        if (altSpec && !UNIT_WORDS.includes(altSpec.toLowerCase())) {
          return altSpec
        }
        return ''
      }
      if (spec) return spec
      // specModel 为空，检查 unit 是否包含规格信息
      const unitVal = (p.unit || '').trim()
      if (unitVal && !UNIT_WORDS.includes(unitVal.toLowerCase()) && unitVal.length > 2) {
        return unitVal
      }
      return ''
    }

    function getRealUnit(p) {
      const spec = (p.specModel || '').trim()
      const unit = (p.unit || '').trim()
      if (UNIT_WORDS.includes(spec.toLowerCase())) return spec
      if (UNIT_WORDS.includes(unit.toLowerCase())) return unit
      return unit || spec || ''
    }

    // 检查是否存在不同规格
    const specSet = new Set()
    for (const p of items) {
      specSet.add(getSpec(p))
    }

    if (specSet.size > 1 || (specSet.size === 1 && !specSet.has(''))) {
      // 有不同规格：重命名为 "名称-规格"
      for (const p of items) {
        const spec = getSpec(p)
        if (spec) {
          const newName = name + '-' + spec
          if (newName !== p.partName) {
            const realUnit = getRealUnit(p)
            const updateData = { partName: newName, updatedAt: Date.now() }
            // 修正 specModel 和 unit
            if (spec !== (p.specModel || '').trim()) {
              updateData.specModel = spec
            }
            if (realUnit && realUnit !== (p.unit || '').trim()) {
              updateData.unit = realUnit
            }
            await db.collection('parts').doc(p._id).update({ data: updateData })
            renamedList.push({ from: p.partName, to: newName, partCode: p.partCode })
            renamedCount++
          }
        }
      }

      // 重命名后再检查是否有完全重复的（名称+规格都一样）
      const seen = new Set()
      for (const p of items) {
        const spec = getSpec(p)
        const newName = spec ? name + '-' + spec : name
        const key = newName + '||' + spec
        if (seen.has(key)) {
          // 真正的重复，删除
          await db.collection('parts').doc(p._id).update({ data: { active: false, updatedAt: Date.now() } })
          deletedList.push({ partName: newName, partCode: p.partCode })
          deletedCount++
        } else {
          seen.add(key)
        }
      }
    } else {
      // 所有 items 都没有规格区分——真正的重复
      // 保留第一个，标记其余为 inactive
      for (let i = 1; i < items.length; i++) {
        await db.collection('parts').doc(items[i]._id).update({ data: { active: false, updatedAt: Date.now() } })
        deletedList.push({ partName: items[i].partName, partCode: items[i].partCode })
        deletedCount++
      }
    }
  }

  return {
    ok: true,
    data: {
      totalParts: allParts.length,
      renamed: renamedCount,
      deleted: deletedCount,
      renamedList: renamedList.slice(0, 50),
      deletedList: deletedList.slice(0, 50),
    }
  }
}

async function updatePart(db, data) {
  const { partSkuId, partName, specModel, unit, unitPrice, category, active } = data
  if (!partSkuId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 partSkuId' } }
  const updateData = { updatedAt: Date.now() }
  if (partName !== undefined) updateData.partName = partName
  if (specModel !== undefined) updateData.specModel = specModel
  if (unit !== undefined) updateData.unit = unit
  if (unitPrice !== undefined) updateData.unitPrice = unitPrice
  if (category !== undefined) updateData.category = category
  if (active !== undefined) updateData.active = active
  await db.collection('parts').where({ partSkuId }).update({ data: updateData })

  const snapshotUpdate = {}
  if (partName !== undefined) snapshotUpdate.partNameSnapshot = partName
  if (specModel !== undefined) snapshotUpdate.specModelSnapshot = specModel
  if (unit !== undefined) snapshotUpdate.unitSnapshot = unit
  if (Object.keys(snapshotUpdate).length > 0) {
    snapshotUpdate.updatedAt = Date.now()
    await db.collection('inventory').where({ partSkuId }).update({ data: snapshotUpdate })
  }

  return { ok: true, data: {} }
}

// ====== 删除配件（仅管理员） ======
async function deletePart(db, data, meUser) {
  if (!meUser || meUser.role !== 'Admin') {
    return { ok: false, error: { code: 'FORBIDDEN', message: '仅管理员可删除配件' } }
  }
  const { partSkuId } = data
  if (!partSkuId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 partSkuId' } }

  // 检查是否有关联的更换记录（未禁用的）
  try {
    const { data: repLogs } = await db.collection('replacement_logs')
      .where({ 'items.partSkuId': partSkuId, disabled: db.command.neq(true) })
      .limit(1).get()
    if (repLogs.length > 0) {
      return { ok: false, error: { code: 'IN_USE', message: '该配件存在关联的更换记录，无法删除。可选择「编辑」将其停用。' } }
    }
  } catch (e) { /* 查询失败不阻止删除 */ }

  // 检查是否有库存（数量 > 0）
  try {
    const { data: invList } = await db.collection('inventory')
      .where({ partSkuId }).limit(1).get()
    if (invList.length > 0 && invList[0].currentQty > 0) {
      return { ok: false, error: { code: 'HAS_STOCK', message: `该配件尚有库存 ${invList[0].currentQty} ${invList[0].unit || '个'}，请先清零库存再删除。` } }
    }
    // 库存为0时，同步删除库存记录
    if (invList.length > 0) {
      await db.collection('inventory').doc(invList[0]._id).remove()
    }
  } catch (e) { /* ignore */ }

  // 删除配件本身
  const { stats } = await db.collection('parts').where({ partSkuId }).remove()
  if (stats.removed === 0) {
    return { ok: false, error: { code: 'NOT_FOUND', message: '配件不存在' } }
  }

  // 清理关联的部位-配件映射
  try {
    await db.collection('location_part_map').where({ partSkuId }).remove()
  } catch (e) { /* ignore */ }

  return { ok: true, data: { partSkuId, removed: stats.removed } }
}

// ====== 批量停用/启用配件（仅管理员） ======
async function batchSetPartsActive(db, data, meUser) {
  if (!meUser || meUser.role !== 'Admin') {
    return { ok: false, error: { code: 'FORBIDDEN', message: '仅管理员可停用/启用配件' } }
  }
  const { partSkuIds, active } = data
  if (!Array.isArray(partSkuIds) || partSkuIds.length === 0) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请选择至少一个配件' } }
  }
  if (typeof active !== 'boolean') {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 active 参数' } }
  }
  const ids = [...new Set(partSkuIds.filter(Boolean))]
  const { stats } = await db.collection('parts')
    .where({ partSkuId: db.command.in(ids) })
    .update({ data: { active, updatedAt: Date.now() } })
  return { ok: true, data: { requested: ids.length, updated: stats.updated || 0, active } }
}

// ====== 批量删除配件（仅管理员） ======
async function batchDeleteParts(db, data, meUser) {
  if (!meUser || meUser.role !== 'Admin') {
    return { ok: false, error: { code: 'FORBIDDEN', message: '仅管理员可删除配件' } }
  }
  const { partSkuIds } = data
  if (!Array.isArray(partSkuIds) || partSkuIds.length === 0) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请选择至少一个配件' } }
  }
  const ids = [...new Set(partSkuIds.filter(Boolean))]
  let deleted = 0
  const errors = []
  for (const partSkuId of ids) {
    const res = await deletePart(db, { partSkuId }, meUser)
    if (res.ok) deleted++
    else errors.push({ partSkuId, message: res.error?.message || '删除失败' })
  }
  return {
    ok: true,
    data: {
      requested: ids.length,
      deleted,
      failed: errors.length,
      errors: errors.slice(0, 50),
    },
  }
}

async function importPartsPreview(db, data) {
  // 预览导入配件数据（不写入数据库），用 pickPartRow 解析任意表头
  const { rows } = data
  if (!rows || !Array.isArray(rows)) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '数据格式错误' } }
  }
  const errors = []
  const valid = []
  rows.forEach((row, idx) => {
    const lineNo = idx + 2
    const picked = pickPartRow(row)
    if (!picked.partCode || !picked.partName) {
      errors.push({ line: lineNo, msg: '配件编号和名称为必填项' })
    } else {
      valid.push({
        partCode: picked.partCode,
        partName: picked.partName,
        unit: picked.unit,
        specModel: picked.specModel,
        partSkuId: picked.partSkuId || ('PSK-' + picked.partCode),
      })
    }
  })
  return { ok: true, data: { validRows: valid, valid: valid.length, errors, totalRows: rows.length } }
}

// 从一行数据中统一取出所有字段（兼容中文表头、带换行表头如 "名称\nName"）
function pickPartRow(row) {
  const val = (v) => (v != null && v !== '') ? String(v).trim() : ''
  let code = val(row.partCode ?? row['配件编号'] ?? row['编号'])
  let name = val(row.partName ?? row['配件名称'] ?? row['名称'])
  let unit = val(row.unit ?? row['单位'])
  let spec = val(row.specModel ?? row['规格'] ?? row['规格型号'])
  let sku = val(row.partSkuId ?? row['SKU ID'] ?? row['配件SKU-ID'] ?? row['SKU-ID'])
  for (const k of Object.keys(row)) {
    const v = row[k]
    if (v == null || v === '') continue
    const s = String(v).trim()
    if (!s) continue
    const t = k.trim()
    if (!code && (t === '编号' || t.startsWith('编号') || t.includes('Part No'))) code = s
    if (!name && (t === '名称' || t.startsWith('名称') || t.includes('Part Name'))) name = s
    if (!unit && (t === '单位' || t.startsWith('单位') || t.includes('Unit'))) unit = s
    if (!spec && (t === '规格' || t.startsWith('规格') || t.includes('Spec'))) spec = s
    if (!sku && (t === 'SKU ID' || t.startsWith('SKU') || t.includes('SKU'))) sku = s
  }
  return { partCode: code, partName: name, unit: unit || '个', specModel: spec, partSkuId: sku }
}

async function importPartsCommit(db, data) {
  const { rows, factoryId } = data
  if (!rows || !Array.isArray(rows)) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '数据格式错误' } }
  }
  let created = 0, skipped = 0, skippedEmpty = 0, skippedDup = 0
  for (const row of rows) {
    const picked = pickPartRow(row)
    if (!picked.partCode || !picked.partName) {
      skipped++
      skippedEmpty++
      continue
    }
    const dupWhere = { partCode: picked.partCode }
    if (factoryId) dupWhere.factoryId = factoryId
    const { data: existing } = await db.collection('parts').where(dupWhere).limit(1).get()
    if (existing.length > 0) {
      skipped++
      skippedDup++
      continue
    }
    const partSkuId = picked.partSkuId || ('PSK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 4))
    await db.collection('parts').add({
      data: {
        partSkuId, partCode: picked.partCode, partName: picked.partName,
        factoryId: factoryId || '',
        specModel: picked.specModel,
        unit: picked.unit,
        unitPrice: row.unitPrice || 0, category: (row.category && String(row.category).trim()) || '',
        active: true, source: 'Excel', createdAt: Date.now(), updatedAt: Date.now(),
      },
    })
    created++
  }
  const message = skipped > 0 && created === 0
    ? `全部跳过。其中：缺少编号/名称 ${skippedEmpty} 条，编号已存在 ${skippedDup} 条。请检查 Excel 表头是否与「编号、名称、单位」对应，或先清空配件再导入。`
    : null
  return { ok: true, data: { created, skipped, skippedEmpty, skippedDup, message } }
}

// ====== 配件工厂迁移 ======
async function migratePartsToFactory(db, data) {
  let { factoryId } = data
  
  // 如果没指定工厂ID，可以通过工厂名称查找
  if (!factoryId && data.factoryName) {
    const { data: factories } = await db.collection('factories').where({ factoryName: data.factoryName }).limit(1).get()
    if (factories.length > 0) factoryId = factories[0].factoryId
  }
  
  // 如果还没有，取第一个工厂
  if (!factoryId) {
    const { data: factories } = await db.collection('factories').limit(1).get()
    if (factories.length > 0) factoryId = factories[0].factoryId
  }
  
  if (!factoryId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '找不到目标工厂' } }
  
  // 查找所有没有 factoryId 的配件
  const _ = db.command
  const { data: parts } = await db.collection('parts')
    .where(_.or([
      { factoryId: _.exists(false) },
      { factoryId: '' },
    ]))
    .limit(2000)
    .get()
  
  if (parts.length === 0) return { ok: true, data: { migrated: 0, factoryId, message: '没有需要迁移的配件' } }
  
  let migrated = 0
  for (const p of parts) {
    await db.collection('parts').doc(p._id).update({ data: { factoryId, updatedAt: Date.now() } })
    migrated++
  }
  
  // 查工厂名称
  let factoryName = factoryId
  try {
    const { data: fList } = await db.collection('factories').where({ factoryId }).limit(1).get()
    if (fList.length > 0) factoryName = fList[0].factoryName
  } catch (e) { /* ignore */ }
  
  return { ok: true, data: { migrated, factoryId, factoryName, message: `已将 ${migrated} 个配件分配到「${factoryName}」` } }
}

// ====== 阈值管理扩展 ======

async function batchUpsertThresholds(db, data) {
  const { items } = data
  if (!items || !Array.isArray(items)) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '数据格式错误' } }
  }
  let upserted = 0
  for (const item of items) {
    const result = await upsertThreshold(db, item)
    if (result.ok) upserted++
  }
  return { ok: true, data: { upserted } }
}

async function deleteThreshold(db, data) {
  const { thresholdId } = data
  if (!thresholdId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 thresholdId' } }
  await db.collection('asset_part_thresholds').where({ thresholdId }).update({ data: { active: false, updatedAt: Date.now() } })
  return { ok: true, data: {} }
}

// ====== AI 配置 & 报告 ======

const DEFAULT_AI_MODELS = [
  'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-mini',
  'gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-flash', 'gemini-1.5-pro',
  'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022',
  'deepseek-chat', 'deepseek-reasoner',
  'qwen-turbo', 'qwen-plus', 'qwen-max',
  'glm-4-flash', 'glm-4-plus',
  'moonshot-v1-8k', 'moonshot-v1-32k',
  'ernie-4.0-turbo-8k',
  'yi-lightning',
  'doubao-1.5-pro-32k',
  'spark-max',
]

const DEFAULT_AI_PROMPTS = {
  monthly_summary: {
    name: '月度总结',
    content: `你是一名服务于洗涤行业的资深设备维保高级分析师，拥有15年工业设备全生命周期管理经验。现在需要你根据提供的数据，生成一份**月度设备维保综合分析报告**。

这份报告将同时呈送给三个层级的管理者，请严格按照以下结构输出：

---

# 📊 月度设备维保分析报告

## 一、管理层摘要（呈：总经理/老板）
> 用3-5句话概括本月整体状况，重点突出：总投入成本、设备整体可用率评估、与上月的核心变化、是否存在需要管理层决策的重大事项。语言简洁有力，突出数字和结论。

## 二、运营分析概览（呈：高管/运营总监）
请包含以下小节：
### 2.1 关键指标仪表盘
用表格呈现：本月值、上月值、环比变化率（更换次数、配件消耗量、紧急维修占比、使用成本、待处理报警数）。对异常指标用 ⚠️ 标注。

### 2.2 趋势判断与风险预警
- 分析更换次数和配件消耗的变化趋势是上升/稳定/下降
- 识别可能影响生产连续性的风险点
- 评估当前维保策略（预防性 vs 被动性）的执行效果

### 2.3 跨维度对比（如有多工厂数据）
各工厂/车间的横向对比分析，识别管理水平差异

## 三、详细技术分析（呈：工程部主管）
### 3.1 设备故障热点分析
- 列出 TOP 故障设备，分析故障模式（频发部位、故障类型）
- 紧急维修占比分析，识别需要制定专项维保计划的设备
- 给出每台重点设备的具体处置建议（加强巡检/安排大修/建议更换）

### 3.2 配件消耗深度分析
- TOP 消耗配件排名及用量变化
- 识别异常消耗（某配件突然大幅增加的原因推测）
- 配件库存预警与采购建议

### 3.3 人员工作负荷分析
- 工程师工作量分布是否均衡
- 是否存在人员瓶颈或闲置

### 3.4 下月工作建议
- 列出3-5条**具体可执行**的改进措施，标明优先级（高/中/低）
- 建议格式：措施内容 + 预期效果 + 负责人建议 + 完成时限

---

**输出要求：**
- 全部使用中文
- 使用 Markdown 格式，合理运用表格、加粗、列表、引用块
- 数据分析必须引用实际数字，不要泛泛而谈
- 对比分析要给出百分比变化
- 建议要具体到可执行层面，避免空话套话
- 如果数据量不足（如本月为0），请如实说明并给出数据积累建议`,
  },
  device_analysis: {
    name: '设备分析',
    content: `你是一名持有国际设备可靠性工程师（CRE）资质的设备健康管理专家，专注于洗涤行业工业设备的可靠性分析与预测性维护。请根据提供的数据，生成一份**设备健康状态深度分析报告**。

报告面向三个层级管理者，请按以下结构输出：

---

# 🔧 设备健康状态分析报告

## 一、设备总体健康评估（呈：总经理/老板）
> 用交通灯模型（🟢正常/🟡关注/🔴警告）对设备群整体状态做一句话定性评估。说明：是否有设备面临停产风险？是否需要追加维修预算或设备更新投资？

## 二、设备可靠性分析（呈：高管/运营总监）
### 2.1 设备可用性指标
用表格展示各设备本月故障次数、紧急维修次数、紧急维修占比。计算设备可靠性排名。

### 2.2 设备分级管理建议
根据故障频率和影响程度，将设备分为：
- **A类（重点关注）**：故障频发或紧急维修占比>30%的设备
- **B类（常规管理）**：运行基本正常的设备
- **C类（状态良好）**：本月无故障或仅有预防性维护

### 2.3 设备更新/大修投资建议
如果有设备反复故障，评估继续维修 vs 更换设备的经济性

## 三、技术诊断明细（呈：工程部主管）
### 3.1 逐设备故障分析
对 TOP 故障设备逐一分析：
- 故障频次及趋势（与上月对比）
- 主要消耗配件及更换部位
- 故障根因推测（设备老化/操作不当/配件质量/维护不足）
- 是否存在关联故障（一个部位坏导致连锁故障）

### 3.2 预防性维护执行评估
- 预防性维修 vs 紧急维修的比例分析
- 评估当前巡检制度是否到位
- 建议优化维保周期的具体设备

### 3.3 报警响应分析
- 待处理报警统计及分布
- 报警设备是否与高故障设备重叠（说明维保前置不足）

### 3.4 下月设备维保计划建议
用表格输出：设备名称 | 建议措施 | 优先级 | 预计工时 | 所需配件

---

**输出要求：**
- 全部使用中文，Markdown 格式
- 必须基于实际数据分析，引用具体数字
- 设备评估要客观，给出依据
- 维保建议要可落地执行
- 如果某设备数据不足以判断，请标注"数据不足，建议持续监控"`,
  },
  cost_analysis: {
    name: '成本分析',
    content: `你是一名拥有注册管理会计师（CMA）背景的工业维保成本控制专家，擅长从财务视角分析设备维护投入产出。请根据提供的数据，生成一份**维保成本深度分析报告**。

报告面向三个层级管理者，请按以下结构输出：

---

# 💰 设备维保成本分析报告

## 一、成本总览与决策建议（呈：总经理/老板）
> 用2-3句话概括：本月维保总支出、环比变化、是否在合理区间。明确回答：钱花得值不值？哪里可以省？是否需要追加预算？

### 关键财务指标
用表格呈现：本月维保总成本、环比变化、配件成本占比、单设备平均维保成本、紧急维修成本占比。

## 二、成本结构与效率分析（呈：高管/运营总监）
### 2.1 成本构成分析
- 按配件分类的成本占比（饼图描述）
- 按设备分类的成本占比
- 按维修类型的成本占比（维修/预防/紧急）

### 2.2 成本趋势与异常识别
- 与上月对比：哪些配件/设备的成本异常增长？增长原因推测
- 紧急维修成本占比分析（紧急维修通常成本更高）
- 是否存在"重复花钱"现象（同一设备同一部位反复维修）

### 2.3 成本效率评估
- 预防性维护投入 vs 被动维修支出的比值
- 评估当前维保策略的经济性

## 三、降本增效方案（呈：工程部主管 + 高管）
### 3.1 TOP 成本配件分析
列出成本最高的 5 种配件：
| 配件名称 | 本月用量 | 本月成本 | 上月成本 | 变化率 | 主要消耗设备 |

### 3.2 TOP 成本设备分析
列出维保成本最高的 5 台设备：
| 设备名称 | 维修次数 | 本月成本 | 上月成本 | 紧急维修占比 | 建议措施 |

### 3.3 具体降本建议
请给出 3-5 条**量化的降本措施**，每条包含：
- 措施描述
- 预估月度节省金额或百分比
- 实施难度（易/中/难）
- 实施步骤

### 3.4 采购与库存优化建议
- 高消耗配件是否可以批量采购降低单价？
- 库存预警配件的补货建议
- 是否存在过度备货的配件？

---

**输出要求：**
- 全部使用中文，Markdown 格式
- 所有分析必须有数据支撑，引用具体金额和百分比
- 降本建议要量化，不要只说"降低成本"，要说"预计每月节省 ¥XX"
- 对比分析要清晰标注上升↑或下降↓
- 如果成本数据为0或不足，请如实说明，并建议完善数据采集`,
  },
}

const API_BASE_HINTS = {
  'OpenAI': 'https://api.openai.com/v1',
  'Google Gemini': 'https://generativelanguage.googleapis.com/v1beta/openai',
  'Anthropic Claude': 'https://api.anthropic.com/v1',
  'DeepSeek': 'https://api.deepseek.com/v1',
  '通义千问': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  '智谱 GLM': 'https://open.bigmodel.cn/api/paas/v4',
  'Kimi（月之暗面）': 'https://api.moonshot.cn/v1',
  '百度文心': 'https://qianfan.baidubce.com/v2',
  '零一万物': 'https://api.lingyiwanwu.com/v1',
  '字节豆包': 'https://ark.cn-beijing.volces.com/api/v3',
  '讯飞星火': 'https://spark-api-open.xf-yun.com/v1',
}

async function getAIConfig(db) {
  const { data: list } = await db.collection('config').where({ key: 'ai_config' }).limit(1).get()
  const stored = list.length > 0 ? (list[0].value || {}) : {}

  let apiKeyMasked = ''
  if (stored.apiKey) {
    const k = stored.apiKey
    apiKeyMasked = k.length > 8 ? k.slice(0, 4) + '****' + k.slice(-4) : '****'
  }

  return {
    ok: true,
    data: {
      apiKeyMasked,
      apiBase: stored.apiBase || '',
      model: stored.model || 'gpt-4o-mini',
      models: DEFAULT_AI_MODELS,
      customModel: stored.customModel || '',
      prompts: stored.prompts || DEFAULT_AI_PROMPTS,
      defaultPrompts: DEFAULT_AI_PROMPTS,
      apiBaseHints: API_BASE_HINTS,
      enabled: !!stored.apiKey,
    },
  }
}

async function setAIConfig(db, data) {
  const { data: list } = await db.collection('config').where({ key: 'ai_config' }).limit(1).get()
  const existing = list.length > 0 ? (list[0].value || {}) : {}

  const newConfig = { ...existing }
  if (data.apiKey !== undefined && data.apiKey !== '') newConfig.apiKey = data.apiKey
  if (data.apiBase !== undefined) newConfig.apiBase = data.apiBase
  if (data.model !== undefined) newConfig.model = data.model
  if (data.customModel !== undefined) newConfig.customModel = data.customModel
  if (data.prompts !== undefined) newConfig.prompts = data.prompts

  if (list.length > 0) {
    await db.collection('config').where({ key: 'ai_config' }).update({ data: { value: newConfig, updatedAt: Date.now() } })
  } else {
    await db.collection('config').add({ data: { key: 'ai_config', value: newConfig, createdAt: Date.now(), updatedAt: Date.now() } })
  }
  return { ok: true, data: {} }
}

// ====== LLM 调用 ======

async function callLLM(apiBase, apiKey, model, messages, timeout) {
  const https = require('https')
  const http = require('http')
  const tmout = timeout || 90000

  const baseUrl = (apiBase || 'https://api.openai.com/v1').replace(/\/$/, '')
  const endpoint = baseUrl + '/chat/completions'
  const parsed = new (require('url').URL)(endpoint)

  const postData = JSON.stringify({
    model,
    messages,
    temperature: 0.7,
    max_tokens: 4096,
  })

  const isHttps = parsed.protocol === 'https:'
  const lib = isHttps ? https : http

  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: tmout,
    }

    const req = lib.request(options, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          if (json.choices && json.choices[0] && json.choices[0].message) {
            resolve(json.choices[0].message.content)
          } else if (json.error) {
            reject(new Error('LLM API 错误: ' + (json.error.message || JSON.stringify(json.error))))
          } else {
            reject(new Error('LLM API 返回格式异常: ' + body.slice(0, 500)))
          }
        } catch (e) {
          reject(new Error('LLM API 返回解析失败: ' + body.slice(0, 500)))
        }
      })
    })

    req.on('error', (e) => reject(new Error('LLM 请求网络错误: ' + e.message)))
    req.on('timeout', () => { req.destroy(); reject(new Error('LLM 请求超时（' + tmout / 1000 + '秒）')) })
    req.write(postData)
    req.end()
  })
}

function buildDataSummary(current, prev, factoryLabel, byFactory) {
  let s = `## 数据概况（${factoryLabel} - ${current.yearMonth}）\n\n`

  s += `### 基础统计\n`
  s += `- 更换次数：${current.totalLogs} 次（上月：${prev.totalLogs} 次）\n`
  s += `- 配件消耗：${current.totalPartsQty} 件（上月：${prev.totalPartsQty} 件）\n`
  s += `- 待处理报警：${current.openAlerts} 条\n`
  s += `- 使用成本：¥${(current.totalUsageCost || 0).toFixed(2)}（上月：¥${(prev.totalUsageCost || 0).toFixed(2)}）\n`
  s += `- 低库存预警：${current.lowStockCount || 0} 种\n\n`

  s += `### 更换类型分布\n`
  s += `- 维修：${current.typeCount['维修'] || 0} 次\n`
  s += `- 预防：${current.typeCount['预防'] || 0} 次\n`
  s += `- 紧急：${current.typeCount['紧急'] || 0} 次\n\n`

  if (current.topParts && current.topParts.length > 0) {
    s += `### 配件消耗 TOP 5\n`
    current.topParts.forEach((p, i) => {
      s += `${i + 1}. ${p.partName}：${p.totalQty} 件\n`
    })
    s += '\n'
  }

  if (current.topAssets && current.topAssets.length > 0) {
    s += `### 设备故障 TOP 5\n`
    current.topAssets.forEach((a, i) => {
      s += `${i + 1}. ${a.assetName}（${a.assetNo || ''}）：${a.logCount} 次${a.urgentCount > 0 ? `（紧急 ${a.urgentCount} 次）` : ''}\n`
    })
    s += '\n'
  }

  if (current.engineerWorkload && current.engineerWorkload.length > 0) {
    s += `### 工程师工作量\n`
    current.engineerWorkload.forEach(e => {
      s += `- ${e.name}：${e.logCount} 条记录\n`
    })
    s += '\n'
  }

  if (current.alertsByAsset && current.alertsByAsset.length > 0) {
    s += `### 报警设备分布\n`
    current.alertsByAsset.forEach(a => {
      s += `- ${a.assetName}：${a.openCount} 条待处理\n`
    })
    s += '\n'
  }

  if (byFactory && byFactory.length > 0) {
    s += `### 各工厂对比\n`
    byFactory.forEach(f => {
      s += `- ${f.factoryName}：更换 ${f.totalLogs} 次，消耗 ${f.totalPartsQty} 件，成本 ¥${(f.totalUsageCost || 0).toFixed(2)}\n`
    })
    s += '\n'
  }

  s += `请根据以上数据进行深入分析，生成一份完整的分析报告。`
  return s
}

// ====== AI 报告：聚合单月数据 ======
async function aggregateMonthData(db, factoryId, yearMonth, yearMonthsArr) {
  const timeQ = yearMonthsArr ? buildTimeQuery({ yearMonths: yearMonthsArr }) : (yearMonth ? { yearMonth } : {})
  const logWhere = { ...timeQ, disabled: _.neq(true) }
  const alertWhere = { ...timeQ }
  if (factoryId) {
    logWhere.factoryId = factoryId
    alertWhere.factoryId = factoryId
  }
  const { data: logs } = await db.collection('replacement_logs').where(logWhere).limit(1000).get()
  const { data: alertsList } = await db.collection('alerts').where(alertWhere).limit(1000).get()
  const openAlerts = alertsList.filter(a => a.status === 'OPEN')

  let totalPartsQty = 0
  const typeCount = { '维修': 0, '预防': 0, '紧急': 0 }
  const partUsageMap = {}
  const assetCountMap = {}
  const engineerMap = {}

  logs.forEach(l => {
    typeCount[l.type] = (typeCount[l.type] || 0) + 1
    ;(l.items || []).forEach(item => {
      totalPartsQty += item.qty || 0
      if (!partUsageMap[item.partSkuId]) {
        partUsageMap[item.partSkuId] = { partSkuId: item.partSkuId, partName: item.partNameSnapshot, totalQty: 0 }
      }
      partUsageMap[item.partSkuId].totalQty += item.qty || 0
    })
    if (!assetCountMap[l.assetId]) {
      assetCountMap[l.assetId] = { assetId: l.assetId, assetName: l.assetNameSnapshot, assetNo: l.assetNoSnapshot, logCount: 0, urgentCount: 0 }
    }
    assetCountMap[l.assetId].logCount++
    if (l.type === '紧急') assetCountMap[l.assetId].urgentCount++

    const reporterId = l.reporterUserIdSnapshot || l.userId
    const reporterName = l.reporterNameSnapshot || '未知'
    if (reporterId) {
      if (!engineerMap[reporterId]) engineerMap[reporterId] = { userId: reporterId, name: reporterName, logCount: 0 }
      engineerMap[reporterId].logCount++
    }
  })

  const topParts = Object.values(partUsageMap).sort((a, b) => b.totalQty - a.totalQty).slice(0, 5)
  const topAssets = Object.values(assetCountMap).sort((a, b) => b.logCount - a.logCount).slice(0, 5)
  const engineerWorkload = Object.values(engineerMap).sort((a, b) => b.logCount - a.logCount)

  const alertAssetMap = {}
  openAlerts.forEach(a => {
    if (!alertAssetMap[a.assetId]) {
      alertAssetMap[a.assetId] = { assetId: a.assetId, assetName: a.assetNameSnapshot || a.assetId, openCount: 0 }
    }
    alertAssetMap[a.assetId].openCount++
  })
  const alertsByAsset = Object.values(alertAssetMap).sort((a, b) => b.openCount - a.openCount)

  // 库存概况
  const invWhere = {}
  if (factoryId) invWhere.factoryId = factoryId
  let lowStockCount = 0
  let totalUsageCost = 0
  try {
    const { data: invList } = await db.collection('inventory').where(invWhere).limit(1000).get()
    lowStockCount = invList.filter(i => i.threshold > 0 && i.currentQty <= i.threshold).length
  } catch (e) { /* ignore */ }
  try {
    const obWhere = { ...timeQ }
    if (factoryId) obWhere.factoryId = factoryId
    const { data: outLogs } = await db.collection('inventory_outbound_logs').where(obWhere).limit(1000).get()
    totalUsageCost = outLogs.reduce((s, l) => s + (l.totalCost || 0), 0)
  } catch (e) { /* ignore */ }

  return {
    yearMonth, totalLogs: logs.length, totalPartsQty,
    openAlerts: openAlerts.length, totalAlerts: alertsList.length,
    typeCount, topParts, topAssets, engineerWorkload,
    alertsByAsset, lowStockCount,
    totalUsageCost: Math.round(totalUsageCost * 100) / 100,
  }
}

// ====== AI 报告：根据数据生成文字分析 ======
function buildReport(current, prev, factoryLabel, scope, byFactory) {
  const sections = []

  // 1. 设备健康总览
  const urgentRate = current.totalLogs > 0 ? Math.round((current.typeCount['紧急'] || 0) / current.totalLogs * 100) : 0
  const healthItems = []
  healthItems.push({ text: `本月更换 ${current.totalLogs} 次，配件消耗 ${current.totalPartsQty} 件，待处理报警 ${current.openAlerts} 条。` })
  healthItems.push({ text: `更换类型分布：维修 ${current.typeCount['维修'] || 0} 次、预防 ${current.typeCount['预防'] || 0} 次、紧急 ${current.typeCount['紧急'] || 0} 次（紧急占比 ${urgentRate}%）。` })
  if (urgentRate > 30) healthItems.push({ text: `⚠ 紧急维修占比偏高（${urgentRate}%），建议加强预防性维保。` })
  if (urgentRate <= 15 && current.totalLogs > 0) healthItems.push({ text: `✓ 紧急维修占比较低（${urgentRate}%），维保计划执行良好。` })
  sections.push({ title: '设备健康总览', items: healthItems })

  // 2. 历史对比与趋势
  const logsChange = prev.totalLogs > 0 ? Math.round((current.totalLogs - prev.totalLogs) / prev.totalLogs * 100) : 0
  const partsChange = prev.totalPartsQty > 0 ? Math.round((current.totalPartsQty - prev.totalPartsQty) / prev.totalPartsQty * 100) : 0
  const historyItems = []
  historyItems.push({ text: `更换次数环比 ${logsChange >= 0 ? '+' : ''}${logsChange}%（${prev.totalLogs} → ${current.totalLogs}）。` })
  historyItems.push({ text: `配件消耗环比 ${partsChange >= 0 ? '+' : ''}${partsChange}%（${prev.totalPartsQty} → ${current.totalPartsQty}）。` })
  if (logsChange > 30) historyItems.push({ text: `⚠ 更换次数大幅增长，需关注设备状态。` })
  if (logsChange < -20) historyItems.push({ text: `✓ 更换次数明显下降，设备状态趋于稳定。` })
  sections.push({ title: '历史对比与趋势', items: historyItems })

  // 3. 配件消耗 TOP 分析
  if (current.topParts.length > 0) {
    const partItems = current.topParts.slice(0, 3).map((p, i) =>
      ({ text: `TOP ${i + 1}: ${p.partName}，消耗 ${p.totalQty} 件。` })
    )
    sections.push({ title: '配件消耗分析', items: partItems })
  }

  // 4. 设备故障热点
  if (current.topAssets.length > 0) {
    const assetItems = current.topAssets.slice(0, 3).map((a, i) =>
      ({ text: `TOP ${i + 1}: ${a.assetName}，更换 ${a.logCount} 次${a.urgentCount > 0 ? `（其中紧急 ${a.urgentCount} 次）` : ''}。` })
    )
    sections.push({ title: '设备故障热点', items: assetItems })
  }

  // 5. 成本分析
  const costItems = []
  costItems.push({ text: `本月配件使用成本 ¥${(current.totalUsageCost || 0).toLocaleString()}。` })
  if (current.lowStockCount > 0) costItems.push({ text: `⚠ 当前有 ${current.lowStockCount} 种配件低库存预警，建议尽快采购补充。` })
  sections.push({ title: '成本分析', items: costItems })

  // 6. 人员与负荷
  if (current.engineerWorkload && current.engineerWorkload.length > 0) {
    const top = current.engineerWorkload[0]
    const pItems = [{ text: `本月活跃工程师 ${current.engineerWorkload.length} 人，${top.name} 记录最多（${top.logCount} 条）。` }]
    if (current.engineerWorkload.length >= 2) {
      const max = current.engineerWorkload[0].logCount
      const min = current.engineerWorkload[current.engineerWorkload.length - 1].logCount
      if (max > min * 3 && min > 0) pItems.push({ text: `⚠ 工作量分布不均（最多 ${max} 条 vs 最少 ${min} 条），建议合理分配。` })
    }
    sections.push({ title: '人员与负荷', items: pItems })
  }

  // 7. 报警与响应闭环
  if (current.openAlerts > 0 && current.alertsByAsset && current.alertsByAsset.length > 0) {
    const aItems = current.alertsByAsset.slice(0, 5).map(a =>
      ({ text: `${a.assetName} 有 ${a.openCount} 条待处理报警，建议尽快 ACK 或现场排查。` })
    )
    sections.push({ title: '报警与响应闭环', items: aItems })
  }

  // 总结文字
  let summaryText = `${factoryLabel} ${current.yearMonth} 月度分析：更换 ${current.totalLogs} 次，消耗配件 ${current.totalPartsQty} 件`
  if (current.openAlerts > 0) summaryText += `，${current.openAlerts} 条待处理报警`
  summaryText += '。'
  if (logsChange > 20) summaryText += `更换次数环比上升 ${logsChange}%，需重点关注。`
  else if (logsChange < -10) summaryText += `更换次数环比下降 ${Math.abs(logsChange)}%，设备状态改善。`
  else summaryText += '整体运行平稳。'

  const history = {
    logsPct: logsChange,
    partsPct: partsChange,
  }

  return { summaryText, sections, history }
}

async function getAIReport(db, data, meUser) {
  const yearMonth = data.yearMonth || (data.yearMonths ? null : new Date().toISOString().slice(0, 7))
  const yearMonthsArr = data.yearMonths || null
  const factoryId = data.factoryId || meUser.factoryId || null
  const scope = data.scope || 'factory'
  const promptType = data.promptType || 'monthly_summary'

  let prevYm = null
  if (yearMonth) {
    const d = new Date(yearMonth + '-01')
    d.setMonth(d.getMonth() - 1)
    prevYm = d.toISOString().slice(0, 7)
  }

  let current, prev
  let byFactory = []

  if (scope === 'summary') {
    current = await aggregateMonthData(db, null, yearMonth, yearMonthsArr)
    prev = prevYm ? await aggregateMonthData(db, null, prevYm) : current
    try {
      const { data: factories } = await db.collection('factories').limit(100).get()
      for (const f of factories) {
        const fc = await aggregateMonthData(db, f.factoryId, yearMonth, yearMonthsArr)
        byFactory.push({
          factoryId: f.factoryId,
          factoryName: f.factoryName,
          totalLogs: fc.totalLogs,
          totalPartsQty: fc.totalPartsQty,
          openAlerts: fc.openAlerts,
          totalUsageCost: fc.totalUsageCost,
          lowStockCount: fc.lowStockCount,
        })
      }
    } catch (e) { /* ignore */ }
  } else {
    current = await aggregateMonthData(db, factoryId, yearMonth, yearMonthsArr)
    prev = prevYm ? await aggregateMonthData(db, factoryId, prevYm) : current
  }

  // 确定工厂名称
  let factoryLabel = '当前工厂'
  if (scope === 'summary') {
    factoryLabel = '全部工厂'
  } else if (factoryId) {
    try {
      const { data: fList } = await db.collection('factories').where({ factoryId }).limit(1).get()
      if (fList.length > 0) factoryLabel = fList[0].factoryName
    } catch (e) { /* ignore */ }
  }

  // 模板报告（始终生成作为兜底）
  const templateReport = buildReport(current, prev, factoryLabel, scope, byFactory)

  // 尝试 LLM 生成
  let llmContent = null
  let llmError = null
  try {
    const { data: configList } = await db.collection('config').where({ key: 'ai_config' }).limit(1).get()
    const aiConfig = configList.length > 0 ? (configList[0].value || {}) : {}

    if (aiConfig.apiKey) {
      const model = aiConfig.model === 'custom' ? (aiConfig.customModel || 'gpt-4o-mini') : (aiConfig.model || 'gpt-4o-mini')
      const apiBase = aiConfig.apiBase || 'https://api.openai.com/v1'
      const prompts = aiConfig.prompts || DEFAULT_AI_PROMPTS
      const promptConfig = prompts[promptType] || prompts.monthly_summary || DEFAULT_AI_PROMPTS.monthly_summary

      const dataSummary = buildDataSummary(current, prev, factoryLabel, byFactory)

      const messages = [
        { role: 'system', content: promptConfig.content },
        { role: 'user', content: dataSummary },
      ]

      llmContent = await callLLM(apiBase, aiConfig.apiKey, model, messages)
    }
  } catch (e) {
    console.error('LLM 调用失败:', e.message)
    llmError = e.message
  }

  const reportData = {
    ...templateReport,
    stats: current,
    prevStats: prev,
    byFactory: scope === 'summary' ? byFactory : undefined,
    factoryLabel,
    llmContent,
    llmError,
    promptType,
  }

  // 自动保存报告到历史记录
  try {
    const reportId = 'rpt-' + Date.now()
    await db.collection('ai_reports').add({
      data: {
        reportId,
        yearMonth,
        factoryId: factoryId || '',
        factoryLabel,
        scope,
        promptType,
        hasLLM: !!llmContent,
        llmError: llmError || '',
        reportData,
        createdBy: meUser.userId,
        createdByName: meUser.displayName || meUser.username || '',
        createdAt: Date.now(),
      },
    })
    reportData.reportId = reportId
  } catch (e) {
    console.error('保存报告历史失败:', e.message)
  }

  return { ok: true, data: reportData }
}

// ====== 报告历史管理 ======

async function listAIReports(db, data, meUser) {
  const { page = 1, pageSize = 20 } = data
  const where = {}
  // 主管只能看自己工厂的
  if (meUser.role === 'Supervisor' && meUser.factoryId) {
    where.factoryId = meUser.factoryId
  }
  if (data.yearMonth) where.yearMonth = data.yearMonth
  if (data.promptType) where.promptType = data.promptType

  const countRes = await db.collection('ai_reports').where(where).count()
  const total = countRes.total || 0
  const skip = (page - 1) * pageSize
  const { data: list } = await db.collection('ai_reports')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .field({
      reportId: true, yearMonth: true, factoryId: true, factoryLabel: true,
      scope: true, promptType: true, hasLLM: true, llmError: true,
      createdBy: true, createdByName: true, createdAt: true,
    })
    .get()

  return { ok: true, data: { list, total, page, pageSize } }
}

async function getAIReportDetail(db, data) {
  const { reportId } = data
  if (!reportId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 reportId' } }
  const { data: list } = await db.collection('ai_reports').where({ reportId }).limit(1).get()
  if (list.length === 0) return { ok: false, error: { code: 'NOT_FOUND', message: '报告不存在' } }
  return { ok: true, data: list[0] }
}

async function deleteAIReport(db, data, meUser) {
  const { reportId } = data
  if (!reportId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 reportId' } }
  if (meUser.role !== 'Admin') return { ok: false, error: { code: 'FORBIDDEN', message: '仅管理员可删除报告' } }
  await db.collection('ai_reports').where({ reportId }).remove()
  return { ok: true, data: {} }
}

// ====== 看板下钻 ======

async function getDashboardPartDetail(db, data, meUser) {
  const { partSkuId } = data
  if (!partSkuId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 partSkuId' } }
  const ym = data.yearMonth || (data.yearMonths ? null : new Date().toISOString().slice(0, 7))
  const where = { ...buildTimeQuery(data), disabled: _.neq(true) }
  if (!where.yearMonth && ym) where.yearMonth = ym
  const factoryId = meUser.factoryId || null
  if (factoryId) where.factoryId = factoryId

  // 查配件信息
  let partName = '', partCode = '', unit = '个'
  try {
    const { data: parts } = await db.collection('parts').where({ partSkuId }).limit(1).get()
    if (parts.length > 0) {
      partName = parts[0].partName || ''
      partCode = parts[0].partCode || ''
      unit = parts[0].unit || '个'
    }
  } catch (e) { /* ignore */ }

  // 查阈值配置
  let thresholdMap = {}
  try {
    const { data: thresholds } = await db.collection('asset_part_thresholds')
      .where({ partSkuId, active: true }).limit(1000).get()
    thresholds.forEach(t => { thresholdMap[t.assetId] = t.thresholdMonthly || 0 })
  } catch (e) { /* ignore */ }

  // 查设备信息
  let assetMap = {}
  try {
    const { data: assets } = await db.collection('assets').limit(1000).get()
    assets.forEach(a => { assetMap[a.assetId] = a })
  } catch (e) { /* ignore */ }

  const { data: logs } = await db.collection('replacement_logs').where(where).limit(1000).get()

  // 按设备分组
  const assetQtyMap = {}
  logs.forEach(l => {
    (l.items || []).forEach(item => {
      if (item.partSkuId === partSkuId) {
        if (!assetQtyMap[l.assetId]) {
          const asset = assetMap[l.assetId] || {}
          assetQtyMap[l.assetId] = {
            assetId: l.assetId,
            assetName: l.assetNameSnapshot || asset.assetName || l.assetId,
            workshop: asset.workshop || '',
            qtySum: 0,
            threshold: thresholdMap[l.assetId] || 0,
            logs: [],
          }
        }
        assetQtyMap[l.assetId].qtySum += item.qty || 0
        assetQtyMap[l.assetId].logs.push({
          logId: l.logId, ts: l.ts, type: l.type || '维修',
          locationName: l.locationNameSnapshot || '',
          reporterName: l.reporterNameSnapshot || '',
          qty: item.qty || 0, remark: l.remark || '',
        })
      }
    })
  })

  const byAsset = Object.values(assetQtyMap).sort((a, b) => b.qtySum - a.qtySum)
  const totalQty = byAsset.reduce((s, a) => s + a.qtySum, 0)

  // 计算百分比和阈值超标
  byAsset.forEach(a => {
    a.percentage = totalQty > 0 ? Math.round(a.qtySum / totalQty * 100) : 0
    a.isOverThreshold = a.threshold > 0 && a.qtySum > a.threshold
  })

  return {
    ok: true,
    data: {
      partSkuId, partName: partName || data.partName || '',
      partCode, unit, yearMonth: ym || '', totalQty,
      byAsset,
    },
  }
}

async function getDashboardAssetDetail(db, data, meUser) {
  const { assetId } = data
  if (!assetId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 assetId' } }
  const ym = data.yearMonth || (data.yearMonths ? null : new Date().toISOString().slice(0, 7))

  // 查设备信息
  let assetName = '', assetNo = '', workshop = ''
  try {
    const { data: assets } = await db.collection('assets').where({ assetId }).limit(1).get()
    if (assets.length > 0) {
      assetName = assets[0].assetName || ''
      assetNo = assets[0].assetNo || ''
      workshop = assets[0].workshop || ''
    }
  } catch (e) { /* ignore */ }

  // 查配件信息
  let partsMap = {}
  try {
    const { data: parts } = await db.collection('parts').limit(1000).get()
    parts.forEach(p => { partsMap[p.partSkuId] = p })
  } catch (e) { /* ignore */ }

  // 查阈值
  let thresholdMap = {}
  try {
    const { data: thresholds } = await db.collection('asset_part_thresholds')
      .where({ assetId, active: true }).limit(1000).get()
    thresholds.forEach(t => { thresholdMap[t.partSkuId] = t.thresholdMonthly || 0 })
  } catch (e) { /* ignore */ }

  const assetLogWhere = { assetId, ...buildTimeQuery(data), disabled: _.neq(true) }
  if (!assetLogWhere.yearMonth && ym) assetLogWhere.yearMonth = ym
  const { data: logs } = await db.collection('replacement_logs').where(assetLogWhere).limit(1000).get()

  // 按配件分组
  const partQtyMap = {}
  logs.forEach(l => {
    (l.items || []).forEach(item => {
      if (!partQtyMap[item.partSkuId]) {
        const partInfo = partsMap[item.partSkuId] || {}
        partQtyMap[item.partSkuId] = {
          partSkuId: item.partSkuId,
          partName: item.partNameSnapshot || partInfo.partName || '',
          partCode: item.partCodeSnapshot || partInfo.partCode || '',
          unit: partInfo.unit || '个',
          qtySum: 0,
          threshold: thresholdMap[item.partSkuId] || 0,
          logs: [],
        }
      }
      partQtyMap[item.partSkuId].qtySum += item.qty || 0
      partQtyMap[item.partSkuId].logs.push({
        logId: l.logId, ts: l.ts, type: l.type || '维修',
        locationName: l.locationNameSnapshot || '',
        reporterName: l.reporterNameSnapshot || '',
        qty: item.qty || 0, remark: l.remark || '',
      })
    })
  })

  const byPart = Object.values(partQtyMap).sort((a, b) => b.qtySum - a.qtySum)
  const totalLogCount = logs.length
  const totalPartTypes = byPart.length

  // 计算使用率（相对阈值）
  byPart.forEach(p => {
    p.usageRate = p.threshold > 0 ? Math.round(p.qtySum / p.threshold * 100) : 0
    p.isOverThreshold = p.threshold > 0 && p.qtySum > p.threshold
  })

  return {
    ok: true,
    data: {
      assetId, assetName, assetNo, workshop, yearMonth: ym || '',
      totalLogCount, totalPartTypes,
      byPart,
    },
  }
}

async function getDashboardAssetAlerts(db, data, meUser) {
  const { assetId } = data
  if (!assetId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 assetId' } }
  const where = { assetId, status: 'OPEN' }
  Object.assign(where, buildTimeQuery(data))
  const { data: rawAlerts } = await db.collection('alerts').where(where).limit(1000).get()

  // 查设备信息
  let assetName = '', assetNo = '', workshop = ''
  try {
    const { data: assets } = await db.collection('assets').where({ assetId }).limit(1).get()
    if (assets.length > 0) {
      assetName = assets[0].assetName || ''
      assetNo = assets[0].assetNo || ''
      workshop = assets[0].workshop || ''
    }
  } catch (e) { /* ignore */ }

  // 查配件信息用于富化
  let partsMap = {}
  try {
    const { data: parts } = await db.collection('parts').limit(1000).get()
    parts.forEach(p => { partsMap[p.partSkuId] = p })
  } catch (e) { /* ignore */ }

  // 查当月更换记录，用于关联消耗明细
  let logs = []
  try {
    const logWhere = { assetId, yearMonth: ym, disabled: _.neq(true) }
    const { data: logList } = await db.collection('replacement_logs').where(logWhere).limit(1000).get()
    logs = logList
  } catch (e) { /* ignore */ }

  // 富化每条报警
  const alerts = rawAlerts.map(a => {
    const partInfo = partsMap[a.partSkuId] || {}
    const overQty = Math.max(0, (a.currentQty || 0) - (a.thresholdValue || 0))
    const overRate = (a.thresholdValue || 0) > 0
      ? Math.round(overQty / a.thresholdValue * 100)
      : 0

    // 收集该配件的更换记录
    const relatedLogs = []
    logs.forEach(l => {
      (l.items || []).forEach(item => {
        if (item.partSkuId === a.partSkuId) {
          relatedLogs.push({
            logId: l.logId,
            ts: l.ts,
            type: l.type || '维修',
            locationName: l.locationNameSnapshot || '',
            reporterName: l.reporterNameSnapshot || '',
            qty: item.qty || 0,
            remark: l.remark || '',
          })
        }
      })
    })

    return {
      ...a,
      partName: a.partName || a.partNameSnapshot || partInfo.partName || '',
      partCode: a.partCode || partInfo.partCode || '',
      unit: partInfo.unit || '个',
      overQty,
      overRate,
      logs: relatedLogs,
    }
  })

  return {
    ok: true,
    data: {
      assetId,
      assetName: assetName || rawAlerts[0]?.assetName || assetId,
      assetNo,
      workshop,
      yearMonth: ym,
      openCount: alerts.length,
      alerts,
    },
  }
}

// ====== 工厂管理 ======

async function ensureCollection(db, name) {
  try {
    await db.createCollection(name)
    console.log('Collection created:', name)
  } catch (e) {
    // 集合已存在或无权限时忽略
    console.log('ensureCollection ' + name + ':', e.message || e.errMsg || '')
  }
}

async function createFactory(db, data) {
  const { factoryName, factoryCode, address, contact } = data
  if (!factoryName) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '工厂名称为必填项' } }
  const factoryId = data.factoryId || ('F-' + Date.now())

  // 确保集合存在
  await ensureCollection(db, 'factories')

  // 检查工厂编号或ID是否重复
  try {
    if (factoryCode) {
      const { data: byCode } = await db.collection('factories').where({ factoryCode }).limit(1).get()
      if (byCode.length > 0) {
        return { ok: false, error: { code: 'DUPLICATE', message: '工厂编号已存在: ' + factoryCode } }
      }
    }
    const { data: existing } = await db.collection('factories').where({ factoryId }).limit(1).get()
    if (existing.length > 0) {
      return { ok: false, error: { code: 'DUPLICATE', message: '工厂ID已存在' } }
    }
  } catch (e) {
    console.log('createFactory check existing:', e.message)
  }

  try {
    await db.collection('factories').add({
      data: {
        factoryId, factoryName,
        factoryCode: factoryCode || '',
        address: address || '', contact: contact || '',
        status: 'active', createdAt: Date.now(), updatedAt: Date.now(),
      },
    })
    return { ok: true, data: { factoryId } }
  } catch (addErr) {
    return { ok: false, error: { code: 'DB_ERROR', message: '写入数据库失败: ' + (addErr.message || addErr.errMsg || String(addErr)) } }
  }
}

async function updateFactory(db, data) {
  const { factoryId, factoryName, factoryCode, address, contact, status } = data
  if (!factoryId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 factoryId' } }
  const updateData = { updatedAt: Date.now() }
  if (factoryName !== undefined) updateData.factoryName = factoryName
  if (factoryCode !== undefined) updateData.factoryCode = factoryCode
  if (address !== undefined) updateData.address = address
  if (contact !== undefined) updateData.contact = contact
  if (status !== undefined) updateData.status = status
  await db.collection('factories').where({ factoryId }).update({ data: updateData })
  return { ok: true, data: {} }
}

// ====== 库存管理 ======

async function listInventory(db, data) {
  const where = {}
  if (data.factoryId) where.factoryId = data.factoryId
  const { data: list } = await db.collection('inventory').where(where).limit(1000).get()

  // 补充配件快照字段 + 为历史缺失 avgUnitCost 的记录从入库记录回算
  if (list.length > 0) {
    // 查配件表补充快照
    const skuIds = [...new Set(list.map(r => r.partSkuId).filter(Boolean))]
    const partMap = {}
    for (let i = 0; i < skuIds.length; i += 20) {
      const batch = skuIds.slice(i, i + 20)
      const { data: parts } = await db.collection('parts').where({ partSkuId: db.command.in(batch) }).limit(100).get()
      parts.forEach(p => { partMap[p.partSkuId] = p })
    }

    // 找出缺少 avgUnitCost 的记录，从入库日志回算
    const needCalcIds = list.filter(r => r.avgUnitCost === undefined || r.avgUnitCost === null).map(r => r.partSkuId)
    const costMap = {} // partSkuId+factoryId => { totalCost, totalQty }
    if (needCalcIds.length > 0) {
      try {
        const ibWhere = {}
        if (data.factoryId) ibWhere.factoryId = data.factoryId
        const { data: ibLogs } = await db.collection('inventory_inbound_logs').where(ibWhere).limit(2000).get()
        for (const log of ibLogs) {
          const key = `${log.partSkuId}|${log.factoryId || ''}`
          if (!costMap[key]) costMap[key] = { totalCost: 0, totalQty: 0 }
          costMap[key].totalCost += (log.totalPrice || (log.qty || 0) * (log.unitPrice || 0))
          costMap[key].totalQty += (log.qty || 0)
        }
      } catch (e) { /* ignore */ }
    }

    for (const inv of list) {
      const part = partMap[inv.partSkuId] || {}
      // 补充配件快照
      if (!inv.specModelSnapshot) inv.specModelSnapshot = part.specModel || ''
      if (!inv.unitSnapshot) inv.unitSnapshot = part.unit || '个'
      // 统一低库存阈值字段名
      if (inv.lowStockThreshold === undefined) inv.lowStockThreshold = inv.threshold || 0

      // 补充 avgUnitCost / totalCostValue（历史数据兜底）
      if (inv.avgUnitCost === undefined || inv.avgUnitCost === null) {
        const key = `${inv.partSkuId}|${inv.factoryId || ''}`
        const calc = costMap[key]
        if (calc && calc.totalQty > 0) {
          inv.avgUnitCost = Math.round((calc.totalCost / calc.totalQty) * 100) / 100
        } else {
          inv.avgUnitCost = part.unitPrice || 0
        }
      }
      if (inv.totalCostValue === undefined || inv.totalCostValue === null) {
        inv.totalCostValue = Math.round((inv.currentQty || 0) * (inv.avgUnitCost || 0) * 100) / 100
      }
    }
  }

  return { ok: true, data: { list } }
}

async function inventoryInbound(db, data) {
  const { factoryId, items, partSkuId, qty, unitPrice, supplier, note, batchNo, remark } = data
  // 支持批量入库（items 数组）或单条入库（partSkuId + qty）
  const inboundItems = items && Array.isArray(items) ? items : [{ partSkuId, qty, unitCost: unitPrice || 0, supplier, batchNo, remark }]
  if (!factoryId || inboundItems.length === 0 || !inboundItems[0].partSkuId) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少必要参数' } }
  }
  const now = Date.now()
  const yearMonth = new Date().toISOString().slice(0, 7)

  // 查询配件信息用于快照
  let partsMap = {}
  try {
    const { data: partsList } = await db.collection('parts').limit(1000).get()
    partsList.forEach(p => { partsMap[p.partSkuId] = p })
  } catch (e) { /* ignore */ }

  for (const item of inboundItems) {
    const partInfo = partsMap[item.partSkuId] || {}
    const itemQty = item.qty || 0
    const itemUnitCost = item.unitCost || item.unitPrice || 0
    const totalPrice = itemQty * itemUnitCost

    // 写入入库记录到 inventory_inbound_logs
    await db.collection('inventory_inbound_logs').add({
      data: {
        inboundId: 'ib-' + now + '-' + Math.random().toString(36).slice(2, 6),
        factoryId, partSkuId: item.partSkuId, qty: itemQty,
        unitPrice: itemUnitCost, totalPrice,
        partNameSnapshot: partInfo.partName || '',
        partCodeSnapshot: partInfo.partCode || '',
        supplier: item.supplier || supplier || '',
        batchNo: item.batchNo || batchNo || '',
        remark: item.remark || remark || note || '',
        yearMonth, ts: now, createdAt: now,
      },
    })
    // 更新库存（含加权平均单价计算）
    const { data: inv } = await db.collection('inventory').where({ factoryId, partSkuId: item.partSkuId }).limit(1).get()
    if (inv.length > 0) {
      const oldQty = inv[0].currentQty || 0
      const oldAvgCost = inv[0].avgUnitCost || 0
      const newQty = oldQty + itemQty
      // 加权平均单价 = (旧库存金额 + 本次入库金额) / 新总数量
      const newAvgCost = newQty > 0 ? ((oldAvgCost * oldQty + itemUnitCost * itemQty) / newQty) : itemUnitCost
      const newTotalValue = newQty * newAvgCost
      await db.collection('inventory').where({ factoryId, partSkuId: item.partSkuId }).update({
        data: {
          currentQty: _.inc(itemQty),
          avgUnitCost: Math.round(newAvgCost * 100) / 100,
          totalCostValue: Math.round(newTotalValue * 100) / 100,
          updatedAt: now,
        },
      })
    } else {
      await db.collection('inventory').add({
        data: {
          inventoryId: 'inv-' + now + '-' + Math.random().toString(36).slice(2, 6),
          factoryId, partSkuId: item.partSkuId,
          partNameSnapshot: partInfo.partName || '',
          partCodeSnapshot: partInfo.partCode || '',
          currentQty: itemQty,
          avgUnitCost: Math.round(itemUnitCost * 100) / 100,
          totalCostValue: Math.round(totalPrice * 100) / 100,
          threshold: 0,
          createdAt: now, updatedAt: now,
        },
      })
    }
  }
  return { ok: true, data: { inboundId: 'ib-' + now } }
}

async function listInboundLogs(db, data) {
  const where = {}
  if (data.factoryId) where.factoryId = data.factoryId
  Object.assign(where, buildTimeQuery(data))
  const queryLimit = data.yearMonths === null ? 5000 : 1000
  const { data: list } = await db.collection('inventory_inbound_logs').where(where).orderBy('ts', 'desc').limit(queryLimit).get()
  return { ok: true, data: { list } }
}

async function listOutboundLogs(db, data) {
  const where = {}
  if (data.factoryId) where.factoryId = data.factoryId
  Object.assign(where, buildTimeQuery(data))
  const queryLimit = data.yearMonths === null ? 5000 : 1000
  const { data: list } = await db.collection('inventory_outbound_logs').where(where).orderBy('ts', 'desc').limit(queryLimit).get()
  return { ok: true, data: { list } }
}

// ====== 删除入库记录（仅管理员，同步回退库存） ======
async function deleteInboundLog(db, data, meUser) {
  if (!meUser || meUser.role !== 'Admin') {
    return { ok: false, error: { code: 'FORBIDDEN', message: '仅管理员可删除入库记录' } }
  }
  const { inboundId } = data
  if (!inboundId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 inboundId' } }

  const { data: logs } = await db.collection('inventory_inbound_logs').where({ inboundId }).limit(1).get()
  if (!logs.length) return { ok: false, error: { code: 'NOT_FOUND', message: '入库记录不存在' } }
  const log = logs[0]

  const { data: invList } = await db.collection('inventory')
    .where({ factoryId: log.factoryId, partSkuId: log.partSkuId })
    .limit(1).get()

  if (invList.length > 0) {
    const inv = invList[0]
    const newQty = Math.max(0, (inv.currentQty || 0) - (log.qty || 0))
    const avgCost = inv.avgUnitCost || 0
    await db.collection('inventory').doc(inv._id).update({
      data: {
        currentQty: newQty,
        totalCostValue: Math.round(newQty * avgCost * 100) / 100,
        updatedAt: Date.now()
      }
    })
  }

  await db.collection('inventory_inbound_logs').doc(log._id).remove()
  return { ok: true, data: {} }
}

// ====== 删除出库记录（仅管理员，同步回退库存） ======
async function deleteOutboundLog(db, data, meUser) {
  if (!meUser || meUser.role !== 'Admin') {
    return { ok: false, error: { code: 'FORBIDDEN', message: '仅管理员可删除出库记录' } }
  }
  const { outboundId } = data
  if (!outboundId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 outboundId' } }

  const { data: logs } = await db.collection('inventory_outbound_logs').where({ outboundId }).limit(1).get()
  if (!logs.length) return { ok: false, error: { code: 'NOT_FOUND', message: '出库记录不存在' } }
  const log = logs[0]

  const { data: invList } = await db.collection('inventory')
    .where({ factoryId: log.factoryId, partSkuId: log.partSkuId })
    .limit(1).get()

  if (invList.length > 0) {
    const inv = invList[0]
    const newQty = (inv.currentQty || 0) + (log.qty || 0)
    const avgCost = inv.avgUnitCost || 0
    await db.collection('inventory').doc(inv._id).update({
      data: {
        currentQty: newQty,
        totalCostValue: Math.round(newQty * avgCost * 100) / 100,
        updatedAt: Date.now()
      }
    })
  }

  await db.collection('inventory_outbound_logs').doc(log._id).remove()
  return { ok: true, data: {} }
}

async function listInventoryAlerts(db, data) {
  const where = {}
  if (data.factoryId) where.factoryId = data.factoryId
  const { data: list } = await db.collection('inventory').where(where).limit(1000).get()
  // 筛选低于阈值的库存
  const alerts = list.filter(inv => inv.threshold > 0 && inv.currentQty <= inv.threshold)
  return { ok: true, data: { list: alerts } }
}

async function updateInventoryThreshold(db, data) {
  const { inventoryId, threshold } = data
  if (!inventoryId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 inventoryId' } }
  await db.collection('inventory').where({ inventoryId }).update({ data: { threshold, updatedAt: Date.now() } })
  return { ok: true, data: {} }
}

async function getInventorySummary(db, data) {
  const where = {}
  if (data.factoryId) where.factoryId = data.factoryId
  const yearMonth = data.yearMonth || (data.yearMonths ? null : new Date().toISOString().slice(0, 7))
  const sumTimeQuery = buildTimeQuery(data)
  if (!sumTimeQuery.yearMonth && yearMonth) sumTimeQuery.yearMonth = yearMonth
  const { data: invList } = await db.collection('inventory').where(where).limit(1000).get()
  const totalItems = invList.length
  const totalQty = invList.reduce((sum, inv) => sum + (inv.currentQty || 0), 0)
  const lowStockCount = invList.filter(inv => (inv.threshold > 0 || inv.lowStockThreshold > 0) && inv.currentQty <= (inv.lowStockThreshold || inv.threshold || 0)).length

  // 查配件表 + 入库日志，与 listInventory 一致的成本逻辑
  const partsMap = {}
  try {
    const { data: parts } = await db.collection('parts').limit(1000).get()
    parts.forEach(p => { partsMap[p.partSkuId] = p })
  } catch (e) {}

  // 从入库日志回算缺失的 avgUnitCost
  const ibCostMap = {}
  try {
    const ibAllWhere = {}
    if (data.factoryId) ibAllWhere.factoryId = data.factoryId
    const { data: ibAll } = await db.collection('inventory_inbound_logs').where(ibAllWhere).limit(2000).get()
    for (const log of ibAll) {
      const key = `${log.partSkuId}|${log.factoryId || ''}`
      if (!ibCostMap[key]) ibCostMap[key] = { totalCost: 0, totalQty: 0 }
      ibCostMap[key].totalCost += (log.totalPrice || (log.qty || 0) * (log.unitPrice || 0))
      ibCostMap[key].totalQty += (log.qty || 0)
    }
  } catch (e) {}

  // 计算每条库存的实际单价并累加总价值
  let totalInventoryValue = 0
  for (const inv of invList) {
    let avgCost = inv.avgUnitCost || 0
    // 如果库存记录没有 avgUnitCost，从入库日志回算
    if (!avgCost) {
      const key = `${inv.partSkuId}|${inv.factoryId || ''}`
      const calc = ibCostMap[key]
      if (calc && calc.totalQty > 0) {
        avgCost = calc.totalCost / calc.totalQty
      } else {
        // 最终兜底：用配件表参考价
        avgCost = (partsMap[inv.partSkuId] || {}).unitPrice || 0
      }
    }
    const value = inv.totalCostValue || (inv.currentQty || 0) * avgCost
    totalInventoryValue += value
  }
  totalInventoryValue = Math.round(totalInventoryValue * 100) / 100

  let totalInboundValue = 0
  try {
    const ibWhere = { ...sumTimeQuery }
    if (data.factoryId) ibWhere.factoryId = data.factoryId
    const { data: ibLogs } = await db.collection('inventory_inbound_logs').where(ibWhere).limit(1000).get()
    totalInboundValue = ibLogs.reduce((s, l) => s + (l.totalPrice || 0), 0)
  } catch (e) { /* ignore */ }

  // 辅助函数：获取某配件的最优单价（完整回退链）
  function getBestUnitPrice(partSkuId, factId) {
    // 1. 库存表 avgUnitCost（最可靠的加权均价）
    const inv = invList.find(i => i.partSkuId === partSkuId)
    if (inv && inv.avgUnitCost > 0) return inv.avgUnitCost
    // 2. 入库日志回算均价
    const key = `${partSkuId}|${factId || ''}`
    const calc = ibCostMap[key]
    if (calc && calc.totalQty > 0) return calc.totalCost / calc.totalQty
    // 3. 配件表参考价
    const part = partsMap[partSkuId]
    if (part && part.unitPrice > 0) return part.unitPrice
    return 0
  }

  let totalOutboundValue = 0
  try {
    const obWhere = { ...sumTimeQuery }
    if (data.factoryId) obWhere.factoryId = data.factoryId
    const { data: obLogsAll } = await db.collection('inventory_outbound_logs').where(obWhere).limit(1000).get()
    const obLogs = obLogsAll.filter(ob => ob.assetNameSnapshot !== '厂务' && ob.assetNameSnapshot !== '锅炉房')

    if (obLogs.length > 0) {
      for (const ob of obLogs) {
        let cost = ob.totalCost || 0
        if (!cost) cost = (ob.qty || 0) * getBestUnitPrice(ob.partSkuId, ob.factoryId)
        totalOutboundValue += cost
      }
    } else {
      const repWhere = { ...sumTimeQuery, disabled: db.command.neq(true), module: _.or(_.eq('equipment'), _.exists(false)) }
      if (data.factoryId) repWhere.factoryId = data.factoryId
      const { data: repLogs } = await db.collection('replacement_logs').where(repWhere).limit(1000).get()
      for (const log of repLogs) {
        for (const item of (log.items || [])) {
          let cost = item.itemCost || ((item.qty || 0) * (item.unitCost || 0))
          if (!cost) cost = (item.qty || 0) * getBestUnitPrice(item.partSkuId, data.factoryId)
          totalOutboundValue += cost
        }
      }
    }
  } catch (e) { /* ignore */ }

  return {
    ok: true,
    data: {
      yearMonth: yearMonth || '', totalItems, totalQty, lowStockCount,
      totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
      totalInboundValue: Math.round(totalInboundValue * 100) / 100,
      totalOutboundValue: Math.round(totalOutboundValue * 100) / 100,
    },
  }
}

async function getMonthlyCostRanking(db, data, meUser) {
  const ym = data.yearMonth || (data.yearMonths ? null : new Date().toISOString().slice(0, 7))
  const costTimeQuery = buildTimeQuery(data)
  if (!costTimeQuery.yearMonth && ym) costTimeQuery.yearMonth = ym
  const factoryId = data.factoryId || meUser.factoryId || null

  // 1) 查配件表（获取名称、编号、规格、单位、参考单价）
  const partsMap = {}
  try {
    const { data: parts } = await db.collection('parts').limit(1000).get()
    parts.forEach(p => { partsMap[p.partSkuId] = p })
  } catch (e) {}

  // 2) 查库存表（获取当前 avgUnitCost 作为成本来源）
  const invMap = {}
  try {
    const invWhere = {}
    if (factoryId) invWhere.factoryId = factoryId
    const { data: invList } = await db.collection('inventory').where(invWhere).limit(1000).get()
    invList.forEach(inv => { invMap[inv.partSkuId] = inv })
  } catch (e) {}

  // 3) 从入库日志回算均价（兜底）
  const ibCostMap = {}
  try {
    const ibWhere = {}
    if (factoryId) ibWhere.factoryId = factoryId
    const { data: ibAll } = await db.collection('inventory_inbound_logs').where(ibWhere).limit(2000).get()
    for (const log of ibAll) {
      const key = log.partSkuId
      if (!ibCostMap[key]) ibCostMap[key] = { totalCost: 0, totalQty: 0 }
      ibCostMap[key].totalCost += (log.totalPrice || (log.qty || 0) * (log.unitPrice || 0))
      ibCostMap[key].totalQty += (log.qty || 0)
    }
  } catch (e) {}

  // 辅助函数：获取某配件的最优单价
  function getBestUnitPrice(partSkuId) {
    // 优先：库存表 avgUnitCost
    const inv = invMap[partSkuId]
    if (inv && inv.avgUnitCost > 0) return inv.avgUnitCost
    // 其次：入库日志回算均价
    const ibc = ibCostMap[partSkuId]
    if (ibc && ibc.totalQty > 0) return ibc.totalCost / ibc.totalQty
    // 最后：配件表参考价
    const part = partsMap[partSkuId]
    if (part && part.unitPrice > 0) return part.unitPrice
    return 0
  }

  // 4) 从出库记录统计使用量和成本（排除厂务/锅炉房）
  const obWhere = { ...costTimeQuery }
  if (factoryId) obWhere.factoryId = factoryId
  const { data: obLogsRaw } = await db.collection('inventory_outbound_logs').where(obWhere).limit(1000).get()
  const obLogs = obLogsRaw.filter(ob => ob.assetNameSnapshot !== '厂务' && ob.assetNameSnapshot !== '锅炉房')

  const logWhere = { ...costTimeQuery, disabled: _.neq(true), module: _.or(_.eq('equipment'), _.exists(false)) }
  if (factoryId) logWhere.factoryId = factoryId
  const { data: repLogs } = await db.collection('replacement_logs').where(logWhere).limit(1000).get()

  const costMap = {}

  if (obLogs.length > 0) {
    // 有出库记录，以出库记录为准
    obLogs.forEach(ob => {
      const key = ob.partSkuId
      if (!costMap[key]) costMap[key] = { partSkuId: key, totalQty: 0, totalCost: 0 }
      const qty = ob.qty || 0
      let cost = ob.totalCost || ((ob.qty || 0) * (ob.unitCostAtTime || 0))
      // 如果出库记录成本为0，用最优单价回退
      if (!cost && qty > 0) {
        cost = qty * getBestUnitPrice(key)
      }
      costMap[key].totalQty += qty
      costMap[key].totalCost += cost
    })
  } else {
    // 无出库记录，从更换记录统计
    repLogs.forEach(l => {
      (l.items || []).forEach(item => {
        const key = item.partSkuId
        if (!costMap[key]) costMap[key] = { partSkuId: key, totalQty: 0, totalCost: 0 }
        const qty = item.qty || 0
        let cost = item.itemCost || ((item.qty || 0) * (item.unitCost || 0))
        if (!cost && qty > 0) {
          cost = qty * getBestUnitPrice(key)
        }
        costMap[key].totalQty += qty
        costMap[key].totalCost += cost
      })
    })
  }

  // 5) 构建排行数据，补充配件信息（按配件分组 — 库存管理页面用）
  const grandTotal = Object.values(costMap).reduce((s, c) => s + (c.totalCost || 0), 0)
  const ranking = Object.values(costMap).map(c => {
    const part = partsMap[c.partSkuId] || {}
    return {
      partSkuId: c.partSkuId,
      partName: part.partName || '',
      partCode: part.partCode || '',
      specModel: part.specModel || '',
      unit: part.unit || '个',
      qty: c.totalQty,
      totalCost: Math.round((c.totalCost || 0) * 100) / 100,
      percentage: grandTotal > 0 ? Math.round((c.totalCost || 0) / grandTotal * 10000) / 100 : 0
    }
  }).sort((a, b) => b.totalCost - a.totalCost)

  // 6) 按设备分组（数据看板 TOP 10 用）
  const assetCostMap = {}
  // 从更换记录按设备汇总
  repLogs.forEach(l => {
    const aid = l.assetId
    if (!assetCostMap[aid]) assetCostMap[aid] = { assetId: aid, assetName: l.assetNameSnapshot || '', totalCost: 0 }
    ;(l.items || []).forEach(item => {
      let cost = item.itemCost || ((item.qty || 0) * (item.unitCost || 0))
      if (!cost) cost = (item.qty || 0) * getBestUnitPrice(item.partSkuId)
      assetCostMap[aid].totalCost += cost
    })
  })
  const costByAsset = Object.values(assetCostMap).map(a => ({
    assetId: a.assetId,
    assetName: a.assetName,
    totalCost: Math.round((a.totalCost || 0) * 100) / 100
  })).filter(a => a.totalCost > 0).sort((a, b) => b.totalCost - a.totalCost).slice(0, 10)

  return {
    ok: true,
    data: {
      list: ranking,
      totalCost: Math.round(grandTotal * 100) / 100,
      costByAsset,
      totalMonthlyUsageCost: Math.round(grandTotal * 100) / 100
    }
  }
}

async function getPartUsageCostList(db, data, meUser) {
  return getMonthlyCostRanking(db, data, meUser)
}

async function getAssetCostDetail(db, data) {
  const { factoryId, assetId } = data
  if (!assetId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 assetId' } }
  const ym = data.yearMonth || (data.yearMonths ? null : new Date().toISOString().slice(0, 7))
  const acTimeQuery = buildTimeQuery(data)
  if (!acTimeQuery.yearMonth && ym) acTimeQuery.yearMonth = ym

  // 预加载配件表、库存表、入库日志
  const partsMap = {}, invMap = {}, ibCostMap = {}
  try {
    const { data: allParts } = await db.collection('parts').limit(1000).get()
    allParts.forEach(p => { partsMap[p.partSkuId] = p })
  } catch (e) {}
  try {
    const invWhere = {}
    if (factoryId) invWhere.factoryId = factoryId
    const { data: allInv } = await db.collection('inventory').where(invWhere).limit(1000).get()
    allInv.forEach(inv => { invMap[inv.partSkuId] = inv })
  } catch (e) {}
  try {
    const ibWhere = {}
    if (factoryId) ibWhere.factoryId = factoryId
    const { data: ibAll } = await db.collection('inventory_inbound_logs').where(ibWhere).limit(2000).get()
    for (const log of ibAll) {
      if (!ibCostMap[log.partSkuId]) ibCostMap[log.partSkuId] = { totalCost: 0, totalQty: 0 }
      ibCostMap[log.partSkuId].totalCost += (log.totalPrice || (log.qty || 0) * (log.unitPrice || 0))
      ibCostMap[log.partSkuId].totalQty += (log.qty || 0)
    }
  } catch (e) {}
  function getBestPrice(partSkuId) {
    const inv = invMap[partSkuId]
    if (inv && inv.avgUnitCost > 0) return inv.avgUnitCost
    const ibc = ibCostMap[partSkuId]
    if (ibc && ibc.totalQty > 0) return ibc.totalCost / ibc.totalQty
    const part = partsMap[partSkuId]
    if (part && part.unitPrice > 0) return part.unitPrice
    return 0
  }

  const obWhere = { assetId, ...acTimeQuery }
  if (factoryId) obWhere.factoryId = factoryId
  const { data: obLogs } = await db.collection('inventory_outbound_logs').where(obWhere).limit(1000).get()

  let totalCost = 0
  const parts = {}

  if (obLogs.length > 0) {
    for (const ob of obLogs) {
      let cost = ob.totalCost || 0
      if (!cost) cost = (ob.qty || 0) * getBestPrice(ob.partSkuId)
      totalCost += cost
      const key = ob.partSkuId
      if (!parts[key]) parts[key] = { partSkuId: key, partName: ob.partNameSnapshot || (partsMap[key] || {}).partName || '', totalQty: 0, totalCost: 0 }
      parts[key].totalQty += ob.qty || 0
      parts[key].totalCost += cost
    }
  } else {
    const where = { assetId, ...acTimeQuery, disabled: _.neq(true) }
    if (factoryId) where.factoryId = factoryId
    const { data: logs } = await db.collection('replacement_logs').where(where).limit(1000).get()
    logs.forEach(l => {
      (l.items || []).forEach(item => {
        let cost = item.itemCost || ((item.qty || 0) * (item.unitCost || 0))
        if (!cost) cost = (item.qty || 0) * getBestPrice(item.partSkuId)
        totalCost += cost
        if (!parts[item.partSkuId]) parts[item.partSkuId] = { partSkuId: item.partSkuId, partName: item.partNameSnapshot, totalQty: 0, totalCost: 0 }
        parts[item.partSkuId].totalQty += item.qty || 0
        parts[item.partSkuId].totalCost += cost
      })
    })
  }
  // 查设备名称
  let assetName = ''
  try {
    const { data: assetList } = await db.collection('assets').where({ assetId }).limit(1).get()
    if (assetList.length > 0) assetName = assetList[0].assetName || ''
  } catch (e) {}

  return {
    ok: true,
    data: {
      assetName,
      yearMonth: ym || '',
      totalCost: Math.round(totalCost * 100) / 100,
      partList: Object.values(parts),
      logCount: obLogs.length
    }
  }
}

async function getInventoryTrend(db, data) {
  const { factoryId, months = 6 } = data

  // 预加载配件表、库存表、入库日志（用于出库成本回退）
  const partsMap = {}, invMap = {}, ibCostMap = {}
  try {
    const { data: allParts } = await db.collection('parts').limit(1000).get()
    allParts.forEach(p => { partsMap[p.partSkuId] = p })
  } catch (e) {}
  try {
    const invWhere = {}
    if (factoryId) invWhere.factoryId = factoryId
    const { data: allInv } = await db.collection('inventory').where(invWhere).limit(1000).get()
    allInv.forEach(inv => { invMap[inv.partSkuId] = inv })
  } catch (e) {}
  try {
    const ibWhere2 = {}
    if (factoryId) ibWhere2.factoryId = factoryId
    const { data: ibAll } = await db.collection('inventory_inbound_logs').where(ibWhere2).limit(2000).get()
    for (const log of ibAll) {
      if (!ibCostMap[log.partSkuId]) ibCostMap[log.partSkuId] = { totalCost: 0, totalQty: 0 }
      ibCostMap[log.partSkuId].totalCost += (log.totalPrice || (log.qty || 0) * (log.unitPrice || 0))
      ibCostMap[log.partSkuId].totalQty += (log.qty || 0)
    }
  } catch (e) {}
  function getBestPrice(partSkuId) {
    const inv = invMap[partSkuId]
    if (inv && inv.avgUnitCost > 0) return inv.avgUnitCost
    const ibc = ibCostMap[partSkuId]
    if (ibc && ibc.totalQty > 0) return ibc.totalCost / ibc.totalQty
    const part = partsMap[partSkuId]
    if (part && part.unitPrice > 0) return part.unitPrice
    return 0
  }

  const now = new Date()
  const monthsList = []
  const inventoryByMonth = []
  const inboundByMonth = []
  const outboundByMonth = []
  let cumulativeInbound = 0, cumulativeOutbound = 0

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = d.toISOString().slice(0, 7)
    monthsList.push(ym)

    // 查询入库
    const ibWhere = { yearMonth: ym }
    if (factoryId) ibWhere.factoryId = factoryId
    let inboundValue = 0, outboundValue = 0
    try {
      const { data: ibLogs } = await db.collection('inventory_inbound_logs').where(ibWhere).limit(1000).get()
      inboundValue = ibLogs.reduce((s, l) => s + (l.totalPrice || 0), 0)
    } catch (e) { /* ignore */ }

    // 查询出库：先查出库日志，无则从更换记录统计
    const obWhere = { yearMonth: ym }
    if (factoryId) obWhere.factoryId = factoryId
    try {
      const { data: obLogs } = await db.collection('inventory_outbound_logs').where(obWhere).limit(1000).get()
      if (obLogs.length > 0) {
        for (const ob of obLogs) {
          let cost = ob.totalCost || 0
          if (!cost) cost = (ob.qty || 0) * getBestPrice(ob.partSkuId)
          outboundValue += cost
        }
      } else {
        // 无出库日志 → 从更换记录统计
        const repWhere = { yearMonth: ym, disabled: db.command.neq(true) }
        if (factoryId) repWhere.factoryId = factoryId
        const { data: repLogs } = await db.collection('replacement_logs').where(repWhere).limit(1000).get()
        for (const log of repLogs) {
          for (const item of (log.items || [])) {
            let cost = item.itemCost || ((item.qty || 0) * (item.unitCost || 0))
            if (!cost) cost = (item.qty || 0) * getBestPrice(item.partSkuId)
            outboundValue += cost
          }
        }
      }
    } catch (e) { /* ignore */ }

    cumulativeInbound += inboundValue
    cumulativeOutbound += outboundValue
    const inventoryValue = Math.round((cumulativeInbound - cumulativeOutbound) * 100) / 100

    inboundByMonth.push(Math.round(inboundValue * 100) / 100)
    outboundByMonth.push(Math.round(outboundValue * 100) / 100)
    inventoryByMonth.push(Math.max(0, inventoryValue))
  }
  return { ok: true, data: { months: monthsList, inventoryByMonth, inboundByMonth, outboundByMonth } }
}

async function getCostTrend(db, data, meUser) {
  const { factoryId, months = 6 } = data
  const fid = factoryId || meUser.factoryId || null

  // 预加载：配件表 + 库存表 + 入库日志（用于成本回退）
  const partsMap = {}
  const invMap = {}
  const ibCostMap = {}
  try {
    const { data: allParts } = await db.collection('parts').limit(1000).get()
    allParts.forEach(p => { partsMap[p.partSkuId] = p })
  } catch (e) {}
  try {
    const invWhere = {}
    if (fid) invWhere.factoryId = fid
    const { data: allInv } = await db.collection('inventory').where(invWhere).limit(1000).get()
    allInv.forEach(inv => { invMap[inv.partSkuId] = inv })
  } catch (e) {}
  try {
    const ibWhere = {}
    if (fid) ibWhere.factoryId = fid
    const { data: ibAll } = await db.collection('inventory_inbound_logs').where(ibWhere).limit(2000).get()
    for (const log of ibAll) {
      if (!ibCostMap[log.partSkuId]) ibCostMap[log.partSkuId] = { totalCost: 0, totalQty: 0 }
      ibCostMap[log.partSkuId].totalCost += (log.totalPrice || (log.qty || 0) * (log.unitPrice || 0))
      ibCostMap[log.partSkuId].totalQty += (log.qty || 0)
    }
  } catch (e) {}

  function getBestPrice(partSkuId) {
    const inv = invMap[partSkuId]
    if (inv && inv.avgUnitCost > 0) return inv.avgUnitCost
    const ibc = ibCostMap[partSkuId]
    if (ibc && ibc.totalQty > 0) return ibc.totalCost / ibc.totalQty
    const part = partsMap[partSkuId]
    if (part && part.unitPrice > 0) return part.unitPrice
    return 0
  }

  const now = new Date()
  const trend = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = d.toISOString().slice(0, 7)

    // 优先从出库记录统计（有准确成本），无数据则从更换记录统计
    let totalCost = 0
    const obWhere = { yearMonth: ym }
    if (fid) obWhere.factoryId = fid
    const { data: obLogs } = await db.collection('inventory_outbound_logs').where(obWhere).limit(1000).get()

    if (obLogs.length > 0) {
      for (const ob of obLogs) {
        let cost = ob.totalCost || 0
        if (!cost) cost = (ob.qty || 0) * getBestPrice(ob.partSkuId)
        totalCost += cost
      }
    } else {
      // 回退到更换记录
      const logWhere = { yearMonth: ym, disabled: _.neq(true) }
      if (fid) logWhere.factoryId = fid
      const { data: logs } = await db.collection('replacement_logs').where(logWhere).limit(1000).get()
      logs.forEach(l => {
        (l.items || []).forEach(item => {
          let cost = item.itemCost || ((item.qty || 0) * (item.unitCost || 0))
          if (!cost) cost = (item.qty || 0) * getBestPrice(item.partSkuId)
          totalCost += cost
        })
      })
    }

    trend.push({ yearMonth: ym, totalCost: Math.round(totalCost * 100) / 100 })
  }
  return { ok: true, data: { trend } }
}

async function bindOpenid(db, data) {
  const { userId, openid } = data
  if (!userId || !openid) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少参数' } }
  await db.collection('users').where({ userId }).update({ data: { openid, updatedAt: Date.now() } })
  return { ok: true, data: {} }
}

// ====== 主入口 ======

exports.main = async (event, context) => {
  // 首次调用时自动初始化所有数据库集合
  await ensureAllCollections(db)

  try {
    let body = event
    if (event.body && typeof event.body === 'string') {
      try {
        body = JSON.parse(event.body)
      } catch (e) {
        return { ok: false, error: { code: 'INVALID_BODY', message: '请求体格式错误' } }
      }
    }
    const { token, action, data = {} } = body
    const me = verifyToken(token)
    if (!me) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '登录已过期或无效，请重新登录' } }
    }
    const meUser = { userId: me.userId, role: me.role, factoryId: me.factoryId || null }

    // 需要管理员权限的 action
    const adminOnlyActions = [
      'listUsers', 'createUser', 'updateUser', 'disableUser', 'deleteUser', 'unbindOpenid', 'bindOpenid',
      'createFactory', 'updateFactory',
      'createAsset', 'updateAsset', 'setAssetStatus',
      'createPart', 'updatePart', 'importPartsCommit',
      'deletePart', 'batchSetPartsActive', 'batchDeleteParts',
      'deleteInboundLog', 'deleteOutboundLog',
      'setAIConfig',
    ]
    if (adminOnlyActions.includes(action) && me.role !== 'Admin') {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '仅管理员可执行此操作' } }
    }

    const supervisorActions = ['submitFacilityLog']
    if (supervisorActions.includes(action) && !['Admin', 'Supervisor'].includes(me.role)) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '仅主管或管理员可执行此操作' } }
    }

    switch (action) {
      // 用户 & 认证
      case 'getMe': return await getMe(db, me.userId)
      case 'listUsers': return await listUsers(db, meUser)
      case 'createUser': return await createUser(db, data)
      case 'updateUser': return await updateUser(db, data)
      case 'disableUser': return await disableUser(db, data)
      case 'deleteUser': return await deleteUser(db, data, meUser)
      case 'unbindOpenid': return await unbindOpenid(db, data)
      case 'bindOpenid': return await bindOpenid(db, data)

      // 设备管理
      case 'listAssets': return await listAssets(db, data)
      case 'createAsset': return await createAsset(db, data)
      case 'updateAsset': return await updateAsset(db, data)
      case 'setAssetStatus': return await setAssetStatus(db, data)

      // 部位管理
      case 'listLocations': return await listLocations(db, data)
      case 'upsertLocation': return await upsertLocation(db, data)
      case 'deleteLocation': return await deleteLocation(db, data)
      case 'copyLocations': return await copyLocations(db, data)

      // 部位-配件映射
      case 'listLocationPartMap': return await listLocationPartMap(db, data)
      case 'upsertLocationPartMap': return await upsertLocationPartMap(db, data)
      case 'deleteLocationPartMap': return await deleteLocationPartMap(db, data)

      // 配件管理
      case 'listParts': return await listParts(db, data)
      case 'createPart': return await createPart(db, data)
      case 'updatePart': return await updatePart(db, data)
      case 'deletePart': return await deletePart(db, data, meUser)
      case 'batchSetPartsActive': return await batchSetPartsActive(db, data, meUser)
      case 'batchDeleteParts': return await batchDeleteParts(db, data, meUser)
      case 'importPartsPreview': return await importPartsPreview(db, data)
      case 'importPartsCommit': return await importPartsCommit(db, data)
      case 'cleanupParts': return await cleanupParts(db, data)
      case 'migratePartsToFactory': return await migratePartsToFactory(db, data)
      case 'getFileUrls': return await getFileUrls(data)

      // 阈值管理
      case 'listThresholds': return await listThresholds(db, data)
      case 'upsertThreshold': return await upsertThreshold(db, data)
      case 'batchUpsertThresholds': return await batchUpsertThresholds(db, data)
      case 'deleteThreshold': return await deleteThreshold(db, data)

      // 报警
      case 'listAlerts': return await listAlerts(db, data)
      case 'ackAlert': return await ackAlert(db, data, meUser)

      // 更换记录
      case 'listReplacementLogs': return await listReplacementLogs(db, data)
      case 'toggleLogStatus': return await toggleLogStatus(db, data)
      case 'editReplacementLogItems': return await editReplacementLogItems(db, data, meUser)
      case 'submitFacilityLog': return await submitFacilityLog(db, data, meUser)
      case 'getFacilityOutboundSummary': return await getFacilityOutboundSummary(db, data)

      // 看板 & 报告
      case 'getDashboardStats': return await getDashboardStats(db, data, meUser)
      case 'getDashboardPartDetail': return await getDashboardPartDetail(db, data, meUser)
      case 'getDashboardAssetDetail': return await getDashboardAssetDetail(db, data, meUser)
      case 'getDashboardAssetAlerts': return await getDashboardAssetAlerts(db, data, meUser)
      case 'getAIReport': return await getAIReport(db, data, meUser)
      case 'listAIReports': return await listAIReports(db, data, meUser)
      case 'getAIReportDetail': return await getAIReportDetail(db, data)
      case 'deleteAIReport': return await deleteAIReport(db, data, meUser)
      case 'getAIConfig': return await getAIConfig(db)
      case 'setAIConfig': return await setAIConfig(db, data)
      case 'getMonthlyCostRanking': return await getMonthlyCostRanking(db, data, meUser)
      case 'getPartUsageCostList': return await getPartUsageCostList(db, data, meUser)
      case 'getAssetCostDetail': return await getAssetCostDetail(db, data)
      case 'getCostTrend': return await getCostTrend(db, data, meUser)

      // 工厂管理
      case 'getFactories': return await getFactories(db, meUser)
      case 'createFactory': return await createFactory(db, data)
      case 'updateFactory': return await updateFactory(db, data)

      // 库存管理
      case 'listInventory': return await listInventory(db, data)
      case 'inventoryInbound': return await inventoryInbound(db, data)
      case 'listInboundLogs': return await listInboundLogs(db, data)
      case 'listOutboundLogs': return await listOutboundLogs(db, data)
      case 'deleteInboundLog': return await deleteInboundLog(db, data, meUser)
      case 'deleteOutboundLog': return await deleteOutboundLog(db, data, meUser)
      case 'listInventoryAlerts': return await listInventoryAlerts(db, data)
      case 'updateInventoryThreshold': return await updateInventoryThreshold(db, data)
      case 'getInventorySummary': return await getInventorySummary(db, data)
      case 'getInventoryTrend': return await getInventoryTrend(db, data)

      default:
        return { ok: false, error: { code: 'UNKNOWN_ACTION', message: '不支持的 action: ' + action } }
    }
  } catch (err) {
    console.error('pcGateway error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误: ' + (err.message || String(err)) } }
  }
}
