// 云函数：getAssetByQr — 扫码获取设备详情
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

    const { assetId } = event
    if (!assetId) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 assetId' } }
    }

    // 查设备
    let assets = []
    try {
      const res = await db.collection('assets').where({ assetId }).limit(1).get()
      assets = res.data
    } catch (e) {
      console.error('查询 assets 集合失败:', e.message)
      return { ok: false, error: { code: 'DB_ERROR', message: '查询设备失败，数据库集合可能不存在: ' + e.message } }
    }

    if (assets.length === 0) {
      return { ok: false, error: { code: 'ASSET_NOT_FOUND', message: '未找到设备: ' + assetId + '，请确认设备已导入' } }
    }
    const asset = assets[0]
    if (asset.status !== 'active') {
      return { ok: false, error: { code: 'ASSET_INACTIVE', message: '设备已停用: ' + assetId } }
    }

    // 查部位（容错）
    let locations = []
    try {
      const locRes = await db.collection('asset_locations')
        .where({ assetId, active: true })
        .orderBy('sortOrder', 'asc')
        .get()
      locations = locRes.data
    } catch (e) {
      console.log('查询 asset_locations 失败（可忽略）:', e.message)
    }

    // 最近10条记录（容错）
    let recentLogs = []
    try {
      const logRes = await db.collection('replacement_logs')
        .where({ assetId })
        .orderBy('ts', 'desc')
        .limit(10)
        .get()
      recentLogs = logRes.data
    } catch (e) {
      console.log('查询 replacement_logs 失败（可忽略）:', e.message)
    }

    return {
      ok: true,
      data: { asset, locations, recentLogs }
    }
  } catch (err) {
    console.error('getAssetByQr error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误: ' + (err.message || String(err)) } }
  }
}
