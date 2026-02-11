// 云函数：getAssetByQr — 扫码获取设备详情
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { assetId } = event
    if (!assetId) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 assetId' } }
    }

    // 查设备
    const { data: assets } = await db.collection('assets').where({ assetId }).limit(1).get()
    if (assets.length === 0) {
      return { ok: false, error: { code: 'ASSET_NOT_FOUND', message: '未找到该设备或设备已停用，请联系管理员' } }
    }
    const asset = assets[0]
    if (asset.status !== 'active') {
      return { ok: false, error: { code: 'ASSET_INACTIVE', message: '设备已停用' } }
    }

    // 查部位
    const { data: locations } = await db.collection('asset_locations')
      .where({ assetId, active: true })
      .orderBy('sortOrder', 'asc')
      .get()

    // 最近10条记录
    const { data: recentLogs } = await db.collection('replacement_logs')
      .where({ assetId })
      .orderBy('ts', 'desc')
      .limit(10)
      .get()

    return {
      ok: true,
      data: { asset, locations, recentLogs }
    }
  } catch (err) {
    console.error('getAssetByQr error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误' } }
  }
}
