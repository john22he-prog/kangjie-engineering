// 云函数：adminDashboard — 成本排名 / 设备成本明细 / AI 报告
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

    const { action, data = {} } = event
    if (!action) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 action 参数' } }
    }

    // 获取用户信息
    const { data: users } = await db.collection('users')
      .where({ openid, status: 'active' })
      .limit(1)
      .get()
    if (users.length === 0) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '未绑定或账号已禁用' } }
    }
    const user = users[0]

    switch (action) {
      case 'monthlyCostRanking':
        return await monthlyCostRanking(data, user)
      case 'assetCostDetail':
        return await assetCostDetail(data, user)
      case 'getAIReport':
        return await getAIReport(data, user)
      default:
        return { ok: false, error: { code: 'UNKNOWN_ACTION', message: '未知操作: ' + action } }
    }
  } catch (err) {
    console.error('adminDashboard error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '服务器错误' } }
  }
}

// ========== 当月配件使用金额排名（按设备） ==========
async function monthlyCostRanking(params, user) {
  const yearMonth = params.yearMonth
  if (!yearMonth) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 yearMonth' } }
  }

  const factoryId = params.factoryId || user.factoryId || null

  // 查询出库记录
  const outQuery = { yearMonth }
  if (factoryId) outQuery.factoryId = factoryId

  const { data: outLogs } = await db.collection('inventory_outbound_logs')
    .where(outQuery)
    .limit(1000)
    .get()

  // 按设备聚合成本
  const assetCostMap = {}
  let totalCost = 0
  outLogs.forEach(log => {
    const cost = log.totalCost || 0
    totalCost += cost
    if (!assetCostMap[log.assetId]) {
      assetCostMap[log.assetId] = {
        assetId: log.assetId,
        assetName: log.assetNameSnapshot || log.assetId,
        totalCost: 0
      }
    }
    assetCostMap[log.assetId].totalCost += cost
  })

  // 如果没有出库记录，尝试从 replacement_logs 估算（使用 totalRepairCost）
  if (outLogs.length === 0) {
    const logQuery = { yearMonth }
    if (factoryId) logQuery.factoryId = factoryId

    const { data: repLogs } = await db.collection('replacement_logs')
      .where(logQuery)
      .limit(1000)
      .get()

    repLogs.forEach(log => {
      const cost = log.totalRepairCost || 0
      totalCost += cost
      if (!assetCostMap[log.assetId]) {
        assetCostMap[log.assetId] = {
          assetId: log.assetId,
          assetName: log.assetNameSnapshot || log.assetId,
          totalCost: 0
        }
      }
      assetCostMap[log.assetId].totalCost += cost
    })
  }

  const costByAsset = Object.values(assetCostMap)
    .map(a => ({ ...a, totalCost: Math.round(a.totalCost * 100) / 100 }))
    .sort((a, b) => b.totalCost - a.totalCost)

  return {
    ok: true,
    data: {
      yearMonth,
      totalMonthlyUsageCost: Math.round(totalCost * 100) / 100,
      costByAsset
    }
  }
}

// ========== 设备配件金额明细（下钻） ==========
async function assetCostDetail(params, user) {
  const { assetId, yearMonth } = params
  if (!assetId || !yearMonth) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少参数' } }
  }

  // 先查出库记录
  const { data: outLogs } = await db.collection('inventory_outbound_logs')
    .where({ assetId, yearMonth })
    .limit(1000)
    .get()

  const partCostMap = {}
  let totalCost = 0

  if (outLogs.length > 0) {
    // 有出库记录，按配件聚合
    outLogs.forEach(log => {
      const cost = log.totalCost || 0
      totalCost += cost
      if (!partCostMap[log.partSkuId]) {
        partCostMap[log.partSkuId] = {
          partSkuId: log.partSkuId,
          partName: log.partNameSnapshot || log.partSkuId,
          specModel: '',
          qty: 0,
          unit: '个',
          totalCost: 0
        }
      }
      partCostMap[log.partSkuId].qty += log.qty || 0
      partCostMap[log.partSkuId].totalCost += cost
    })
  } else {
    // 没有出库记录，从 replacement_logs 的 items 聚合
    const { data: repLogs } = await db.collection('replacement_logs')
      .where({ assetId, yearMonth })
      .limit(1000)
      .get()

    repLogs.forEach(log => {
      (log.items || []).forEach(item => {
        const cost = item.itemCost || 0
        totalCost += cost
        if (!partCostMap[item.partSkuId]) {
          partCostMap[item.partSkuId] = {
            partSkuId: item.partSkuId,
            partName: item.partNameSnapshot || item.partSkuId,
            specModel: '',
            qty: 0,
            unit: '个',
            totalCost: 0
          }
        }
        partCostMap[item.partSkuId].qty += item.qty || 0
        partCostMap[item.partSkuId].totalCost += cost
      })
    })
  }

  // 补充配件规格信息
  const skuIds = Object.keys(partCostMap)
  for (let i = 0; i < skuIds.length; i += 20) {
    const batch = skuIds.slice(i, i + 20)
    const { data: batchParts } = await db.collection('parts').where({ partSkuId: _.in(batch) }).get()
    batchParts.forEach(p => {
      if (partCostMap[p.partSkuId]) {
        partCostMap[p.partSkuId].specModel = p.specModel || ''
        partCostMap[p.partSkuId].unit = p.unit || '个'
        partCostMap[p.partSkuId].partName = p.partName || partCostMap[p.partSkuId].partName
      }
    })
  }

  const partList = Object.values(partCostMap)
    .map(p => ({ ...p, totalCost: Math.round(p.totalCost * 100) / 100 }))
    .sort((a, b) => b.totalCost - a.totalCost)

  return {
    ok: true,
    data: {
      assetId,
      totalCost: Math.round(totalCost * 100) / 100,
      partList
    }
  }
}

// ========== AI 分析报告 ==========
async function getAIReport(params, user) {
  const yearMonth = params.yearMonth
  if (!yearMonth) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 yearMonth' } }
  }

  const factoryId = params.factoryId || user.factoryId || null

  // 聚合指定月份数据
  async function aggregateMonth(ym) {
    const logQuery = { yearMonth: ym }
    const alertQuery = { yearMonth: ym }
    if (factoryId) {
      logQuery.factoryId = factoryId
      alertQuery.factoryId = factoryId
    }

    const { data: ymLogs } = await db.collection('replacement_logs').where(logQuery).limit(1000).get()
    const { data: ymAlerts } = await db.collection('alerts').where(alertQuery).limit(1000).get()
    const openAlertsList = ymAlerts.filter(a => a.status === 'OPEN')

    const totalLogs = ymLogs.length
    let totalPartsQty = 0
    const typeCount = { '维修': 0, '预防': 0, '紧急': 0 }
    const partUsage = {}
    const assetCount = {}
    const engineerMap = {}

    ymLogs.forEach(l => {
      typeCount[l.type] = (typeCount[l.type] || 0) + 1
      ;(l.items || []).forEach(item => {
        totalPartsQty += item.qty
        if (!partUsage[item.partSkuId]) {
          partUsage[item.partSkuId] = {
            partSkuId: item.partSkuId,
            partName: item.partNameSnapshot,
            partCode: item.partCodeSnapshot || '',
            totalQty: 0
          }
        }
        partUsage[item.partSkuId].totalQty += item.qty
      })
      if (!assetCount[l.assetId]) {
        assetCount[l.assetId] = {
          assetId: l.assetId,
          assetName: l.assetNameSnapshot,
          assetNo: l.assetNoSnapshot || '',
          logCount: 0,
          urgentCount: 0
        }
      }
      assetCount[l.assetId].logCount++
      if (l.type === '紧急') assetCount[l.assetId].urgentCount++
      if (!engineerMap[l.reporterUserIdSnapshot]) {
        engineerMap[l.reporterUserIdSnapshot] = {
          userId: l.reporterUserIdSnapshot,
          name: l.reporterNameSnapshot,
          logCount: 0
        }
      }
      engineerMap[l.reporterUserIdSnapshot].logCount++
    })

    const topParts = Object.values(partUsage).sort((a, b) => b.totalQty - a.totalQty).slice(0, 5)
    const topAssets = Object.values(assetCount).sort((a, b) => b.logCount - a.logCount).slice(0, 5)
    const engineerWorkload = Object.values(engineerMap).sort((a, b) => b.logCount - a.logCount)

    const alertAssetMap = {}
    openAlertsList.forEach(a => {
      if (!alertAssetMap[a.assetId]) {
        alertAssetMap[a.assetId] = { assetId: a.assetId, assetName: a.assetName || a.assetId, openCount: 0 }
      }
      alertAssetMap[a.assetId].openCount++
    })
    const alertsByAsset = Object.values(alertAssetMap).sort((a, b) => b.openCount - a.openCount)

    // 成本（从更换记录取 totalRepairCost）
    const totalUsageCost = ymLogs.reduce((s, l) => s + (l.totalRepairCost || 0), 0)

    return {
      yearMonth: ym,
      totalLogs,
      totalPartsQty,
      openAlerts: openAlertsList.length,
      totalAlerts: ymAlerts.length,
      typeCount,
      topParts,
      topAssets,
      engineerWorkload,
      alertsByAsset,
      totalUsageCost: Math.round(totalUsageCost * 100) / 100,
      lowStockCount: 0
    }
  }

  // 计算上月
  const [y, m] = yearMonth.split('-').map(Number)
  let prevY = y, prevM = m - 1
  if (prevM < 1) { prevM = 12; prevY-- }
  const prevYm = `${prevY}-${String(prevM).padStart(2, '0')}`

  const current = await aggregateMonth(yearMonth)
  const prev = await aggregateMonth(prevYm)

  // ========== 生成报告 ==========
  const sections = []
  const urgentRate = current.totalLogs > 0 ? Math.round((current.typeCount['紧急'] || 0) / current.totalLogs * 100) : 0
  const prevUrgentRate = prev.totalLogs > 0 ? Math.round((prev.typeCount['紧急'] || 0) / prev.totalLogs * 100) : 0

  // 1. 运维健康总览
  const healthItems = []
  healthItems.push({ text: '本月更换 ' + current.totalLogs + ' 次，配件消耗 ' + current.totalPartsQty + ' 件，待处理报警 ' + current.openAlerts + ' 条。' })
  healthItems.push({ text: '更换类型：维修 ' + (current.typeCount['维修'] || 0) + ' 次、预防 ' + (current.typeCount['预防'] || 0) + ' 次、紧急 ' + (current.typeCount['紧急'] || 0) + ' 次（紧急占比 ' + urgentRate + '%）。' })
  if (urgentRate > 30) healthItems.push({ text: '⚠ 紧急维修占比偏高，建议加强预防性维保。' })
  sections.push({ title: '运维健康总览', items: healthItems })

  // 2. 历史对比
  const logsDiff = current.totalLogs - prev.totalLogs
  const logsPct = prev.totalLogs > 0 ? Math.round(logsDiff / prev.totalLogs * 100) : (current.totalLogs > 0 ? 100 : 0)
  const partsDiff = current.totalPartsQty - prev.totalPartsQty
  const partsPct = prev.totalPartsQty > 0 ? Math.round(partsDiff / prev.totalPartsQty * 100) : 0
  const histItems = []
  histItems.push({ text: '更换次数：本月 ' + current.totalLogs + ' vs 上月 ' + prev.totalLogs + '（' + (logsDiff >= 0 ? '+' : '') + logsDiff + '，' + (logsPct >= 0 ? '+' : '') + logsPct + '%）。' })
  histItems.push({ text: '配件消耗：本月 ' + current.totalPartsQty + ' vs 上月 ' + prev.totalPartsQty + '（' + (partsDiff >= 0 ? '+' : '') + partsDiff + '，' + (partsPct >= 0 ? '+' : '') + partsPct + '%）。' })
  histItems.push({ text: 'OPEN 报警：本月 ' + current.openAlerts + ' vs 上月 ' + prev.openAlerts + '。' })
  if (logsPct > 50) histItems.push({ text: '⚠ 更换次数环比上升 ' + logsPct + '%，建议排查原因。' })
  if (logsPct < -30 && prev.totalLogs > 3) histItems.push({ text: '✓ 更换次数环比下降 ' + Math.abs(logsPct) + '%，设备趋稳。' })
  sections.push({ title: '历史对比与趋势', items: histItems })

  // 3. 设备风险
  if (current.topAssets.length) {
    sections.push({
      title: '设备风险分析',
      items: current.topAssets.map(function (a, i) {
        var t = 'TOP' + (i + 1) + '：' + a.assetName + '（' + a.assetNo + '）本月 ' + a.logCount + ' 次更换'
        if (a.urgentCount > 0) t += '，其中紧急 ' + a.urgentCount + ' 次'
        t += '。'
        return { text: t }
      })
    })
  }

  // 4. 配件消耗
  if (current.topParts.length) {
    sections.push({
      title: '配件消耗分析',
      items: current.topParts.map(function (p, i) {
        return { text: 'TOP' + (i + 1) + '：' + p.partName + '（' + p.partCode + '）本月消耗 ' + p.totalQty + ' 件。' }
      })
    })
  }

  // 5. 成本
  sections.push({
    title: '成本分析',
    items: [{ text: '本月配件使用成本约 ¥' + current.totalUsageCost + '。' }]
  })

  // 6. 人员
  if (current.engineerWorkload.length) {
    var topEng = current.engineerWorkload[0]
    sections.push({
      title: '人员与负荷',
      items: [{ text: '本月活跃工程师 ' + current.engineerWorkload.length + ' 人，' + topEng.name + ' 记录最多（' + topEng.logCount + ' 条）。' }]
    })
  }

  // 7. 报警闭环
  if (current.openAlerts > 0 && current.alertsByAsset.length) {
    sections.push({
      title: '报警与响应闭环',
      items: current.alertsByAsset.slice(0, 5).map(function (a) {
        return { text: a.assetName + ' 有 ' + a.openCount + ' 条待处理报警，建议尽快排查。' }
      })
    })
  }

  // 文字摘要
  var factoryLabel = factoryId ? '当前工厂' : '全部工厂'
  var summaryText = factoryLabel + ' 本月更换 ' + current.totalLogs + ' 次，配件消耗 ' + current.totalPartsQty + ' 件，紧急占比 ' + urgentRate + '%，待处理报警 ' + current.openAlerts + ' 条。'
  if (logsPct > 0 && prev.totalLogs > 0) summaryText += ' 较上月增长 ' + logsPct + '%。'
  else if (logsPct < 0 && prev.totalLogs > 0) summaryText += ' 较上月下降 ' + Math.abs(logsPct) + '%。'
  if (current.openAlerts > 0) summaryText += ' 存在未处理报警，建议优先处理。'

  return {
    ok: true,
    data: {
      summaryText,
      sections,
      stats: current,
      prevStats: prev,
      history: { current, prev, logsPct, partsPct }
    }
  }
}
