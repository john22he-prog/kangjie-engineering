// 云函数：getAssetAlerts — 设备报警明细下钻
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '无法获取用户身份' } }
    }

    const { assetId, yearMonth } = event
    if (!assetId || !yearMonth) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 assetId 或 yearMonth' } }
    }

    // 获取设备信息
    const { data: assets } = await db.collection('assets')
      .where({ assetId })
      .limit(1)
      .get()
    const asset = assets.length > 0 ? assets[0] : null

    // 获取该设备本月的报警
    const { data: alertList } = await db.collection('alerts')
      .where({ assetId, yearMonth })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()

    // 获取该设备本月的更换记录（用于关联到每个报警）
    const { data: logList } = await db.collection('replacement_logs')
      .where({ assetId, yearMonth })
      .orderBy('ts', 'desc')
      .limit(1000)
      .get()

    // 获取配件信息
    const partSkuIds = [...new Set(alertList.map(a => a.partSkuId))]
    const partsMap = {}
    for (let i = 0; i < partSkuIds.length; i += 20) {
      const batch = partSkuIds.slice(i, i + 20)
      const { data: batchParts } = await db.collection('parts').where({ partSkuId: _.in(batch) }).get()
      batchParts.forEach(p => { partsMap[p.partSkuId] = p })
    }

    // 组装每个报警的详情 + 关联的更换记录
    const alertsResult = alertList.map(a => {
      const part = partsMap[a.partSkuId]
      const overQty = a.currentQty - a.thresholdValue
      const overRate = a.thresholdValue > 0 ? Math.round((a.currentQty / a.thresholdValue) * 100) : 0

      // 该配件的更换记录
      const logs = logList
        .filter(l => (l.items || []).some(i => i.partSkuId === a.partSkuId))
        .map(l => {
          const partItem = l.items.find(i => i.partSkuId === a.partSkuId)
          return {
            logId: l.logId,
            ts: l.ts,
            qty: partItem ? partItem.qty : 0,
            type: l.type,
            locationName: l.locationNameSnapshot,
            reporterName: l.reporterNameSnapshot,
            remark: l.remark
          }
        })
        .sort((x, y) => y.ts - x.ts)

      return {
        alertId: a.alertId,
        partSkuId: a.partSkuId,
        partName: part ? part.partName : (a.partName || a.partSkuId),
        partCode: part ? part.partCode : '',
        unit: part ? part.unit : '个',
        thresholdValue: a.thresholdValue,
        currentQty: a.currentQty,
        overQty,
        overRate,
        status: a.status,
        createdAt: a.createdAt,
        ackNote: a.ackNote,
        logs
      }
    })

    return {
      ok: true,
      data: {
        assetId,
        assetName: asset ? asset.assetName : assetId,
        assetNo: asset ? asset.assetNo : '',
        yearMonth,
        openCount: alertsResult.filter(a => a.status === 'OPEN').length,
        alerts: alertsResult
      }
    }
  } catch (err) {
    console.error('getAssetAlerts error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误' } }
  }
}
