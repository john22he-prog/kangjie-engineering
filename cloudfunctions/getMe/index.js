// 云函数：getMe — 获取当前用户信息
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const { migratePermissions } = require('./permissions')

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    if (!openid) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '无法获取用户身份' } }
    }

    const { data } = await db.collection('users').where({ openid }).limit(1).get()

    if (data.length === 0) {
      return { ok: false, error: { code: 'AUTH_NOT_BOUND', message: '当前微信未绑定账号，请联系管理员' } }
    }

    const user = data[0]

    if (user.status === 'disabled') {
      return { ok: false, error: { code: 'USER_DISABLED', message: '您的账号已被管理员禁用，如有疑问请联系管理员' } }
    }

    const permissions = migratePermissions(user)

    return {
      ok: true,
      data: {
        userId: user.userId,
        displayName: user.displayName,
        role: user.role,
        permissions,
        status: user.status,
        factoryId: user.factoryId || null,
        factoryIds: user.factoryIds || (user.factoryId ? [user.factoryId] : []),
      }
    }
  } catch (err) {
    console.error('getMe error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '获取用户失败: ' + (err.message || String(err)) } }
  }
}
