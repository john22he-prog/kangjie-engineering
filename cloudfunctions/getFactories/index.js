// 云函数：getFactories — 获取当前用户可访问的工厂列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    // 获取当前用户
    const { data: users } = await db.collection('users').where({ openid, status: 'active' }).limit(1).get()
    if (users.length === 0) {
      return { ok: false, error: { code: 'AUTH_NOT_BOUND', message: '未绑定或账号已禁用' } }
    }
    const user = users[0]

    // Management/Admin 可查看所有工厂
    let factoryQuery = db.collection('factories').where({ status: 'active' })

    if (!['Management', 'Admin'].includes(user.role)) {
      // 普通用户只能看到自己所属工厂
      if (!user.factoryId) {
        return { ok: false, error: { code: 'NO_FACTORY', message: '未分配工厂' } }
      }
      factoryQuery = db.collection('factories').where({ factoryId: user.factoryId, status: 'active' })
    }

    const { data: factories } = await factoryQuery.orderBy('factoryCode', 'asc').get()

    return {
      ok: true,
      data: {
        factories,
        userFactoryId: user.factoryId || null,
        canSwitchFactory: ['Management', 'Admin'].includes(user.role)
      }
    }
  } catch (err) {
    console.error('getFactories error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '获取工厂失败: ' + (err.message || String(err)) } }
  }
}
