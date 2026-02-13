// utils/mock.js — Mock 数据与模拟 API
const { getCurrentYearMonth, getYearMonth } = require('./util')

// ======================== 种子数据 ========================

// 设备
const assets = [
  { assetId: 'ZB-001', assetName: '隧道式洗衣龙1号', assetNo: 'XYL-2024-001', workshop: 'A车间', status: 'active', createdAt: 1700000000000, updatedAt: 1700000000000 },
  { assetId: 'ZB-002', assetName: '隧道式洗衣龙2号', assetNo: 'XYL-2024-002', workshop: 'A车间', status: 'active', createdAt: 1700000000000, updatedAt: 1700000000000 },
  { assetId: 'ZB-003', assetName: '烘干机1号', assetNo: 'HG-2024-001', workshop: 'B车间', status: 'active', createdAt: 1700000000000, updatedAt: 1700000000000 }
]

// 部位
const assetLocations = [
  { locationId: 'loc_001', assetId: 'ZB-001', locationName: '主传动系统', sortOrder: 1, active: true },
  { locationId: 'loc_002', assetId: 'ZB-001', locationName: '进料段', sortOrder: 2, active: true },
  { locationId: 'loc_003', assetId: 'ZB-001', locationName: '排水系统', sortOrder: 3, active: true },
  { locationId: 'loc_004', assetId: 'ZB-002', locationName: '主传动系统', sortOrder: 1, active: true },
  { locationId: 'loc_005', assetId: 'ZB-002', locationName: '加热系统', sortOrder: 2, active: true },
  { locationId: 'loc_006', assetId: 'ZB-003', locationName: '滚筒组件', sortOrder: 1, active: true },
  { locationId: 'loc_007', assetId: 'ZB-003', locationName: '排风系统', sortOrder: 2, active: true }
]

// 配件SKU
const parts = [
  { partSkuId: 'sku_001', partName: '传动皮带', partCode: 'PD-BELT-001', unit: '条', specModel: 'B-2200', active: true },
  { partSkuId: 'sku_002', partName: '主轴承', partCode: 'BRG-MAIN-001', unit: '个', specModel: '6310-2RS', active: true },
  { partSkuId: 'sku_003', partName: '密封垫圈', partCode: 'SEAL-001', unit: '个', specModel: 'DN50', active: true },
  { partSkuId: 'sku_004', partName: '进料螺旋叶片', partCode: 'FEED-BLADE-001', unit: '片', specModel: 'Φ400', active: true },
  { partSkuId: 'sku_005', partName: '排水阀', partCode: 'VALVE-DRAIN-001', unit: '个', specModel: 'DN80', active: true },
  { partSkuId: 'sku_006', partName: '加热管', partCode: 'HEATER-001', unit: '根', specModel: '3KW', active: true },
  { partSkuId: 'sku_007', partName: '过滤网', partCode: 'FILTER-001', unit: '张', specModel: '200目', active: true },
  { partSkuId: 'sku_008', partName: '滚筒轴承', partCode: 'BRG-DRUM-001', unit: '个', specModel: '6312', active: true },
  { partSkuId: 'sku_009', partName: '排风扇叶', partCode: 'FAN-BLADE-001', unit: '片', specModel: 'Φ600', active: true },
  { partSkuId: 'sku_010', partName: '温控传感器', partCode: 'TEMP-SENSOR-001', unit: '个', specModel: 'PT100', active: true }
]

// 部位→配件映射
const locationPartMap = [
  { mapId: 'map_001', assetId: 'ZB-001', locationId: 'loc_001', partSkuId: 'sku_001', active: true },
  { mapId: 'map_002', assetId: 'ZB-001', locationId: 'loc_001', partSkuId: 'sku_002', active: true },
  { mapId: 'map_003', assetId: 'ZB-001', locationId: 'loc_001', partSkuId: 'sku_003', active: true },
  { mapId: 'map_004', assetId: 'ZB-001', locationId: 'loc_002', partSkuId: 'sku_004', active: true },
  { mapId: 'map_005', assetId: 'ZB-001', locationId: 'loc_002', partSkuId: 'sku_007', active: true },
  { mapId: 'map_006', assetId: 'ZB-001', locationId: 'loc_003', partSkuId: 'sku_005', active: true },
  { mapId: 'map_007', assetId: 'ZB-001', locationId: 'loc_003', partSkuId: 'sku_003', active: true },
  { mapId: 'map_008', assetId: 'ZB-002', locationId: 'loc_004', partSkuId: 'sku_001', active: true },
  { mapId: 'map_009', assetId: 'ZB-002', locationId: 'loc_004', partSkuId: 'sku_002', active: true },
  { mapId: 'map_010', assetId: 'ZB-002', locationId: 'loc_005', partSkuId: 'sku_006', active: true },
  { mapId: 'map_011', assetId: 'ZB-002', locationId: 'loc_005', partSkuId: 'sku_010', active: true },
  { mapId: 'map_012', assetId: 'ZB-003', locationId: 'loc_006', partSkuId: 'sku_008', active: true },
  { mapId: 'map_013', assetId: 'ZB-003', locationId: 'loc_006', partSkuId: 'sku_003', active: true },
  { mapId: 'map_014', assetId: 'ZB-003', locationId: 'loc_007', partSkuId: 'sku_009', active: true },
  { mapId: 'map_015', assetId: 'ZB-003', locationId: 'loc_007', partSkuId: 'sku_010', active: true }
]

// 阈值
const thresholds = [
  { assetId: 'ZB-001', partSkuId: 'sku_001', thresholdMonthly: 5, active: true },
  { assetId: 'ZB-001', partSkuId: 'sku_002', thresholdMonthly: 3, active: true },
  { assetId: 'ZB-001', partSkuId: 'sku_005', thresholdMonthly: 4, active: true },
  { assetId: 'ZB-002', partSkuId: 'sku_001', thresholdMonthly: 5, active: true },
  { assetId: 'ZB-003', partSkuId: 'sku_008', thresholdMonthly: 2, active: true }
]

// 用户
const users = [
  { userId: 'user_001', username: 'zhangsan', displayName: '张工程', role: 'Engineer', status: 'active', openid: 'mock_openid_001' },
  { userId: 'user_002', username: 'lisi', displayName: '李主管', role: 'Supervisor', status: 'active', openid: 'mock_openid_002' },
  { userId: 'user_003', username: 'wangwu', displayName: '王工程', role: 'Engineer', status: 'active', openid: 'mock_openid_003' },
  { userId: 'user_004', username: 'admin', displayName: '管理员', role: 'Admin', status: 'active', openid: 'mock_openid_004' }
]

// 更换记录（动态数组，提交后往里 push）
const ym = getCurrentYearMonth()
let replacementLogs = [
  {
    logId: 'log_001', assetId: 'ZB-001', assetNameSnapshot: '隧道式洗衣龙1号', assetNoSnapshot: 'XYL-2024-001',
    reporterUserIdSnapshot: 'user_001', reporterNameSnapshot: '张工程',
    ts: Date.now() - 86400000 * 2, yearMonth: ym, type: '维修',
    locationIdSnapshot: 'loc_001', locationNameSnapshot: '主传动系统',
    items: [
      { partSkuId: 'sku_001', partNameSnapshot: '传动皮带', partCodeSnapshot: 'PD-BELT-001', qty: 2 },
      { partSkuId: 'sku_003', partNameSnapshot: '密封垫圈', partCodeSnapshot: 'SEAL-001', qty: 4 }
    ],
    remark: '皮带磨损严重已更换', images: ['mock_file_001'], clientOfflineId: 'mock_uuid_001', createdAt: Date.now() - 86400000 * 2
  },
  {
    logId: 'log_002', assetId: 'ZB-001', assetNameSnapshot: '隧道式洗衣龙1号', assetNoSnapshot: 'XYL-2024-001',
    reporterUserIdSnapshot: 'user_003', reporterNameSnapshot: '王工程',
    ts: Date.now() - 86400000, yearMonth: ym, type: '预防',
    locationIdSnapshot: 'loc_003', locationNameSnapshot: '排水系统',
    items: [
      { partSkuId: 'sku_005', partNameSnapshot: '排水阀', partCodeSnapshot: 'VALVE-DRAIN-001', qty: 1 }
    ],
    remark: '', images: ['mock_file_002'], clientOfflineId: 'mock_uuid_002', createdAt: Date.now() - 86400000
  },
  {
    logId: 'log_003', assetId: 'ZB-001', assetNameSnapshot: '隧道式洗衣龙1号', assetNoSnapshot: 'XYL-2024-001',
    reporterUserIdSnapshot: 'user_001', reporterNameSnapshot: '张工程',
    ts: Date.now() - 86400000 * 5, yearMonth: ym, type: '维修',
    locationIdSnapshot: 'loc_001', locationNameSnapshot: '主传动系统',
    items: [
      { partSkuId: 'sku_001', partNameSnapshot: '传动皮带', partCodeSnapshot: 'PD-BELT-001', qty: 3 }
    ],
    remark: '', images: ['mock_file_003'], clientOfflineId: 'mock_uuid_003', createdAt: Date.now() - 86400000 * 5
  }
]

// 月度用量（动态计算）
let monthlyUsage = [
  { assetId: 'ZB-001', partSkuId: 'sku_001', yearMonth: ym, qtySum: 5, lastUpdatedAt: Date.now() },
  { assetId: 'ZB-001', partSkuId: 'sku_003', yearMonth: ym, qtySum: 4, lastUpdatedAt: Date.now() },
  { assetId: 'ZB-001', partSkuId: 'sku_005', yearMonth: ym, qtySum: 1, lastUpdatedAt: Date.now() }
]

// 报警
let alerts = [
  {
    alertId: 'alert_001', assetId: 'ZB-001', partSkuId: 'sku_001', yearMonth: ym,
    thresholdValue: 5, currentQty: 5, status: 'OPEN',
    ackByUserId: null, ackTs: null, ackNote: null, createdAt: Date.now() - 86400000,
    // 冗余快照便于展示
    assetName: '隧道式洗衣龙1号', partName: '传动皮带'
  }
]

// ======================== Mock API ========================

let _logIdCounter = 100
let _alertIdCounter = 100

const mockApi = {
  // 获取当前用户
  getMe() {
    return delay({ ok: true, data: users[0] })
  },

  // 扫码获取设备
  getAssetByQr(assetId) {
    const asset = assets.find(a => a.assetId === assetId)
    if (!asset) return delay({ ok: false, error: { code: 'ASSET_NOT_FOUND', message: '未找到该设备或设备已停用，请联系管理员' } })
    if (asset.status !== 'active') return delay({ ok: false, error: { code: 'ASSET_INACTIVE', message: '设备已停用' } })

    const locs = assetLocations.filter(l => l.assetId === assetId && l.active)
    const recentLogs = replacementLogs
      .filter(l => l.assetId === assetId)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 10)

    return delay({ ok: true, data: { asset, locations: locs, recentLogs } })
  },

  // 获取部位和配件映射
  getLocationsAndParts(assetId) {
    const locs = assetLocations.filter(l => l.assetId === assetId && l.active).sort((a, b) => a.sortOrder - b.sortOrder)
    const map = {}
    locs.forEach(loc => {
      const skuIds = locationPartMap.filter(m => m.assetId === assetId && m.locationId === loc.locationId && m.active).map(m => m.partSkuId)
      map[loc.locationId] = parts.filter(p => skuIds.includes(p.partSkuId) && p.active)
    })
    return delay({ ok: true, data: { locations: locs, map } })
  },

  // 提交更换记录
  submitReplacementLog(payload) {
    // 幂等检查
    const existing = replacementLogs.find(l => l.clientOfflineId === payload.clientOfflineId)
    if (existing) {
      return delay({ ok: true, data: { logId: existing.logId, yearMonth: existing.yearMonth, duplicate: true } })
    }

    const asset = assets.find(a => a.assetId === payload.assetId)
    if (!asset) return delay({ ok: false, error: { code: 'ASSET_NOT_FOUND', message: '设备不存在' } })

    const loc = assetLocations.find(l => l.locationId === payload.locationId)
    const now = Date.now()
    const yearMonth = getYearMonth(now)
    const logId = `log_${++_logIdCounter}`

    // 构建快照
    const items = payload.selectedPartSkuIds.map(skuId => {
      const part = parts.find(p => p.partSkuId === skuId)
      return {
        partSkuId: skuId,
        partNameSnapshot: part ? part.partName : skuId,
        partCodeSnapshot: part ? part.partCode : '',
        qty: payload.qtyMap[skuId] || 0
      }
    })

    const log = {
      logId,
      assetId: asset.assetId,
      assetNameSnapshot: asset.assetName,
      assetNoSnapshot: asset.assetNo,
      reporterUserIdSnapshot: 'user_001',
      reporterNameSnapshot: '张工程',
      ts: now,
      yearMonth,
      type: payload.type,
      locationIdSnapshot: payload.locationId,
      locationNameSnapshot: loc ? loc.locationName : '',
      items,
      remark: payload.remark || '',
      images: payload.images || [],
      clientOfflineId: payload.clientOfflineId,
      createdAt: now
    }

    replacementLogs.push(log)

    // 更新月度用量 & 检查阈值
    const createdAlerts = []
    items.forEach(item => {
      // upsert monthly usage
      let usage = monthlyUsage.find(u => u.assetId === asset.assetId && u.partSkuId === item.partSkuId && u.yearMonth === yearMonth)
      if (usage) {
        usage.qtySum += item.qty
        usage.lastUpdatedAt = now
      } else {
        usage = { assetId: asset.assetId, partSkuId: item.partSkuId, yearMonth, qtySum: item.qty, lastUpdatedAt: now }
        monthlyUsage.push(usage)
      }

      // 检查阈值
      const threshold = thresholds.find(t => t.assetId === asset.assetId && t.partSkuId === item.partSkuId && t.active)
      if (threshold && usage.qtySum > threshold.thresholdMonthly) {
        // 本月是否已报警
        const existingAlert = alerts.find(a => a.assetId === asset.assetId && a.partSkuId === item.partSkuId && a.yearMonth === yearMonth)
        if (!existingAlert) {
          const alertId = `alert_${++_alertIdCounter}`
          const part = parts.find(p => p.partSkuId === item.partSkuId)
          alerts.push({
            alertId, assetId: asset.assetId, partSkuId: item.partSkuId, yearMonth,
            thresholdValue: threshold.thresholdMonthly, currentQty: usage.qtySum, status: 'OPEN',
            ackByUserId: null, ackTs: null, ackNote: null, createdAt: now,
            assetName: asset.assetName, partName: part ? part.partName : item.partSkuId
          })
          createdAlerts.push(alertId)
        } else {
          // 更新 currentQty
          existingAlert.currentQty = usage.qtySum
        }
      }
    })

    return delay({
      ok: true,
      data: { logId, yearMonth, createdAlerts }
    })
  },

  // 查询记录列表
  listReplacementLogs(params) {
    let list = [...replacementLogs]
    if (params.yearMonth) list = list.filter(l => l.yearMonth === params.yearMonth)
    if (params.assetId) list = list.filter(l => l.assetId === params.assetId)
    if (params.userId) list = list.filter(l => l.reporterUserIdSnapshot === params.userId)
    if (params.filterDate) {
      // 按具体日期筛选
      const d = new Date(params.filterDate)
      const dayStart = d.getTime()
      const dayEnd = dayStart + 86400000
      list = list.filter(l => l.ts >= dayStart && l.ts < dayEnd)
    }
    list.sort((a, b) => b.ts - a.ts)

    const page = params.page || 1
    const pageSize = params.pageSize || 20
    const start = (page - 1) * pageSize
    const sliced = list.slice(start, start + pageSize)

    return delay({ ok: true, data: { list: sliced, total: list.length } })
  },

  // 查询报警列表
  listAlerts(params) {
    let list = [...alerts]
    if (params.status) list = list.filter(a => a.status === params.status)
    if (params.yearMonth) list = list.filter(a => a.yearMonth === params.yearMonth)
    if (params.assetId) list = list.filter(a => a.assetId === params.assetId)
    list.sort((a, b) => b.createdAt - a.createdAt)

    const page = params.page || 1
    const pageSize = params.pageSize || 20
    const start = (page - 1) * pageSize
    const sliced = list.slice(start, start + pageSize)

    return delay({ ok: true, data: { list: sliced, total: list.length } })
  },

  // 获取报警详情
  getAlertDetail(alertId) {
    const alert = alerts.find(a => a.alertId === alertId)
    if (!alert) return delay({ ok: false, error: { code: 'ALERT_NOT_FOUND', message: '报警不存在' } })
    return delay({ ok: true, data: alert })
  },

  // ACK 报警
  ackAlert(params) {
    const alert = alerts.find(a => a.alertId === params.alertId)
    if (!alert) return delay({ ok: false, error: { code: 'ALERT_NOT_FOUND', message: '报警不存在' } })
    if (alert.status !== 'OPEN') return delay({ ok: false, error: { code: 'ALERT_NOT_OPEN', message: '报警状态非 OPEN' } })

    alert.status = 'ACK'
    alert.ackByUserId = 'user_002'
    alert.ackTs = Date.now()
    alert.ackNote = params.ackNote

    return delay({ ok: true, data: { alertId: alert.alertId } })
  },

  // 看板数据
  getDashboard(params) {
    const ym = params.yearMonth || getCurrentYearMonth()
    const ymLogs = replacementLogs.filter(l => l.yearMonth === ym)

    // M1 数字卡
    const totalLogs = ymLogs.length
    const totalPartsQty = ymLogs.reduce((s, l) => s + (l.items || []).reduce((ss, i) => ss + i.qty, 0), 0)

    // 报警统计
    const totalAlerts = alerts.filter(a => a.yearMonth === ym).length
    const openAlerts = alerts.filter(a => a.status === 'OPEN' && a.yearMonth === ym).length

    // 配件消耗 TOP 10
    const partUsage = {}
    monthlyUsage.filter(u => u.yearMonth === ym).forEach(u => {
      const part = parts.find(p => p.partSkuId === u.partSkuId)
      const name = part ? part.partName : u.partSkuId
      const unit = part ? part.unit : '个'
      if (!partUsage[u.partSkuId]) partUsage[u.partSkuId] = { partSkuId: u.partSkuId, name, unit, qty: 0 }
      partUsage[u.partSkuId].qty += u.qtySum
    })
    const topParts = Object.values(partUsage).sort((a, b) => b.qty - a.qty).slice(0, 10)

    // 设备更换 TOP 10
    const assetCount = {}
    ymLogs.forEach(l => {
      if (!assetCount[l.assetId]) assetCount[l.assetId] = { assetId: l.assetId, name: l.assetNameSnapshot, count: 0 }
      assetCount[l.assetId].count++
    })
    const topAssets = Object.values(assetCount).sort((a, b) => b.count - a.count).slice(0, 10)

    // 工程人员工作量
    const engineerCount = {}
    ymLogs.forEach(l => {
      if (!engineerCount[l.reporterUserIdSnapshot]) {
        engineerCount[l.reporterUserIdSnapshot] = { userId: l.reporterUserIdSnapshot, name: l.reporterNameSnapshot, count: 0 }
      }
      engineerCount[l.reporterUserIdSnapshot].count++
    })
    const topEngineers = Object.values(engineerCount).sort((a, b) => b.count - a.count).slice(0, 5)

    // M5 最近7天趋势
    const dailyTrend = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const dayStart = d.getTime()
      const dayEnd = dayStart + 86400000
      const count = replacementLogs.filter(l => l.ts >= dayStart && l.ts < dayEnd).length
      dailyTrend.push({ date: dateStr, label: `${String(d.getMonth() + 1)}/${String(d.getDate()).padStart(2, '0')}`, count })
    }

    // M6 报警设备分布（OPEN）
    const alertAssetMap = {}
    alerts.filter(a => a.yearMonth === ym && a.status === 'OPEN').forEach(a => {
      if (!alertAssetMap[a.assetId]) {
        alertAssetMap[a.assetId] = { assetId: a.assetId, assetName: a.assetName || a.assetId, openCount: 0 }
      }
      alertAssetMap[a.assetId].openCount++
    })
    const alertsByAsset = Object.values(alertAssetMap).sort((a, b) => b.openCount - a.openCount)

    return delay({
      ok: true,
      data: { totalLogs, totalPartsQty, totalAlerts, openAlerts, topParts, topAssets, topEngineers, dailyTrend, alertsByAsset }
    })
  },

  // AI 分析报告（规则+模板）。params: { yearMonth, workshop?, scope: 'workshop'|'summary' }
  getAIReport(params) {
    const ym = params.yearMonth || getCurrentYearMonth()
    // 小程序端：主管按 factoryId 看全厂，这里 mock 简单处理（所有设备属于 F-001）
    // factoryId 参数保留用于将来真正的后端过滤
    const factoryId = params.factoryId

    // --- 聚合指定月份数据 ---
    function aggregateMonth(targetYm) {
      const ymLogs = replacementLogs.filter(l => l.yearMonth === targetYm)
      const ymAlerts = alerts.filter(a => a.yearMonth === targetYm)
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
          if (!partUsage[item.partSkuId]) partUsage[item.partSkuId] = { partSkuId: item.partSkuId, partName: item.partNameSnapshot, partCode: item.partCodeSnapshot, totalQty: 0 }
          partUsage[item.partSkuId].totalQty += item.qty
        })
        if (!assetCount[l.assetId]) assetCount[l.assetId] = { assetId: l.assetId, assetName: l.assetNameSnapshot, assetNo: l.assetNoSnapshot || '', logCount: 0, urgentCount: 0 }
        assetCount[l.assetId].logCount++
        if (l.type === '紧急') assetCount[l.assetId].urgentCount++
        if (!engineerMap[l.reporterUserIdSnapshot]) engineerMap[l.reporterUserIdSnapshot] = { userId: l.reporterUserIdSnapshot, name: l.reporterNameSnapshot, logCount: 0 }
        engineerMap[l.reporterUserIdSnapshot].logCount++
      })
      const topParts = Object.values(partUsage).sort((a, b) => b.totalQty - a.totalQty).slice(0, 5)
      const topAssets = Object.values(assetCount).sort((a, b) => b.logCount - a.logCount).slice(0, 5)
      const engineerWorkload = Object.values(engineerMap).sort((a, b) => b.logCount - a.logCount)

      const alertAssetMap = {}
      openAlertsList.forEach(a => {
        if (!alertAssetMap[a.assetId]) alertAssetMap[a.assetId] = { assetId: a.assetId, assetName: a.assetName || a.assetId, openCount: 0 }
        alertAssetMap[a.assetId].openCount++
      })
      const alertsByAsset = Object.values(alertAssetMap).sort((a, b) => b.openCount - a.openCount)

      return {
        yearMonth: targetYm, totalLogs, totalPartsQty,
        openAlerts: openAlertsList.length, totalAlerts: ymAlerts.length,
        typeCount, topParts, topAssets, engineerWorkload, alertsByAsset,
        totalUsageCost: totalPartsQty * 25, // mock 成本
        lowStockCount: 0
      }
    }

    // 计算上月
    const ymParts = ym.split('-')
    const d = new Date(parseInt(ymParts[0]), parseInt(ymParts[1]) - 2, 1)
    const prevYm = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')

    const current = aggregateMonth(ym)
    const prev = aggregateMonth(prevYm)

    // --- 8 维度报告生成 ---
    const sections = []
    const urgentRate = current.totalLogs > 0 ? Math.round((current.typeCount['紧急'] || 0) / current.totalLogs * 100) : 0
    const prevRate = prev.totalLogs > 0 ? Math.round((prev.typeCount['紧急'] || 0) / prev.totalLogs * 100) : 0

    // 1. 运维健康总览
    const healthItems = []
    healthItems.push({ text: '本月更换 ' + current.totalLogs + ' 次，配件消耗 ' + current.totalPartsQty + ' 件，待处理报警 ' + current.openAlerts + ' 条。' })
    healthItems.push({ text: '更换类型：维修 ' + (current.typeCount['维修'] || 0) + ' 次、预防 ' + (current.typeCount['预防'] || 0) + ' 次、紧急 ' + (current.typeCount['紧急'] || 0) + ' 次（紧急占比 ' + urgentRate + '%）。' })
    if (urgentRate > 30) healthItems.push({ text: '⚠ 紧急维修占比偏高，建议加强预防性维保。' })
    sections.push({ title: '运维健康总览', items: healthItems })

    // 2. 历史对比与趋势
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
        items: current.topAssets.map(function(a, i) {
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
        items: current.topParts.map(function(p, i) { return { text: 'TOP' + (i + 1) + '：' + p.partName + '（' + p.partCode + '）本月消耗 ' + p.totalQty + ' 件。' } })
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
        items: current.alertsByAsset.slice(0, 5).map(function(a) { return { text: a.assetName + ' 有 ' + a.openCount + ' 条待处理报警，建议尽快排查。' } })
      })
    }

    // 文字摘要
    var factoryLabel = '当前工厂'
    var summaryText = factoryLabel + ' 本月更换 ' + current.totalLogs + ' 次，配件消耗 ' + current.totalPartsQty + ' 件，紧急占比 ' + urgentRate + '%，待处理报警 ' + current.openAlerts + ' 条。'
    if (logsPct > 0 && prev.totalLogs > 0) summaryText += ' 较上月增长 ' + logsPct + '%。'
    else if (logsPct < 0 && prev.totalLogs > 0) summaryText += ' 较上月下降 ' + Math.abs(logsPct) + '%。'
    if (current.openAlerts > 0) summaryText += ' 存在未处理报警，建议优先处理。'

    return delay({
      ok: true,
      data: {
        summaryText, sections,
        stats: current,
        prevStats: prev,
        history: { current: current, prev: prev, logsPct: logsPct, partsPct: partsPct }
      }
    })
  },

  // 配件详情：某配件在各设备上的用量分布
  getPartUsageDetail(params) {
    const { partSkuId, yearMonth } = params
    const ym = yearMonth || getCurrentYearMonth()
    const part = parts.find(p => p.partSkuId === partSkuId)

    // 按设备聚合该配件的用量
    const assetUsage = {}
    monthlyUsage.filter(u => u.partSkuId === partSkuId && u.yearMonth === ym).forEach(u => {
      const asset = assets.find(a => a.assetId === u.assetId)
      const name = asset ? asset.assetName : u.assetId
      const assetNo = asset ? asset.assetNo : ''
      if (!assetUsage[u.assetId]) assetUsage[u.assetId] = { assetId: u.assetId, name, assetNo, qty: 0 }
      assetUsage[u.assetId].qty += u.qtySum
    })
    const list = Object.values(assetUsage).sort((a, b) => b.qty - a.qty)
    const totalQty = list.reduce((s, i) => s + i.qty, 0)

    return delay({
      ok: true,
      data: {
        partSkuId,
        partName: part ? part.partName : partSkuId,
        partCode: part ? part.partCode : '',
        unit: part ? part.unit : '个',
        yearMonth: ym,
        totalQty,
        list
      }
    })
  },

  // 导出数据（mock 模式模拟返回）
  // 支持 exportMode: 'month' | 'year'
  exportData(params) {
    const { exportMode, yearMonth, year } = params

    // 根据模式筛选数据
    let matchFn
    let rangeLabel
    if (exportMode === 'year' && year) {
      matchFn = ym => ym && ym.startsWith(year)
      rangeLabel = `${year}年全年`
    } else {
      matchFn = ym => ym === yearMonth
      rangeLabel = yearMonth
    }

    const logsCount = replacementLogs.filter(l => matchFn(l.yearMonth)).length
    const logItemsCount = replacementLogs
      .filter(l => matchFn(l.yearMonth))
      .reduce((sum, l) => sum + (l.items ? l.items.length : 0), 0)
    const usagesCount = monthlyUsage.filter(u => matchFn(u.yearMonth)).length
    const alertsCount = alerts.filter(a => matchFn(a.yearMonth)).length

    // mock 模式直接返回错误提示（无法生成真实文件）
    return delay({
      ok: false,
      error: {
        code: 'MOCK_MODE',
        message: `当前为测试模式，无法生成真实文件。\n导出范围：${rangeLabel}\n数据统计：\n更换记录 ${logsCount} 条（${logItemsCount} 项明细）\n月度汇总 ${usagesCount} 条\n报警 ${alertsCount} 条\n设备 ${assets.length} 台\n配件 ${parts.length} 种\n\n请切换到云函数模式后使用。`
      }
    })
  },

  // 导入数据（mock 模拟去重结果）
  importData(params) {
    const { importType } = params
    const typeNames = { parts: '配件字典', thresholds: '阈值配置', logs: '更换记录' }
    const typeName = typeNames[importType] || importType

    // mock 模式模拟：随机生成一些数据
    const total = Math.floor(Math.random() * 15) + 5
    const skipped = Math.floor(Math.random() * total)
    const inserted = total - skipped
    const errorCount = Math.floor(Math.random() * 2)

    return delay({
      ok: true,
      data: {
        importType,
        typeName,
        total,
        inserted,
        skipped,
        errorCount,
        errors: errorCount > 0 ? [`第3行：配件编号 "PD-BELT-001" 已被其他配件使用`] : []
      }
    }, 2000)
  },

  // 设备详情：某设备使用的各配件用量排行
  getAssetUsageDetail(params) {
    const { assetId, yearMonth } = params
    const ym = yearMonth || getCurrentYearMonth()
    const asset = assets.find(a => a.assetId === assetId)

    // 按配件聚合该设备的用量
    const partUsage = {}
    monthlyUsage.filter(u => u.assetId === assetId && u.yearMonth === ym).forEach(u => {
      const part = parts.find(p => p.partSkuId === u.partSkuId)
      const name = part ? part.partName : u.partSkuId
      const code = part ? part.partCode : ''
      const unit = part ? part.unit : '个'
      if (!partUsage[u.partSkuId]) partUsage[u.partSkuId] = { partSkuId: u.partSkuId, name, code, unit, qty: 0 }
      partUsage[u.partSkuId].qty += u.qtySum
    })
    const list = Object.values(partUsage).sort((a, b) => b.qty - a.qty).slice(0, 10)

    // 该设备本月更换次数
    const logCount = replacementLogs.filter(l => l.assetId === assetId && l.yearMonth === ym).length
    const totalQty = list.reduce((s, i) => s + i.qty, 0)

    return delay({
      ok: true,
      data: {
        assetId,
        assetName: asset ? asset.assetName : assetId,
        assetNo: asset ? asset.assetNo : '',
        yearMonth: ym,
        logCount,
        totalQty,
        list
      }
    })
  },

  // ========== 设备报警明细（下钻） ==========
  getAssetAlerts(params) {
    const { assetId, yearMonth } = params
    const ym = yearMonth || getCurrentYearMonth()
    const asset = assets.find(a => a.assetId === assetId)

    // 该设备本月的报警
    const assetAlerts = alerts.filter(a => a.assetId === assetId && a.yearMonth === ym)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(a => {
        const part = parts.find(p => p.partSkuId === a.partSkuId)
        const overQty = a.currentQty - a.thresholdValue
        const overRate = Math.round((a.currentQty / a.thresholdValue) * 100)

        // 该设备+该配件本月的更换记录
        const logs = replacementLogs
          .filter(l => l.assetId === assetId && l.yearMonth === ym)
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
          .sort((a, b) => b.ts - a.ts)

        return {
          alertId: a.alertId,
          partSkuId: a.partSkuId,
          partName: part ? part.partName : a.partSkuId,
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

    return delay({
      ok: true,
      data: {
        assetId,
        assetName: asset ? asset.assetName : assetId,
        assetNo: asset ? asset.assetNo : '',
        yearMonth: ym,
        openCount: assetAlerts.filter(a => a.status === 'OPEN').length,
        alerts: assetAlerts
      }
    })
  },

  // ========== 设备列表 ==========
  listAssets() {
    const list = assets.map(a => ({
      assetId: a.assetId,
      assetName: a.assetName,
      assetNo: a.assetNo,
      workshop: a.workshop,
      status: a.status
    }))
    return delay({ ok: true, data: { list } })
  },

  // ========== 当月配件使用金额排名 ==========
  getMonthlyCostRanking(params) {
    const ym = params.yearMonth || getCurrentYearMonth()
    // Mock cost data based on existing outbound data
    const mockCostData = [
      { assetId: 'ZB-001', assetName: '隧道式洗衣龙1号', totalCost: 3200.00, percentage: 40.5 },
      { assetId: 'ZB-003', assetName: '烘干机1号', totalCost: 2150.00, percentage: 27.2 },
      { assetId: 'ZB-002', assetName: '隧道式洗衣龙2号', totalCost: 1800.00, percentage: 22.8 },
    ]
    const total = mockCostData.reduce((s, d) => s + d.totalCost, 0)
    return delay({
      ok: true,
      data: {
        yearMonth: ym,
        totalMonthlyUsageCost: Math.round(total * 100) / 100,
        costByAsset: mockCostData
      }
    })
  },

  // ========== 低库存报警 ==========
  listInventoryAlerts() {
    const mockInvAlerts = [
      { alertId: 'ia_001', partSkuId: 'sku_003', partNameSnapshot: '密封圈', currentQty: 3, threshold: 10, status: 'OPEN', ackByUserId: null, ackTs: null, ackNote: null, createdAt: Date.now() - 86400000 },
      { alertId: 'ia_002', partSkuId: 'sku_005', partNameSnapshot: '轴承', currentQty: 5, threshold: 10, status: 'OPEN', ackByUserId: null, ackTs: null, ackNote: null, createdAt: Date.now() - 86400000 * 2 },
    ]
    return delay({ ok: true, data: { list: mockInvAlerts } })
  },

  // ========== 设备配件金额明细（下钻） ==========
  getAssetCostDetail(params) {
    const { assetId } = params
    // 根据不同设备返回不同配件数据
    const mockPartCostMap = {
      'ZB-001': [
        { partSkuId: 'P-001', partName: '洗涤泵', specModel: 'WP-200A', qty: 3, unit: '个', totalCost: 1500.00 },
        { partSkuId: 'P-003', partName: '密封圈', specModel: 'SL-50', qty: 8, unit: '个', totalCost: 800.00 },
        { partSkuId: 'P-002', partName: '加热管', specModel: 'HT-100', qty: 2, unit: '根', totalCost: 600.00 },
        { partSkuId: 'P-005', partName: '排水阀', specModel: 'DV-30', qty: 1, unit: '个', totalCost: 200.00 },
        { partSkuId: 'P-006', partName: '滤网', specModel: 'FN-10', qty: 5, unit: '个', totalCost: 100.00 },
      ],
      'ZB-003': [
        { partSkuId: 'P-010', partName: '烘干加热管', specModel: 'DH-300', qty: 2, unit: '根', totalCost: 1200.00 },
        { partSkuId: 'P-011', partName: '风机轴承', specModel: 'FB-80', qty: 4, unit: '个', totalCost: 600.00 },
        { partSkuId: 'P-012', partName: '温控传感器', specModel: 'TS-50', qty: 1, unit: '个', totalCost: 350.00 },
      ],
      'ZB-002': [
        { partSkuId: 'P-001', partName: '洗涤泵', specModel: 'WP-200A', qty: 2, unit: '个', totalCost: 1000.00 },
        { partSkuId: 'P-003', partName: '密封圈', specModel: 'SL-50', qty: 5, unit: '个', totalCost: 500.00 },
        { partSkuId: 'P-007', partName: '传动皮带', specModel: 'BT-120', qty: 1, unit: '条', totalCost: 300.00 },
      ]
    }
    const parts = mockPartCostMap[assetId] || [
      { partSkuId: 'P-099', partName: '通用配件', specModel: '', qty: 1, unit: '个', totalCost: 100.00 },
    ]
    // 已按金额从高到低排序
    parts.sort((a, b) => b.totalCost - a.totalCost)
    const total = parts.reduce((s, p) => s + p.totalCost, 0)
    return delay({
      ok: true,
      data: {
        assetId,
        totalCost: Math.round(total * 100) / 100,
        partList: parts
      }
    })
  },

  // ========== 工厂列表 ==========
  getFactories() {
    const auth = require('./auth')
    const user = auth.getUser()
    const allFactories = [
      { factoryId: 'F-001', factoryName: '上海工厂', factoryCode: 'SH', status: 'active' },
      { factoryId: 'F-002', factoryName: '北京工厂', factoryCode: 'BJ', status: 'active' },
      { factoryId: 'F-003', factoryName: '广州工厂', factoryCode: 'GZ', status: 'active' },
      { factoryId: 'F-004', factoryName: '成都工厂', factoryCode: 'CD', status: 'active' }
    ]
    const canSwitch = auth.canSwitchFactory()
    const factories = canSwitch ? allFactories : allFactories.filter(f => f.factoryId === 'F-001')
    return delay({
      ok: true,
      data: {
        factories,
        userFactoryId: user.factoryId || 'F-001',
        canSwitchFactory: canSwitch
      }
    })
  }
}

// 模拟网络延迟
function delay(data, ms = 300) {
  return new Promise(resolve => setTimeout(() => resolve(data), ms))
}

module.exports = mockApi
