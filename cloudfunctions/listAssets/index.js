// 云函数：listAssets — 获取设备列表（用于小程序筛选下拉等）
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

    // 获取用户信息（用于 factoryId 过滤）
    const { data: users } = await db.collection('users')
      .where({ openid, status: 'active' })
      .limit(1)
      .get()
    const user = users.length > 0 ? users[0] : null
    const factoryId = user ? (user.factoryId || null) : null

    // 构建查询条件
    const query = { status: 'active' }
    if (factoryId) {
      query.factoryId = factoryId
    }

    // 获取设备列表
    const { data: assetList } = await db.collection('assets')
      .where(query)
      .orderBy('assetNo', 'asc')
      .limit(1000)
      .get()

    const list = assetList.map(a => ({
      assetId: a.assetId,
      assetName: a.assetName,
      assetNo: a.assetNo,
      workshop: a.workshop || '',
      status: a.status
    }))

    return { ok: true, data: { list } }
  } catch (err) {
    console.error('listAssets error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误' } }
  }
}
