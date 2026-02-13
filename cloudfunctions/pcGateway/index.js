// 云函数：pcGateway — PC 端统一入口，验证 JWT 后按 action 执行业务
// 调用方：通过 HTTP API 或网关调用，event 需含 { token, action, data }
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const JWT_SECRET = process.env.JWT_SECRET || 'kangjie-pc-admin-secret-change-in-production'

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
  const { factoryId, yearMonth, assetId, userId, page = 1, pageSize = 20 } = data
  const where = {}
  if (factoryId) where.factoryId = factoryId
  if (yearMonth) where.yearMonth = yearMonth
  if (assetId) where.assetId = assetId
  if (userId) where.reporterUserIdSnapshot = userId

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
  return { ok: true, data: { list } }
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

async function listLocations(db, data) {
  const where = {}
  if (data.assetId) where.assetId = data.assetId

  const { data: list } = await db.collection('asset_locations').where(where).limit(1000).get()
  return { ok: true, data: { list } }
}

async function listLocationPartMap(db, data) {
  const where = { active: true }
  if (data.assetId) where.assetId = data.assetId
  if (data.locationId) where.locationId = data.locationId

  const { data: list } = await db.collection('location_part_map').where(where).limit(1000).get()
  return { ok: true, data: { list } }
}

async function getFactories(db, meUser) {
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

  const { data: logs } = await db.collection('replacement_logs').where(logWhere).limit(1000).get()
  const { data: alerts } = await db.collection('alerts').where(alertWhere).limit(1000).get()

  const openAlerts = alerts.filter(a => a.status === 'OPEN')
  let totalPartsQty = 0
  const partUsageMap = {}
  const assetCountMap = {}

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
  })

  const topParts = Object.values(partUsageMap).sort((a, b) => b.totalQty - a.totalQty).slice(0, 5)
  const topAssets = Object.values(assetCountMap).sort((a, b) => b.logCount - a.logCount).slice(0, 5)

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
    },
  }
}

// ====== 主入口 ======

exports.main = async (event, context) => {
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

    switch (action) {
      case 'getMe':
        return await getMe(db, me.userId)
      case 'listReplacementLogs':
        return await listReplacementLogs(db, data)
      case 'listAlerts':
        return await listAlerts(db, data)
      case 'ackAlert':
        return await ackAlert(db, data, meUser)
      case 'listAssets':
        return await listAssets(db, data)
      case 'listParts':
        return await listParts(db)
      case 'listThresholds':
        return await listThresholds(db, data)
      case 'upsertThreshold':
        return await upsertThreshold(db, data)
      case 'listUsers':
        return await listUsers(db, meUser)
      case 'listLocations':
        return await listLocations(db, data)
      case 'listLocationPartMap':
        return await listLocationPartMap(db, data)
      case 'getFactories':
        return await getFactories(db, meUser)
      case 'getDashboardStats':
        return await getDashboardStats(db, data, meUser)
      default:
        return { ok: false, error: { code: 'UNKNOWN_ACTION', message: '不支持的 action: ' + action } }
    }
  } catch (err) {
    console.error('pcGateway error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误' } }
  }
}
