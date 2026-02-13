// 云函数：getAssetUsageDetail — 设备更换详情（按配件分布下钻）
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

    // 查询该设备的月度用量
    const { data: usageList } = await db.collection('monthly_part_usage')
      .where({ assetId, yearMonth })
      .limit(1000)
      .get()

    // 获取配件信息
    const partSkuIds = [...new Set(usageList.map(u => u.partSkuId))]
    const partsMap = {}
    for (let i = 0; i < partSkuIds.length; i += 20) {
      const batch = partSkuIds.slice(i, i + 20)
      const { data: batchParts } = await db.collection('parts').where({ partSkuId: _.in(batch) }).get()
      batchParts.forEach(p => { partsMap[p.partSkuId] = p })
    }

    // 按配件聚合
    const partUsage = {}
    usageList.forEach(u => {
      const part = partsMap[u.partSkuId]
      const name = part ? part.partName : u.partSkuId
      const code = part ? part.partCode : ''
      const unit = part ? part.unit : '个'
      if (!partUsage[u.partSkuId]) {
        partUsage[u.partSkuId] = { partSkuId: u.partSkuId, name, code, unit, qty: 0 }
      }
      partUsage[u.partSkuId].qty += u.qtySum
    })

    const list = Object.values(partUsage).sort((a, b) => b.qty - a.qty).slice(0, 10)

    // 更换次数
    const { data: logs } = await db.collection('replacement_logs')
      .where({ assetId, yearMonth })
      .limit(1000)
      .get()
    const logCount = logs.length
    const totalQty = list.reduce((s, i) => s + i.qty, 0)

    return {
      ok: true,
      data: {
        assetId,
        assetName: asset ? asset.assetName : assetId,
        assetNo: asset ? asset.assetNo : '',
        yearMonth,
        logCount,
        totalQty,
        list
      }
    }
  } catch (err) {
    console.error('getAssetUsageDetail error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误' } }
  }
}
