// 云函数：listAlerts — 查询报警列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // openid 校验：确保调用者已登录小程序
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '无法获取用户身份' } }
    }

    const { factoryId, status, yearMonth, assetId, page = 1, pageSize = 20 } = event

    const where = {}
    if (factoryId) where.factoryId = factoryId
    if (status) where.status = status
    if (yearMonth) where.yearMonth = yearMonth
    if (assetId) where.assetId = assetId

    const skip = (page - 1) * pageSize

    const { data: list } = await db.collection('alerts')
      .where(where)
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()

    const { total } = await db.collection('alerts').where(where).count()

    return {
      ok: true,
      data: { list, total }
    }
  } catch (err) {
    console.error('listAlerts error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '查询报警失败: ' + (err.message || String(err)) } }
  }
}
