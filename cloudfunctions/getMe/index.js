// 云函数：getMe — 获取当前用户信息
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    if (!openid) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '无法获取用户身份' } }
    }

    // 按 openid 查找用户
    const { data } = await db.collection('users').where({ openid, status: 'active' }).limit(1).get()

    if (data.length === 0) {
      return { ok: false, error: { code: 'AUTH_NOT_BOUND', message: '当前微信未绑定账号，请联系管理员' } }
    }

    const user = data[0]

    if (user.status === 'disabled') {
      return { ok: false, error: { code: 'USER_DISABLED', message: '账号已禁用' } }
    }

    return {
      ok: true,
      data: {
        userId: user.userId,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        factoryId: user.factoryId || null
      }
    }
  } catch (err) {
    console.error('getMe error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误' } }
  }
}
