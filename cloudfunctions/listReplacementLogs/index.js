// 云函数：listReplacementLogs — 查询更换记录列表
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

    const { factoryId, yearMonth, assetId, userId, page = 1, pageSize = 20 } = event

    let query = db.collection('replacement_logs')

    // 构建查询条件
    const where = {}
    if (factoryId) where.factoryId = factoryId
    if (yearMonth) where.yearMonth = yearMonth
    if (assetId) where.assetId = assetId
    if (userId) where.reporterUserIdSnapshot = userId

    const skip = (page - 1) * pageSize

    const { data: list } = await query
      .where(where)
      .orderBy('ts', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()

    // 总数（可选，CloudBase count 有限制）
    const { total } = await query.where(where).count()

    return {
      ok: true,
      data: { list, total }
    }
  } catch (err) {
    console.error('listReplacementLogs error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '查询记录失败: ' + (err.message || String(err)) } }
  }
}
