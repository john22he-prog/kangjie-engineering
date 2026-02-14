// 云函数：pcGateway — PC 端统一入口，验证 JWT 后按 action 执行业务
// 调用方：通过 HTTP API 或网关调用，event 需含 { token, action, data }
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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
  const { factoryId, yearMonth, assetId, userId, status, page = 1, pageSize = 20 } = data
  const where = {}
  if (factoryId) where.factoryId = factoryId
  if (yearMonth) where.yearMonth = yearMonth
  if (assetId) where.assetId = assetId
  if (userId) where.reporterUserIdSnapshot = userId
  // 状态筛选：active/disabled，不传则显示全部
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

  return { ok: true, data: { list, total, page, pageSize } }
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

async function listAlerts(db, data) {
  const { factoryId, status, yearMonth, assetId, page = 1, pageSize = 20 } = data
  const where = {}
  if (factoryId) where.factoryId = factoryId
  if (status) where.status = status
  if (yearMonth) where.yearMonth = yearMonth
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

async function listParts(db) {
  const { data: list } = await db.collection('parts').limit(1000).get()
  return { ok: true, data: { list } }
}

async function listThresholds(db, data) {
  const where = { active: true }
  if (data.assetId) where.assetId = data.assetId

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
  const yearMonth = data.yearMonth || new Date().toISOString().slice(0, 7)
  let factoryId = data.factoryId || meUser.factoryId || null

  if (!factoryId && meUser.role !== 'Admin') {
    const fullUser = await loadMe(db, meUser.userId)
    if (fullUser && fullUser.factoryId) factoryId = fullUser.factoryId
  }

  const logWhere = { yearMonth }
  const alertWhere = { yearMonth }
  if (factoryId) {
    logWhere.factoryId = factoryId
    alertWhere.factoryId = factoryId
  }

  logWhere.disabled = _.neq(true)
  const { data: logs } = await db.collection('replacement_logs').where(logWhere).limit(1000).get()
  const { data: alerts } = await db.collection('alerts').where(alertWhere).limit(1000).get()

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
        partUsageMap[item.partSkuId] = { partSkuId: item.partSkuId, partName: item.partNameSnapshot, totalQty: 0 }
      }
      partUsageMap[item.partSkuId].totalQty += item.qty || 0
    })
    if (!assetCountMap[l.assetId]) {
      assetCountMap[l.assetId] = { assetId: l.assetId, assetName: l.assetNameSnapshot, assetNo: l.assetNoSnapshot, logCount: 0 }
    }
    assetCountMap[l.assetId].logCount++
    // 工程师工作量统计
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

  // 最近7天更换趋势
  const dailyTrend = []
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
      yearMonth,
      totalLogs: logs.length,
      totalPartsQty,
      openAlerts: openAlerts.length,
      totalAlerts: alerts.length,
      topParts,
      topAssets,
      engineerWorkload,
      dailyTrend,
      alertsByAsset,
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
  const { partCode, partName, specModel, unit, unitPrice, category } = data
  if (!partCode || !partName) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '配件编号和名称为必填项' } }
  }
  const { data: existing } = await db.collection('parts').where({ partCode }).limit(1).get()
  if (existing.length > 0) {
    // 重复时自动覆盖更新
    await db.collection('parts').where({ partCode }).update({
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
  const { data: allParts } = await db.collection('parts').limit(2000).get()
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
  return { ok: true, data: {} }
}

async function importPartsPreview(db, data) {
  // 预览导入配件数据（不写入数据库，仅做校验）
  const { rows } = data
  if (!rows || !Array.isArray(rows)) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '数据格式错误' } }
  }
  const errors = []
  const valid = []
  rows.forEach((row, idx) => {
    if (!row.partCode || !row.partName) {
      errors.push({ row: idx + 1, message: '配件编号和名称为必填项' })
    } else {
      valid.push(row)
    }
  })
  return { ok: true, data: { valid, errors, totalRows: rows.length } }
}

async function importPartsCommit(db, data) {
  const { rows } = data
  if (!rows || !Array.isArray(rows)) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '数据格式错误' } }
  }
  let created = 0, skipped = 0
  for (const row of rows) {
    if (!row.partCode || !row.partName) { skipped++; continue }
    const { data: existing } = await db.collection('parts').where({ partCode: row.partCode }).limit(1).get()
    if (existing.length > 0) { skipped++; continue }
    const partSkuId = row.partSkuId || ('PSK-' + Date.now() + '-' + Math.random().toString(36).slice(2, 4))
    await db.collection('parts').add({
      data: {
        partSkuId, partCode: row.partCode, partName: row.partName,
        specModel: row.specModel || '', unit: row.unit || '个',
        unitPrice: row.unitPrice || 0, category: row.category || '',
        active: true, createdAt: Date.now(), updatedAt: Date.now(),
      },
    })
    created++
  }
  return { ok: true, data: { created, skipped } }
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
async function aggregateMonthData(db, factoryId, yearMonth) {
  const logWhere = { yearMonth, disabled: _.neq(true) }
  const alertWhere = { yearMonth }
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
  // 出库成本
  try {
    const obWhere = { yearMonth }
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
  const yearMonth = data.yearMonth || new Date().toISOString().slice(0, 7)
  const factoryId = data.factoryId || meUser.factoryId || null
  const scope = data.scope || 'factory'
  const promptType = data.promptType || 'monthly_summary'

  // 计算上月
  const d = new Date(yearMonth + '-01')
  d.setMonth(d.getMonth() - 1)
  const prevYm = d.toISOString().slice(0, 7)

  let current, prev
  let byFactory = []

  if (scope === 'summary') {
    current = await aggregateMonthData(db, null, yearMonth)
    prev = await aggregateMonthData(db, null, prevYm)
    try {
      const { data: factories } = await db.collection('factories').limit(100).get()
      for (const f of factories) {
        const fc = await aggregateMonthData(db, f.factoryId, yearMonth)
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
    current = await aggregateMonthData(db, factoryId, yearMonth)
    prev = await aggregateMonthData(db, factoryId, prevYm)
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
  const { partSkuId, yearMonth } = data
  if (!partSkuId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 partSkuId' } }
  const ym = yearMonth || new Date().toISOString().slice(0, 7)
  const where = { yearMonth: ym, disabled: _.neq(true) }
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
      partCode, unit, yearMonth: ym, totalQty,
      byAsset,
    },
  }
}

async function getDashboardAssetDetail(db, data, meUser) {
  const { assetId, yearMonth } = data
  if (!assetId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 assetId' } }
  const ym = yearMonth || new Date().toISOString().slice(0, 7)

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

  const { data: logs } = await db.collection('replacement_logs').where({ assetId, yearMonth: ym, disabled: _.neq(true) }).limit(1000).get()

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
      assetId, assetName, assetNo, workshop, yearMonth: ym,
      totalLogCount, totalPartTypes,
      byPart,
    },
  }
}

async function getDashboardAssetAlerts(db, data, meUser) {
  const { assetId, yearMonth } = data
  if (!assetId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 assetId' } }
  const ym = yearMonth || new Date().toISOString().slice(0, 7)
  const where = { assetId, status: 'OPEN' }
  if (yearMonth) where.yearMonth = yearMonth
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

    // 写入入库记录到 inventory_inbound_logs（与 adminInventoryInbound 保持一致）
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
    // 更新库存
    const { data: inv } = await db.collection('inventory').where({ factoryId, partSkuId: item.partSkuId }).limit(1).get()
    if (inv.length > 0) {
      await db.collection('inventory').where({ factoryId, partSkuId: item.partSkuId }).update({
        data: { currentQty: _.inc(itemQty), updatedAt: now },
      })
    } else {
      await db.collection('inventory').add({
        data: {
          inventoryId: 'inv-' + now + '-' + Math.random().toString(36).slice(2, 6),
          factoryId, partSkuId: item.partSkuId,
          partNameSnapshot: partInfo.partName || '',
          partCodeSnapshot: partInfo.partCode || '',
          currentQty: itemQty, threshold: 0,
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
  if (data.yearMonth) where.yearMonth = data.yearMonth
  const { data: list } = await db.collection('inventory_inbound_logs').where(where).orderBy('ts', 'desc').limit(1000).get()
  return { ok: true, data: { list } }
}

async function listOutboundLogs(db, data) {
  const where = {}
  if (data.factoryId) where.factoryId = data.factoryId
  if (data.yearMonth) where.yearMonth = data.yearMonth
  const { data: list } = await db.collection('inventory_outbound_logs').where(where).orderBy('ts', 'desc').limit(1000).get()
  return { ok: true, data: { list } }
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
  const yearMonth = data.yearMonth || new Date().toISOString().slice(0, 7)
  const { data: invList } = await db.collection('inventory').where(where).limit(1000).get()
  const totalItems = invList.length
  const totalQty = invList.reduce((sum, inv) => sum + (inv.currentQty || 0), 0)
  const lowStockCount = invList.filter(inv => inv.threshold > 0 && inv.currentQty <= inv.threshold).length

  // 计算库存总价值（需要配件单价信息）
  let totalInventoryValue = 0
  try {
    const { data: parts } = await db.collection('parts').limit(1000).get()
    const priceMap = {}
    parts.forEach(p => { priceMap[p.partSkuId] = p.unitPrice || 0 })
    totalInventoryValue = invList.reduce((sum, inv) => sum + (inv.currentQty || 0) * (priceMap[inv.partSkuId] || 0), 0)
  } catch (e) { /* ignore */ }

  // 当月入库金额
  let totalInboundValue = 0
  try {
    const ibWhere = { yearMonth }
    if (data.factoryId) ibWhere.factoryId = data.factoryId
    const { data: ibLogs } = await db.collection('inventory_inbound_logs').where(ibWhere).limit(1000).get()
    totalInboundValue = ibLogs.reduce((s, l) => s + (l.totalPrice || 0), 0)
  } catch (e) { /* ignore */ }

  // 当月出库金额
  let totalOutboundValue = 0
  try {
    const obWhere = { yearMonth }
    if (data.factoryId) obWhere.factoryId = data.factoryId
    const { data: obLogs } = await db.collection('inventory_outbound_logs').where(obWhere).limit(1000).get()
    totalOutboundValue = obLogs.reduce((s, l) => s + (l.totalCost || 0), 0)
  } catch (e) { /* ignore */ }

  return {
    ok: true,
    data: {
      yearMonth, totalItems, totalQty, lowStockCount,
      totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
      totalInboundValue: Math.round(totalInboundValue * 100) / 100,
      totalOutboundValue: Math.round(totalOutboundValue * 100) / 100,
    },
  }
}

async function getMonthlyCostRanking(db, data, meUser) {
  const ym = data.yearMonth || new Date().toISOString().slice(0, 7)
  const factoryId = data.factoryId || meUser.factoryId || null
  const logWhere = { yearMonth: ym, disabled: _.neq(true) }
  if (factoryId) logWhere.factoryId = factoryId
  const { data: logs } = await db.collection('replacement_logs').where(logWhere).limit(1000).get()
  const costMap = {}
  logs.forEach(l => {
    (l.items || []).forEach(item => {
      const key = item.partSkuId
      if (!costMap[key]) costMap[key] = { partSkuId: key, partName: item.partNameSnapshot, totalQty: 0, totalCost: 0 }
      costMap[key].totalQty += item.qty || 0
      costMap[key].totalCost += (item.qty || 0) * (item.unitPrice || 0)
    })
  })
  const ranking = Object.values(costMap).sort((a, b) => b.totalCost - a.totalCost)
  return { ok: true, data: { list: ranking } }
}

async function getPartUsageCostList(db, data, meUser) {
  return getMonthlyCostRanking(db, data, meUser)
}

async function getAssetCostDetail(db, data) {
  const { factoryId, assetId, yearMonth } = data
  if (!assetId) return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 assetId' } }
  const ym = yearMonth || new Date().toISOString().slice(0, 7)
  const where = { assetId, yearMonth: ym, disabled: _.neq(true) }
  if (factoryId) where.factoryId = factoryId
  const { data: logs } = await db.collection('replacement_logs').where(where).limit(1000).get()
  let totalCost = 0
  const parts = {}
  logs.forEach(l => {
    (l.items || []).forEach(item => {
      const cost = (item.qty || 0) * (item.unitPrice || 0)
      totalCost += cost
      if (!parts[item.partSkuId]) parts[item.partSkuId] = { partSkuId: item.partSkuId, partName: item.partNameSnapshot, totalQty: 0, totalCost: 0 }
      parts[item.partSkuId].totalQty += item.qty || 0
      parts[item.partSkuId].totalCost += cost
    })
  })
  return { ok: true, data: { totalCost, parts: Object.values(parts), logCount: logs.length } }
}

async function getInventoryTrend(db, data) {
  const { factoryId, months = 6 } = data
  const now = new Date()
  const trend = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = d.toISOString().slice(0, 7)
    // 查询入库
    const ibWhere = { yearMonth: ym }
    if (factoryId) ibWhere.factoryId = factoryId
    let inboundValue = 0, outboundValue = 0
    try {
      const { data: ibLogs } = await db.collection('inventory_inbound_logs').where(ibWhere).limit(1000).get()
      inboundValue = ibLogs.reduce((s, l) => s + (l.totalPrice || 0), 0)
    } catch (e) { /* ignore */ }
    // 查询出库
    const obWhere = { yearMonth: ym }
    if (factoryId) obWhere.factoryId = factoryId
    try {
      const { data: obLogs } = await db.collection('inventory_outbound_logs').where(obWhere).limit(1000).get()
      outboundValue = obLogs.reduce((s, l) => s + (l.totalCost || 0), 0)
    } catch (e) { /* ignore */ }
    trend.push({ yearMonth: ym, inboundValue, outboundValue })
  }
  return { ok: true, data: { trend } }
}

async function getCostTrend(db, data, meUser) {
  const { factoryId, months = 6 } = data
  const fid = factoryId || meUser.factoryId || null
  const now = new Date()
  const trend = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = d.toISOString().slice(0, 7)
    const logWhere = { yearMonth: ym, disabled: _.neq(true) }
    if (fid) logWhere.factoryId = fid
    const { data: logs } = await db.collection('replacement_logs').where(logWhere).limit(1000).get()
    let totalCost = 0
    logs.forEach(l => {
      (l.items || []).forEach(item => {
        totalCost += (item.qty || 0) * (item.unitPrice || 0)
      })
    })
    trend.push({ yearMonth: ym, totalCost })
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
      'setAIConfig',
    ]
    if (adminOnlyActions.includes(action) && me.role !== 'Admin') {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '仅管理员可执行此操作' } }
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
      case 'listParts': return await listParts(db)
      case 'createPart': return await createPart(db, data)
      case 'updatePart': return await updatePart(db, data)
      case 'importPartsPreview': return await importPartsPreview(db, data)
      case 'importPartsCommit': return await importPartsCommit(db, data)
      case 'cleanupParts': return await cleanupParts(db, data)
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
