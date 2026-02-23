// 云函数：getDashboard — 小程序看板数据
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function buildTimeQuery(data) {
  if (data.yearMonths === null || data.yearMonths === undefined) {
    if (data.yearMonth) return { yearMonth: data.yearMonth }
    return {}
  }
  if (Array.isArray(data.yearMonths)) {
    if (data.yearMonths.length === 1) return { yearMonth: data.yearMonths[0] }
    if (data.yearMonths.length > 1) return { yearMonth: _.in(data.yearMonths) }
  }
  return {}
}

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '无法获取用户身份' } }
    }

    const { yearMonth, yearMonths } = event
    if (!yearMonth && !yearMonths) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 yearMonth 参数' } }
    }

    const { data: users } = await db.collection('users').where({ openid, status: 'active' }).limit(1).get()
    const user = users.length > 0 ? users[0] : null
    const factoryId = user ? (user.factoryId || null) : null

    const timeQ = buildTimeQuery(event)
    if (!timeQ.yearMonth && yearMonth) timeQ.yearMonth = yearMonth
    const logQuery = { ...timeQ, module: _.or(_.eq('equipment'), _.exists(false)) }
    const alertQuery = { ...timeQ }
    const usageQuery = { ...timeQ }
    if (factoryId) {
      logQuery.factoryId = factoryId
      alertQuery.factoryId = factoryId
      usageQuery.factoryId = factoryId
    }

    const queryLimit = yearMonths === null ? 5000 : 1000
    // ========== 1) 更换记录统计 ==========
    const { data: allLogs } = await db.collection('replacement_logs')
      .where(logQuery)
      .orderBy('ts', 'desc')
      .limit(queryLimit)
      .get()

    const totalLogs = allLogs.length
    let totalPartsQty = 0
    allLogs.forEach(l => {
      (l.items || []).forEach(i => { totalPartsQty += i.qty })
    })

    // ========== 2) 报警统计 ==========
    const { data: allAlerts } = await db.collection('alerts')
      .where(alertQuery)
      .limit(queryLimit)
      .get()

    const totalAlerts = allAlerts.length
    const openAlerts = allAlerts.filter(a => a.status === 'OPEN').length

    // ========== 3) 配件消耗 TOP 10 ==========
    const { data: usageList } = await db.collection('monthly_part_usage')
      .where(usageQuery)
      .limit(1000)
      .get()

    // 从更换记录中提取配件名称快照（最可靠来源）
    const nameFromLogs = {}
    allLogs.forEach(l => {
      (l.items || []).forEach(item => {
        if (item.partSkuId && item.partNameSnapshot && !nameFromLogs[item.partSkuId]) {
          nameFromLogs[item.partSkuId] = { name: item.partNameSnapshot, unit: item.unitSnapshot || '个' }
        }
      })
    })

    // 查 parts 集合补充（仅查 nameFromLogs 里没有的）
    const partSkuIds = [...new Set(usageList.map(u => u.partSkuId))]
    const needLookup = partSkuIds.filter(id => !nameFromLogs[id])
    const partsMap = {}
    for (let i = 0; i < needLookup.length; i += 20) {
      const batch = needLookup.slice(i, i + 20)
      const { data: batchParts } = await db.collection('parts').where({ partSkuId: _.in(batch) }).get()
      batchParts.forEach(p => { partsMap[p.partSkuId] = p })
    }

    const partUsage = {}
    usageList.forEach(u => {
      const fromLog = nameFromLogs[u.partSkuId]
      const fromPart = partsMap[u.partSkuId]
      const name = fromLog?.name || (fromPart ? fromPart.partName : null) || u.partSkuId
      const unit = fromLog?.unit || (fromPart ? fromPart.unit : null) || '个'
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

    // ========== 6) 趋势 ==========
    const dailyTrend = []
    const isSingleMonth = !yearMonths || (Array.isArray(yearMonths) && yearMonths.length === 1)
    if (isSingleMonth) {
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
    } else {
      const monthMap = {}
      allLogs.forEach(l => {
        const ym = l.yearMonth || (l.ts ? new Date(l.ts).toISOString().slice(0, 7) : null)
        if (ym) {
          if (!monthMap[ym]) monthMap[ym] = 0
          monthMap[ym]++
        }
      })
      Object.keys(monthMap).sort().forEach(ym => {
        dailyTrend.push({ date: ym, label: ym, count: monthMap[ym] })
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
