// 云函数：listAlerts — 查询报警列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { status, yearMonth, assetId, page = 1, pageSize = 20 } = event

    const where = {}
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
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误' } }
  }
}
