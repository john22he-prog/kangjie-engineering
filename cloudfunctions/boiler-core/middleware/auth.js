const { query } = require('../db')

async function authenticate(cloud, event) {
  // PC 端通过 pcGateway 转发时携带 _pcAuth，跳过 OPENID 鉴权
  if (event && event._pcAuth) {
    return event._pcAuth
  }

  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    throw { code: 401, message: '无法获取用户身份' }
  }

  const rows = await query(
    'SELECT id, openid, role, factory_id, real_name, status FROM app_user WHERE openid = ? LIMIT 1',
    [OPENID]
  )

  if (rows.length === 0) {
    throw { code: 401, message: '用户未注册，请联系管理员' }
  }

  const user = rows[0]
  if (user.status === 0) {
    throw { code: 403, message: '账号已被禁用，请联系管理员' }
  }

  return {
    id: user.id,
    openid: user.openid,
    role: user.role,
    factory_id: user.factory_id,
    real_name: user.real_name,
  }
}

module.exports = { authenticate }
