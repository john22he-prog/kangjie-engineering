// 云函数：getAlertDetail — 获取报警详情
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

    const { alertId } = event
    if (!alertId) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 alertId 参数' } }
    }

    // 查找报警记录
    const { data: alerts } = await db.collection('alerts')
      .where({ alertId })
      .limit(1)
      .get()

    if (alerts.length === 0) {
      return { ok: false, error: { code: 'ALERT_NOT_FOUND', message: '报警记录不存在' } }
    }

    const alert = alerts[0]

    // 补充配件信息
    if (alert.partSkuId) {
      const { data: parts } = await db.collection('parts')
        .where({ partSkuId: alert.partSkuId })
        .limit(1)
        .get()
      if (parts.length > 0) {
        alert.partCode = parts[0].partCode
        alert.partUnit = parts[0].unit
        alert.partSpec = parts[0].specModel
      }
    }

    // 补充设备信息
    if (alert.assetId) {
      const { data: assets } = await db.collection('assets')
        .where({ assetId: alert.assetId })
        .limit(1)
        .get()
      if (assets.length > 0) {
        alert.assetNo = assets[0].assetNo
        alert.workshop = assets[0].workshop
      }
    }

    // 补充确认人信息
    if (alert.ackByUserId) {
      const { data: ackUsers } = await db.collection('users')
        .where({ userId: alert.ackByUserId })
        .limit(1)
        .get()
      if (ackUsers.length > 0) {
        alert.ackByName = ackUsers[0].displayName
      }
    }

    return { ok: true, data: alert }
  } catch (err) {
    console.error('getAlertDetail error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误' } }
  }
}
