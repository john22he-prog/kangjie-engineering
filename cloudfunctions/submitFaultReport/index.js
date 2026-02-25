const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) {
      return { ok: false, error: { code: 'NO_OPENID', message: '无法获取身份标识' } }
    }

    const { assetId, images, remark } = event

    if (!assetId) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少设备ID' } }
    }
    if (!Array.isArray(images) || images.length < 1) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请至少上传 1 张照片' } }
    }

    // 查询设备信息（不校验用户权限）
    const { data: assets } = await db.collection('assets')
      .where({ assetId, status: 'active' })
      .limit(1)
      .get()

    if (assets.length === 0) {
      return { ok: false, error: { code: 'ASSET_NOT_FOUND', message: '设备不存在或已停用' } }
    }
    const asset = assets[0]

    const now = Date.now()
    const reportId = `fault_${now}_${Math.random().toString(36).slice(2, 8)}`

    // 写入故障申报记录
    await db.collection('fault_reports').add({
      data: {
        reportId,
        assetId: asset.assetId,
        assetName: asset.assetName,
        assetNo: asset.assetNo,
        factoryId: asset.factoryId,
        reporterOpenid: openid,
        images,
        remark: remark || '',
        status: 'OPEN',
        createdAt: now,
      }
    })

    // 发送通知给工程部人员
    const fmtTime = formatTime(now)
    try {
      await cloud.callFunction({
        name: 'sendNotification',
        data: {
          type: 'FAULT_REPORT',
          factoryId: asset.factoryId,
          excludeOpenid: null,
          data: {
            logId: reportId,
            description: '设备故障申报，请及时处理',
            reporterName: '现场员工',
            assetName: asset.assetName,
            time: fmtTime,
          }
        }
      })
    } catch (notifyErr) {
      console.warn('故障通知发送失败:', notifyErr.message || notifyErr)
    }

    return { ok: true, data: { reportId, assetName: asset.assetName } }
  } catch (err) {
    console.error('submitFaultReport error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '提交失败: ' + (err.message || String(err)) } }
  }
}

function formatTime(ts) {
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
