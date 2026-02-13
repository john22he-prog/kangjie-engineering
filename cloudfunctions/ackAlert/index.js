// 云函数：ackAlert — 主管确认报警
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
    const now = Date.now()

    // 权限校验：Supervisor / Admin
    const { data: users } = await db.collection('users').where({ openid, status: 'active' }).limit(1).get()
    if (users.length === 0) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '未绑定或账号已禁用' } }
    }
    const user = users[0]
    if (!['Supervisor', 'Management', 'Admin'].includes(user.role)) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '仅主管及以上人员可确认报警' } }
    }

    const { alertId, ackNote } = event
    if (!alertId) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 alertId' } }
    }
    if (!ackNote || !ackNote.trim()) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请填写确认说明' } }
    }

    // 查报警
    const { data: alerts } = await db.collection('alerts').where({ alertId }).limit(1).get()
    if (alerts.length === 0) {
      return { ok: false, error: { code: 'ALERT_NOT_FOUND', message: '报警不存在' } }
    }
    const alert = alerts[0]
    if (alert.status !== 'OPEN') {
      return { ok: false, error: { code: 'ALERT_NOT_OPEN', message: '该报警已确认，无需重复操作' } }
    }

    // 更新状态
    await db.collection('alerts').doc(alert._id).update({
      data: {
        status: 'ACK',
        ackByUserId: user.userId,
        ackTs: now,
        ackNote: ackNote.trim()
      }
    })

    return {
      ok: true,
      data: { alertId }
    }
  } catch (err) {
    console.error('ackAlert error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '确认报警失败: ' + (err.message || String(err)) } }
  }
}
