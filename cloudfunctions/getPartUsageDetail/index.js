// 云函数：getPartUsageDetail — 配件消耗详情（按设备分布下钻）
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

    const { partSkuId, yearMonth } = event
    if (!partSkuId || !yearMonth) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 partSkuId 或 yearMonth' } }
    }

    // 获取配件信息
    const { data: parts } = await db.collection('parts')
      .where({ partSkuId })
      .limit(1)
      .get()
    const part = parts.length > 0 ? parts[0] : null

    // 查询该配件在各设备上的月度用量
    const { data: usageList } = await db.collection('monthly_part_usage')
      .where({ partSkuId, yearMonth })
      .limit(1000)
      .get()

    // 获取设备信息用于展示
    const assetIds = [...new Set(usageList.map(u => u.assetId))]
    const assetsMap = {}
    for (let i = 0; i < assetIds.length; i += 20) {
      const batch = assetIds.slice(i, i + 20)
      const { data: batchAssets } = await db.collection('assets').where({ assetId: _.in(batch) }).get()
      batchAssets.forEach(a => { assetsMap[a.assetId] = a })
    }

    // 按设备聚合
    const assetUsage = {}
    usageList.forEach(u => {
      const asset = assetsMap[u.assetId]
      const name = asset ? asset.assetName : u.assetId
      const assetNo = asset ? asset.assetNo : ''
      if (!assetUsage[u.assetId]) {
        assetUsage[u.assetId] = { assetId: u.assetId, name, assetNo, qty: 0 }
      }
      assetUsage[u.assetId].qty += u.qtySum
    })

    const list = Object.values(assetUsage).sort((a, b) => b.qty - a.qty)
    const totalQty = list.reduce((s, i) => s + i.qty, 0)

    return {
      ok: true,
      data: {
        partSkuId,
        partName: part ? part.partName : partSkuId,
        partCode: part ? part.partCode : '',
        unit: part ? part.unit : '个',
        yearMonth,
        totalQty,
        list
      }
    }
  } catch (err) {
    console.error('getPartUsageDetail error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误' } }
  }
}
