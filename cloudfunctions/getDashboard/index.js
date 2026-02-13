// 云函数：getDashboard — 小程序看板数据
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

    const { yearMonth } = event
    if (!yearMonth) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 yearMonth 参数' } }
    }

    // 获取用户信息（用于 factoryId 过滤）
    const { data: users } = await db.collection('users').where({ openid, status: 'active' }).limit(1).get()
    const user = users.length > 0 ? users[0] : null
    const factoryId = user ? (user.factoryId || null) : null

    // 构建查询条件
    const logQuery = { yearMonth }
    const alertQuery = { yearMonth }
    const usageQuery = { yearMonth }
    if (factoryId) {
      logQuery.factoryId = factoryId
      alertQuery.factoryId = factoryId
      usageQuery.factoryId = factoryId
    }

    // ========== 1) 更换记录统计 ==========
    const { data: allLogs } = await db.collection('replacement_logs')
      .where(logQuery)
      .orderBy('ts', 'desc')
      .limit(1000)
      .get()

    const totalLogs = allLogs.length
    let totalPartsQty = 0
    allLogs.forEach(l => {
      (l.items || []).forEach(i => { totalPartsQty += i.qty })
    })

    // ========== 2) 报警统计 ==========
    const { data: allAlerts } = await db.collection('alerts')
      .where(alertQuery)
      .limit(1000)
      .get()

    const totalAlerts = allAlerts.length
    const openAlerts = allAlerts.filter(a => a.status === 'OPEN').length

    // ========== 3) 配件消耗 TOP 10 ==========
    const { data: usageList } = await db.collection('monthly_part_usage')
      .where(usageQuery)
      .limit(1000)
      .get()

    // 获取配件信息用于快照
    const partSkuIds = [...new Set(usageList.map(u => u.partSkuId))]
    const partsMap = {}
    for (let i = 0; i < partSkuIds.length; i += 20) {
      const batch = partSkuIds.slice(i, i + 20)
      const { data: batchParts } = await db.collection('parts').where({ partSkuId: _.in(batch) }).get()
      batchParts.forEach(p => { partsMap[p.partSkuId] = p })
    }

    const partUsage = {}
    usageList.forEach(u => {
      const part = partsMap[u.partSkuId]
      const name = part ? part.partName : u.partSkuId
      const unit = part ? part.unit : '个'
      if (!partUsage[u.partSkuId]) {
        partUsage[u.partSkuId] = { partSkuId: u.partSkuId, name, unit, qty: 0 }
      }
      partUsage[u.partSkuId].qty += u.qtySum
    })
    const topParts = Object.values(partUsage).sort((a, b) => b.qty - a.qty).slice(0, 10)

    // ========== 4) 设备更换 TOP 10 ==========
    const assetCount = {}
    allLogs.forEach(l => {
      if (!assetCount[l.assetId]) {
        assetCount[l.assetId] = { assetId: l.assetId, name: l.assetNameSnapshot, count: 0 }
      }
      assetCount[l.assetId].count++
    })
    const topAssets = Object.values(assetCount).sort((a, b) => b.count - a.count).slice(0, 10)

    // ========== 5) 工程人员工作量 ==========
    const engineerCount = {}
    allLogs.forEach(l => {
      const uid = l.reporterUserIdSnapshot
      if (!engineerCount[uid]) {
        engineerCount[uid] = { userId: uid, name: l.reporterNameSnapshot, count: 0 }
      }
      engineerCount[uid].count++
    })
    const topEngineers = Object.values(engineerCount).sort((a, b) => b.count - a.count).slice(0, 5)

    // ========== 6) 最近 7 天趋势 ==========
    const dailyTrend = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const dayStart = d.getTime()
      const dayEnd = dayStart + 86400000
      const count = allLogs.filter(l => l.ts >= dayStart && l.ts < dayEnd).length
      dailyTrend.push({
        date: dateStr,
        label: `${String(d.getMonth() + 1)}/${String(d.getDate()).padStart(2, '0')}`,
        count
      })
    }

    // ========== 7) 报警设备分布 ==========
    const alertAssetMap = {}
    allAlerts.filter(a => a.status === 'OPEN').forEach(a => {
      if (!alertAssetMap[a.assetId]) {
        alertAssetMap[a.assetId] = { assetId: a.assetId, assetName: a.assetName || a.assetId, openCount: 0 }
      }
      alertAssetMap[a.assetId].openCount++
    })
    const alertsByAsset = Object.values(alertAssetMap).sort((a, b) => b.openCount - a.openCount)

    return {
      ok: true,
      data: {
        totalLogs,
        totalPartsQty,
        totalAlerts,
        openAlerts,
        topParts,
        topAssets,
        topEngineers,
        dailyTrend,
        alertsByAsset
      }
    }
  } catch (err) {
    console.error('getDashboard error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误' } }
  }
}
