const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const { query, transaction } = require('./db')

// ─── 错误码 ───
const ERR = {
  NOT_REGISTERED: { code: 1001, message: '用户未注册' },
  ACCOUNT_DISABLED: { code: 1002, message: '账号已禁用' },
  PERMISSION_DENIED: { code: 2001, message: '无操作权限' },
  SYSTEM_ERROR: { code: 9999, message: '系统异常' },
}

function ok(data) {
  return { code: 0, data }
}

function fail(err, detail) {
  return { code: err.code, message: detail || err.message }
}

// ─── 鉴权中间件 ───
async function auth(openid, requiredRole) {
  if (!openid) return { err: ERR.NOT_REGISTERED }

  const rows = await query('SELECT id, openid, nickname, real_name, role, factory_id, status FROM app_user WHERE openid = ? LIMIT 1', [openid])
  if (!rows.length) return { err: ERR.NOT_REGISTERED }

  const user = rows[0]
  if (user.status !== 1) return { err: ERR.ACCOUNT_DISABLED }

  if (requiredRole && user.role !== requiredRole) {
    return { err: ERR.PERMISSION_DENIED }
  }

  return { user }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  module: login（无需鉴权）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function loginGetOpenId() {
  const wxContext = cloud.getWXContext()
  return ok({ openid: wxContext.OPENID })
}

async function loginCheckLogin() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return fail(ERR.NOT_REGISTERED, '无法获取用户身份')

  const rows = await query(
    'SELECT id, openid, nickname, real_name, role, factory_id, status FROM app_user WHERE openid = ? LIMIT 1',
    [openid]
  )

  if (!rows.length) {
    return ok({ isRegistered: false })
  }

  const u = rows[0]
  if (u.status !== 1) return fail(ERR.ACCOUNT_DISABLED)

  let factoryName = null
  if (u.factory_id) {
    const fRows = await query('SELECT name FROM factory WHERE id = ? LIMIT 1', [u.factory_id])
    if (fRows.length) factoryName = fRows[0].name
  }

  return ok({
    isRegistered: true,
    user: {
      id: u.id,
      openid: u.openid,
      nickname: u.nickname,
      real_name: u.real_name,
      role: u.role,
      factory_id: u.factory_id,
      factory_name: factoryName,
    },
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  module: user（仅管理员）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function userList(data) {
  const page = parseInt(data.page) || 1
  const pageSize = parseInt(data.pageSize) || 20
  const offset = (page - 1) * pageSize

  let where = ''
  const params = []

  if (data.role) {
    where += ' AND u.role = ?'
    params.push(data.role)
  }
  if (data.factory_id) {
    where += ' AND u.factory_id = ?'
    params.push(data.factory_id)
  }

  const countRows = await query(
    `SELECT COUNT(*) AS total FROM app_user u WHERE 1=1${where}`,
    params
  )
  const total = countRows[0].total

  const rows = await query(
    `SELECT u.id, u.openid, u.nickname, u.real_name, u.role, u.factory_id, f.name AS factory_name, u.phone, u.status, u.created_at, u.updated_at
     FROM app_user u
     LEFT JOIN factory f ON u.factory_id = f.id
     WHERE 1=1${where}
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  )

  return ok({ list: rows, total, page, pageSize })
}

async function userCreate(data) {
  if (!data.openid || !data.role) {
    return fail(ERR.PERMISSION_DENIED, '缺少必填字段: openid, role')
  }
  if (data.role === 'operator' && !data.factory_id) {
    return fail(ERR.PERMISSION_DENIED, '操作员必须指定所属工厂')
  }

  const existing = await query('SELECT id FROM app_user WHERE openid = ? LIMIT 1', [data.openid])
  if (existing.length) {
    return fail({ code: 2001, message: '该 openid 已存在' })
  }

  const result = await query(
    `INSERT INTO app_user (openid, role, factory_id, real_name, nickname, phone, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
    [data.openid, data.role, data.factory_id || null, data.real_name || null, data.nickname || null, data.phone || null]
  )

  return ok({ id: result.insertId })
}

async function userUpdate(data) {
  if (!data.id) return fail(ERR.PERMISSION_DENIED, '缺少用户 id')

  const fields = []
  const params = []
  const allowedFields = ['role', 'factory_id', 'real_name', 'nickname', 'phone', 'status']

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`)
      params.push(data[key])
    }
  }

  if (!fields.length) return fail(ERR.PERMISSION_DENIED, '没有可更新的字段')

  fields.push('updated_at = NOW()')
  params.push(data.id)

  await query(`UPDATE app_user SET ${fields.join(', ')} WHERE id = ?`, params)
  return ok({ id: data.id })
}

async function userDetail(data) {
  if (!data.id) return fail(ERR.PERMISSION_DENIED, '缺少用户 id')

  const rows = await query(
    `SELECT u.id, u.openid, u.nickname, u.real_name, u.role, u.factory_id, f.name AS factory_name, u.phone, u.status, u.created_at, u.updated_at
     FROM app_user u
     LEFT JOIN factory f ON u.factory_id = f.id
     WHERE u.id = ?
     LIMIT 1`,
    [data.id]
  )

  if (!rows.length) return fail({ code: 1001, message: '用户不存在' })
  return ok(rows[0])
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  module: config（仅管理员）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function configListPrices(data) {
  let where = ''
  const params = []

  if (data.factory_id) {
    where += ' AND factory_id = ?'
    params.push(data.factory_id)
  }
  if (data.price_type) {
    where += ' AND price_type = ?'
    params.push(data.price_type)
  }

  const rows = await query(
    `SELECT * FROM price_config WHERE 1=1${where} ORDER BY factory_id, price_type, effective_from DESC`,
    params
  )

  return ok({ list: rows })
}

async function configSetPrice(data) {
  const required = ['price_type', 'unit_price', 'unit', 'effective_from']
  for (const key of required) {
    if (data[key] === undefined || data[key] === null || data[key] === '') {
      return fail(ERR.PERMISSION_DENIED, `缺少必填字段: ${key}`)
    }
  }

  await transaction(async (conn) => {
    await conn.query(
      `UPDATE price_config
       SET effective_to = DATE_SUB(?, INTERVAL 1 DAY), updated_at = NOW()
       WHERE factory_id <=> ? AND price_type = ? AND effective_to IS NULL`,
      [data.effective_from, data.factory_id || null, data.price_type]
    )

    await conn.query(
      `INSERT INTO price_config (factory_id, price_type, unit_price, unit, effective_from, effective_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
      [data.factory_id || null, data.price_type, data.unit_price, data.unit, data.effective_from]
    )
  })

  return ok({ success: true })
}

async function configListAlertRules(data) {
  let where = ''
  const params = []

  if (data.factory_id) {
    where += ' AND factory_id = ?'
    params.push(data.factory_id)
  }
  if (data.metric_key) {
    where += ' AND metric_key = ?'
    params.push(data.metric_key)
  }
  if (data.status !== undefined) {
    where += ' AND status = ?'
    params.push(data.status)
  }

  const rows = await query(
    `SELECT * FROM alert_rule WHERE 1=1${where} ORDER BY factory_id, metric_key`,
    params
  )

  return ok({ list: rows })
}

async function configSetAlertRule(data) {
  if (data.id) {
    const fields = []
    const params = []
    const allowed = ['factory_id', 'metric_key', 'threshold_min', 'threshold_max', 'comparison', 'message_template', 'status']

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`)
        params.push(data[key])
      }
    }

    if (!fields.length) return fail(ERR.PERMISSION_DENIED, '没有可更新的字段')

    fields.push('updated_at = NOW()')
    params.push(data.id)

    await query(`UPDATE alert_rule SET ${fields.join(', ')} WHERE id = ?`, params)
    return ok({ id: data.id })
  }

  if (!data.metric_key) {
    return fail(ERR.PERMISSION_DENIED, '缺少必填字段: metric_key')
  }

  const result = await query(
    `INSERT INTO alert_rule (factory_id, metric_key, threshold_min, threshold_max, comparison, message_template, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      data.factory_id || null,
      data.metric_key,
      data.threshold_min ?? null,
      data.threshold_max ?? null,
      data.comparison || null,
      data.message_template || null,
      data.status !== undefined ? data.status : 1,
    ]
  )

  return ok({ id: result.insertId })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  路由表
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const routes = {
  login: {
    getOpenId: loginGetOpenId,
    checkLogin: loginCheckLogin,
  },
  user: {
    list: userList,
    create: userCreate,
    update: userUpdate,
    detail: userDetail,
  },
  config: {
    listPrices: configListPrices,
    setPrice: configSetPrice,
    listAlertRules: configListAlertRules,
    setAlertRule: configSetAlertRule,
  },
}

const AUTH_REQUIRED_MODULES = ['user', 'config']

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  入口
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

exports.main = async (event) => {
  const { module: mod, action } = event

  if (!mod || !action || !routes[mod] || !routes[mod][action]) {
    return fail({ code: 9999, message: `未知路由: ${mod}/${action}` })
  }

  try {
    if (AUTH_REQUIRED_MODULES.includes(mod)) {
      const wxContext = cloud.getWXContext()
      const openid = wxContext.OPENID
      const { err } = await auth(openid, 'admin')
      if (err) return fail(err)
    }

    return await routes[mod][action](event)
  } catch (e) {
    console.error(`[boiler-auth] ${mod}/${action} error:`, e)
    return fail(ERR.SYSTEM_ERROR, e.message || '服务异常，请稍后重试')
  }
}
