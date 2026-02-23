/**
 * API 层 —— 四种模式：
 * 1. http 模式（VITE_APP_MODE=http）：通过 HTTP 访问服务直连云函数，个人版+开通 HTTP 后推荐
 * 2. cloud 模式（VITE_APP_MODE=cloud）：用 @cloudbase/js-sdk 匿名登录调用云函数
 * 3. real 模式（VITE_APP_USE_REAL_API=true）：通过 pc-server 网关调用云函数，本地开发时用
 * 4. mock 模式（默认）：使用本地 Mock 数据，演示/开发时用
 */
import { realApi } from './api-real'
import { cloudApi } from './api-cloud'
import { httpApi } from './api-http'
import {
  mockUsers, mockAssets, mockParts, mockLocations,
  mockLocationPartMap, mockThresholds, mockReplacementLogs,
  mockMonthlyUsage, mockAlerts,
  mockFactories, mockInventory, mockInboundLogs, mockOutboundLogs, mockInventoryAlerts,
  getAssetName, getPartName, getPartCode, getUserName,
} from './mock-data'
import dayjs from 'dayjs'

// 模拟网络延迟
const delay = (ms = 300) => new Promise(r => setTimeout(r, ms))

// 生成简单 ID
let idCounter = 1000
const genId = (prefix) => `${prefix}-${String(++idCounter).padStart(3, '0')}`

// ===== 深拷贝辅助 =====
const clone = (obj) => JSON.parse(JSON.stringify(obj))

// AI 分析配置（模拟 system_config，仅 Admin 可改）
const _aiConfig = { apiKey: '', model: 'gpt-4o-mini' }
const AI_MODEL_OPTIONS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-3.5-turbo',
  'deepseek-chat',
  'deepseek-reasoner',
]

// ===== 辅助：按 factoryId 聚合单月指标 =====
function aggregateMonthForFactory(factoryId, ym) {
  let logs = mockReplacementLogs.filter(l => l.yearMonth === ym)
  let alertsList = mockAlerts.filter(a => a.yearMonth === ym)
  if (factoryId) {
    logs = logs.filter(l => l.factoryId === factoryId)
    alertsList = alertsList.filter(a => a.factoryId === factoryId)
  }
  const openAlerts = alertsList.filter(a => a.status === 'OPEN')
  let totalPartsQty = 0
  const typeCount = { '维修': 0, '预防': 0, '紧急': 0 }
  const partUsageMap = {}
  const assetCountMap = {}
  const engineerMap = {}
  logs.forEach(l => {
    typeCount[l.type] = (typeCount[l.type] || 0) + 1
    l.items.forEach(item => {
      totalPartsQty += item.qty
      if (!partUsageMap[item.partSkuId]) partUsageMap[item.partSkuId] = { partSkuId: item.partSkuId, partName: item.partNameSnapshot, partCode: item.partCodeSnapshot, totalQty: 0 }
      partUsageMap[item.partSkuId].totalQty += item.qty
    })
    if (!assetCountMap[l.assetId]) assetCountMap[l.assetId] = { assetId: l.assetId, assetName: l.assetNameSnapshot, assetNo: l.assetNoSnapshot, logCount: 0, urgentCount: 0 }
    assetCountMap[l.assetId].logCount++
    if (l.type === '紧急') assetCountMap[l.assetId].urgentCount++
    if (!engineerMap[l.reporterUserIdSnapshot]) engineerMap[l.reporterUserIdSnapshot] = { userId: l.reporterUserIdSnapshot, name: l.reporterNameSnapshot, logCount: 0 }
    engineerMap[l.reporterUserIdSnapshot].logCount++
  })
  const topParts = Object.values(partUsageMap).sort((a, b) => b.totalQty - a.totalQty).slice(0, 5)
  const topAssets = Object.values(assetCountMap).sort((a, b) => b.logCount - a.logCount).slice(0, 5)
  const engineerWorkload = Object.values(engineerMap).sort((a, b) => b.logCount - a.logCount)
  const alertAssetMap = {}
  openAlerts.forEach(a => {
    if (!alertAssetMap[a.assetId]) alertAssetMap[a.assetId] = { assetId: a.assetId, assetName: getAssetName(a.assetId), openCount: 0 }
    alertAssetMap[a.assetId].openCount++
  })
  const alertsByAsset = Object.values(alertAssetMap).sort((a, b) => b.openCount - a.openCount)

  let invList = mockInventory
  let invAlertList = mockInventoryAlerts
  if (factoryId) {
    invList = invList.filter(i => i.factoryId === factoryId)
    invAlertList = invAlertList.filter(a => a.factoryId === factoryId)
  }
  const totalInvValue = invList.reduce((s, i) => s + i.totalCostValue, 0)
  const lowStockCount = invAlertList.filter(a => a.status === 'OPEN').length
  let outbounds = mockOutboundLogs.filter(l => l.yearMonth === ym)
  if (factoryId) outbounds = outbounds.filter(l => l.factoryId === factoryId)
  const totalUsageCost = outbounds.reduce((s, l) => s + l.totalCost, 0)

  return {
    yearMonth: ym, totalLogs: logs.length, totalPartsQty, openAlerts: openAlerts.length,
    totalAlerts: alertsList.length, typeCount, topParts, topAssets, engineerWorkload,
    alertsByAsset, totalInvValue: Math.round(totalInvValue * 100) / 100,
    lowStockCount, totalUsageCost: Math.round(totalUsageCost * 100) / 100,
  }
}

// ===== 8 维度规则报告生成 =====
function buildFullReport(current, prev, factoryLabel, scope, byFactory) {
  const sections = []
  const urgentRate = current.totalLogs > 0 ? Math.round((current.typeCount['紧急'] || 0) / current.totalLogs * 100) : 0
  const prevRate = prev.totalLogs > 0 ? Math.round((prev.typeCount['紧急'] || 0) / prev.totalLogs * 100) : 0
  let healthItems = []
  healthItems.push({ text: `本月更换 ${current.totalLogs} 次，配件消耗 ${current.totalPartsQty} 件，待处理报警 ${current.openAlerts} 条。` })
  healthItems.push({ text: `更换类型分布：维修 ${current.typeCount['维修'] || 0} 次、预防 ${current.typeCount['预防'] || 0} 次、紧急 ${current.typeCount['紧急'] || 0} 次（紧急占比 ${urgentRate}%）。` })
  if (urgentRate > 30) healthItems.push({ text: `⚠ 紧急维修占比偏高（${urgentRate}%），建议加强预防性维保。` })
  if (urgentRate <= 15 && current.totalLogs > 0) healthItems.push({ text: `✓ 紧急维修占比较低（${urgentRate}%），维保计划执行良好。` })
  sections.push({ title: '运维健康总览', items: healthItems })

  const histItems = []
  const logsDiff = current.totalLogs - prev.totalLogs
  const logsPct = prev.totalLogs > 0 ? Math.round(logsDiff / prev.totalLogs * 100) : (current.totalLogs > 0 ? 100 : 0)
  const partsDiff = current.totalPartsQty - prev.totalPartsQty
  const partsPct = prev.totalPartsQty > 0 ? Math.round(partsDiff / prev.totalPartsQty * 100) : (current.totalPartsQty > 0 ? 100 : 0)
  const alertDiff = current.openAlerts - prev.openAlerts
  histItems.push({ text: `更换次数：本月 ${current.totalLogs} 次 vs 上月 ${prev.totalLogs} 次（${logsDiff >= 0 ? '+' : ''}${logsDiff}，${logsDiff >= 0 ? '+' : ''}${logsPct}%）。` })
  histItems.push({ text: `配件消耗：本月 ${current.totalPartsQty} 件 vs 上月 ${prev.totalPartsQty} 件（${partsDiff >= 0 ? '+' : ''}${partsDiff}，${partsDiff >= 0 ? '+' : ''}${partsPct}%）。` })
  histItems.push({ text: `OPEN 报警：本月 ${current.openAlerts} 条 vs 上月 ${prev.openAlerts} 条（${alertDiff >= 0 ? '+' : ''}${alertDiff}）。` })
  const costDiff = current.totalUsageCost - (prev.totalUsageCost || 0)
  const costPct = prev.totalUsageCost > 0 ? Math.round(costDiff / prev.totalUsageCost * 100) : 0
  histItems.push({ text: `配件使用金额：本月 ¥${current.totalUsageCost.toLocaleString()} vs 上月 ¥${(prev.totalUsageCost || 0).toLocaleString()}（${costDiff >= 0 ? '+' : ''}${costPct}%）。` })
  if (logsPct > 50) histItems.push({ text: `⚠ 更换次数环比上升 ${logsPct}%，明显高于上月，建议排查原因。` })
  if (logsPct < -30 && prev.totalLogs > 3) histItems.push({ text: `✓ 更换次数环比下降 ${Math.abs(logsPct)}%，设备运行趋于稳定。` })
  if (urgentRate > prevRate + 10) histItems.push({ text: `⚠ 紧急维修占比从上月 ${prevRate}% 升至 ${urgentRate}%，被动维修增加。` })
  sections.push({ title: '历史对比与趋势', items: histItems })

  if (current.topAssets?.length) {
    const devItems = current.topAssets.map((a, i) => {
      let t = `TOP${i + 1}：${a.assetName}（${a.assetNo}）本月 ${a.logCount} 次更换`
      if (a.urgentCount > 0) t += `，其中紧急 ${a.urgentCount} 次`
      t += '。'
      if (a.urgentCount >= 3) t += ' ⚠ 紧急维修频繁，建议安排全面检修。'
      else if (a.logCount >= 5) t += ' 建议关注运行状态与预防性保养。'
      return { text: t }
    })
    sections.push({ title: '设备风险分析', items: devItems })
  }

  if (current.topParts?.length) {
    const partItems = current.topParts.map((p, i) => ({
      text: `TOP${i + 1}：${p.partName}（${p.partCode}）本月消耗 ${p.totalQty} 件，建议关注库存与采购。`,
    }))
    sections.push({ title: '配件消耗分析', items: partItems })
  }

  const costItems = []
  costItems.push({ text: `本月配件使用成本 ¥${current.totalUsageCost.toLocaleString()}，库存总价值 ¥${current.totalInvValue.toLocaleString()}。` })
  if (current.lowStockCount > 0) costItems.push({ text: `⚠ 当前有 ${current.lowStockCount} 种配件低库存预警，建议尽快采购补充。` })
  sections.push({ title: '成本分析', items: costItems })

  if (current.engineerWorkload?.length) {
    const top = current.engineerWorkload[0]
    const pItems = [{ text: `本月活跃工程师 ${current.engineerWorkload.length} 人，${top.name} 记录最多（${top.logCount} 条）。` }]
    if (current.engineerWorkload.length >= 2) {
      const max = current.engineerWorkload[0].logCount
      const min = current.engineerWorkload[current.engineerWorkload.length - 1].logCount
      if (max > min * 3 && min > 0) pItems.push({ text: `⚠ 工作量分布不均（最多 ${max} 条 vs 最少 ${min} 条），建议合理分配。` })
    }
    sections.push({ title: '人员与负荷', items: pItems })
  }

  if (current.openAlerts > 0 && current.alertsByAsset?.length) {
    const aItems = current.alertsByAsset.slice(0, 5).map(a => ({
      text: `${a.assetName} 有 ${a.openCount} 条待处理报警，建议尽快 ACK 或现场排查。`,
    }))
    sections.push({ title: '报警与响应闭环', items: aItems })
  }

  if (scope === 'summary' && byFactory?.length) {
    const fItems = byFactory.map(f => ({
      text: `${f.factoryName}：更换 ${f.totalLogs} 次，消耗 ${f.totalPartsQty} 件，OPEN ${f.openAlerts} 条，使用成本 ¥${f.totalUsageCost.toLocaleString()}`,
    }))
    const topByAlert = [...byFactory].sort((a, b) => b.openAlerts - a.openAlerts)[0]
    const topByCost = [...byFactory].sort((a, b) => b.totalUsageCost - a.totalUsageCost)[0]
    if (topByAlert?.openAlerts > 0) fItems.push({ text: `⚠ ${topByAlert.factoryName} 报警最多（${topByAlert.openAlerts} 条），建议优先排查。` })
    if (topByCost) fItems.push({ text: `${topByCost.factoryName} 配件使用成本最高（¥${topByCost.totalUsageCost.toLocaleString()}）。` })
    sections.push({ title: '各工厂横向对比', items: fItems })
  }

  let summaryText = ''
  if (scope === 'summary') {
    summaryText = `全部工厂本月更换 ${current.totalLogs} 次，配件消耗 ${current.totalPartsQty} 件，待处理报警 ${current.openAlerts} 条，使用成本 ¥${current.totalUsageCost.toLocaleString()}。`
    if (logsPct > 20) summaryText += ` 较上月整体上升 ${logsPct}%。`
    else if (logsPct < -20) summaryText += ` 较上月整体下降 ${Math.abs(logsPct)}%。`
  } else {
    summaryText = `${factoryLabel} 本月更换 ${current.totalLogs} 次，配件消耗 ${current.totalPartsQty} 件，紧急占比 ${urgentRate}%，待处理报警 ${current.openAlerts} 条。`
    if (logsPct > 0 && prev.totalLogs > 0) summaryText += ` 较上月增长 ${logsPct}%。`
    else if (logsPct < 0 && prev.totalLogs > 0) summaryText += ` 较上月下降 ${Math.abs(logsPct)}%。`
    if (current.openAlerts > 0) summaryText += ' 存在未处理报警，建议优先处理。'
  }

  return { summaryText, sections, history: { current, prev, logsPct, partsPct, costPct } }
}

const mockApi = {
  async adminLogin({ username, password }) {
    await delay(500)
    const user = mockUsers.find(u =>
      u.username === username && u.passwordHash === password && u.canPcLogin && u.status === 'active'
    )
    if (!user) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '用户名或密码错误，或无PC端登录权限' } }
    }
    return {
      ok: true,
      data: {
        user: { userId: user.userId, username: user.username, displayName: user.displayName, role: user.role, status: user.status, factoryId: user.factoryId || '' },
        token: 'mock_jwt_token_' + user.userId,
      },
    }
  },

  async listUsers() {
    await delay()
    return { ok: true, data: { list: clone(mockUsers).map(u => { delete u.passwordHash; return u }) } }
  },

  async createUser(data) {
    await delay()
    const exists = mockUsers.find(u => u.username === data.username)
    if (exists) return { ok: false, error: { code: 'DUPLICATE', message: '用户名已存在' } }
    const user = { userId: genId('u'), username: data.username, displayName: data.displayName, role: data.role, status: 'active', openid: '', passwordHash: data.password || '', canPcLogin: data.canPcLogin || false, factoryId: data.role === 'Supervisor' ? (data.factoryId || '') : '', updatedAt: Date.now() }
    mockUsers.push(user)
    return { ok: true, data: { userId: user.userId } }
  },

  async updateUser(userId, data) {
    await delay()
    const user = mockUsers.find(u => u.userId === userId)
    if (!user) return { ok: false, error: { code: 'NOT_FOUND', message: '用户不存在' } }
    const payload = { ...data, updatedAt: Date.now() }
    if (data.role !== 'Supervisor') payload.factoryId = ''
    else if (data.factoryId !== undefined) payload.factoryId = data.factoryId
    Object.assign(user, payload)
    return { ok: true, data: {} }
  },

  async getAIConfig() {
    await delay()
    const raw = _aiConfig
    const apiKeyMasked = raw.apiKey ? (raw.apiKey.slice(0, 6) + '***' + raw.apiKey.slice(-4)) : ''
    return { ok: true, data: { apiKeyMasked, model: raw.model || 'gpt-4o-mini', models: AI_MODEL_OPTIONS } }
  },

  async setAIConfig({ apiKey, model }) {
    await delay()
    if (apiKey !== undefined) _aiConfig.apiKey = apiKey
    if (model !== undefined) _aiConfig.model = model
    return { ok: true, data: {} }
  },

  async disableUser(userId) {
    await delay()
    const user = mockUsers.find(u => u.userId === userId)
    if (!user) return { ok: false, error: { code: 'NOT_FOUND', message: '用户不存在' } }
    user.status = user.status === 'active' ? 'disabled' : 'active'
    user.updatedAt = Date.now()
    return { ok: true, data: { newStatus: user.status } }
  },

  async bindOpenid(userId, openid) { await delay(); const u = mockUsers.find(u => u.userId === userId); if (!u) return { ok: false, error: { code: 'NOT_FOUND', message: '用户不存在' } }; u.openid = openid; return { ok: true, data: {} } },
  async unbindOpenid(userId) { await delay(); const u = mockUsers.find(u => u.userId === userId); if (!u) return { ok: false, error: { code: 'NOT_FOUND', message: '用户不存在' } }; u.openid = ''; return { ok: true, data: {} } },

  async listAssets(factoryId) { await delay(); let list = clone(mockAssets); if (factoryId) list = list.filter(a => a.factoryId === factoryId); return { ok: true, data: { list } } },
  async createAsset(data) { await delay(); const asset = { assetId: data.assetId || genId('ZB'), assetName: data.assetName, assetNo: data.assetNo, deviceTypeId: data.deviceTypeId || '', workshop: data.workshop || '', status: 'active', createdAt: Date.now(), updatedAt: Date.now() }; mockAssets.push(asset); return { ok: true, data: { assetId: asset.assetId } } },
  async updateAsset(assetId, data) { await delay(); const a = mockAssets.find(a => a.assetId === assetId); if (!a) return { ok: false, error: { code: 'NOT_FOUND', message: '设备不存在' } }; Object.assign(a, data, { updatedAt: Date.now() }); return { ok: true, data: {} } },
  async setAssetStatus(assetId, status) { await delay(); const a = mockAssets.find(a => a.assetId === assetId); if (!a) return { ok: false, error: { code: 'NOT_FOUND', message: '设备不存在' } }; a.status = status; a.updatedAt = Date.now(); return { ok: true, data: {} } },

  async listLocations(assetId) { await delay(); const list = mockLocations.filter(l => l.assetId === assetId).sort((a, b) => a.sortOrder - b.sortOrder); return { ok: true, data: { list: clone(list) } } },
  async upsertLocation(data) { await delay(); if (data.locationId) { const loc = mockLocations.find(l => l.locationId === data.locationId); if (loc) { Object.assign(loc, data, { updatedAt: Date.now() }); return { ok: true, data: { locationId: loc.locationId } } } } const loc = { locationId: genId('loc'), assetId: data.assetId, locationName: data.locationName, sortOrder: data.sortOrder || 0, active: true, updatedAt: Date.now() }; mockLocations.push(loc); return { ok: true, data: { locationId: loc.locationId } } },
  async deleteLocation(locationId) { await delay(); const idx = mockLocations.findIndex(l => l.locationId === locationId); if (idx === -1) return { ok: false, error: { code: 'NOT_FOUND', message: '部位不存在' } }; mockLocations.splice(idx, 1); for (let i = mockLocationPartMap.length - 1; i >= 0; i--) { if (mockLocationPartMap[i].locationId === locationId) mockLocationPartMap.splice(i, 1) } return { ok: true, data: {} } },
  async copyLocations(fromAssetId, toAssetId) { await delay(); const fromLocs = mockLocations.filter(l => l.assetId === fromAssetId && l.active); const fromMaps = mockLocationPartMap.filter(m => m.assetId === fromAssetId && m.active); const locIdMap = {}; fromLocs.forEach(loc => { const nid = genId('loc'); locIdMap[loc.locationId] = nid; mockLocations.push({ locationId: nid, assetId: toAssetId, locationName: loc.locationName, sortOrder: loc.sortOrder, active: true, updatedAt: Date.now() }) }); fromMaps.forEach(m => { if (locIdMap[m.locationId]) mockLocationPartMap.push({ mapId: genId('map'), assetId: toAssetId, locationId: locIdMap[m.locationId], partSkuId: m.partSkuId, active: true }) }); return { ok: true, data: { copiedLocations: fromLocs.length, copiedMaps: fromMaps.length } } },

  async listLocationPartMap(assetId, locationId) { await delay(); let list = mockLocationPartMap.filter(m => m.assetId === assetId && m.active); if (locationId) list = list.filter(m => m.locationId === locationId); const enriched = clone(list).map(m => ({ ...m, partName: getPartName(m.partSkuId), partCode: getPartCode(m.partSkuId) })); return { ok: true, data: { list: enriched } } },
  async upsertLocationPartMap(data) { await delay(); const exists = mockLocationPartMap.find(m => m.assetId === data.assetId && m.locationId === data.locationId && m.partSkuId === data.partSkuId); if (exists) { exists.active = true; return { ok: true, data: { mapId: exists.mapId } } } const map = { mapId: genId('map'), assetId: data.assetId, locationId: data.locationId, partSkuId: data.partSkuId, active: true }; mockLocationPartMap.push(map); return { ok: true, data: { mapId: map.mapId } } },
  async deleteLocationPartMap(mapId) { await delay(); const idx = mockLocationPartMap.findIndex(m => m.mapId === mapId); if (idx === -1) return { ok: false, error: { code: 'NOT_FOUND', message: '映射不存在' } }; mockLocationPartMap.splice(idx, 1); return { ok: true, data: {} } },

  async listParts() { await delay(); return { ok: true, data: { list: clone(mockParts) } } },
  async createPart(data) { await delay(); const exists = mockParts.find(p => p.partCode === data.partCode); if (exists) return { ok: false, error: { code: 'DUPLICATE', message: '配件编号已存在' } }; const part = { partSkuId: data.partSkuId || genId('SKU'), partName: data.partName, partCode: data.partCode, unit: data.unit, specModel: data.specModel || '', active: true, source: 'manual', updatedAt: Date.now() }; mockParts.push(part); return { ok: true, data: { partSkuId: part.partSkuId } } },
  async updatePart(partSkuId, data) { await delay(); const part = mockParts.find(p => p.partSkuId === partSkuId); if (!part) return { ok: false, error: { code: 'NOT_FOUND', message: '配件不存在' } }; Object.assign(part, data, { updatedAt: Date.now() }); return { ok: true, data: {} } },
  async deletePart(partSkuId) {
    await delay()
    const idx = mockParts.findIndex(p => p.partSkuId === partSkuId)
    if (idx === -1) return { ok: false, error: { code: 'NOT_FOUND', message: '配件不存在' } }
    mockParts.splice(idx, 1)
    return { ok: true, data: { partSkuId, removed: 1 } }
  },
  async batchSetPartsActive(partSkuIds, active) {
    await delay()
    if (!Array.isArray(partSkuIds) || partSkuIds.length === 0) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请选择至少一个配件' } }
    }
    let updated = 0
    partSkuIds.forEach(id => {
      const part = mockParts.find(p => p.partSkuId === id)
      if (part) {
        part.active = !!active
        part.updatedAt = Date.now()
        updated++
      }
    })
    return { ok: true, data: { requested: partSkuIds.length, updated, active: !!active } }
  },
  async batchDeleteParts(partSkuIds) {
    await delay()
    if (!Array.isArray(partSkuIds) || partSkuIds.length === 0) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请选择至少一个配件' } }
    }
    let deleted = 0
    const errors = []
    partSkuIds.forEach(id => {
      const idx = mockParts.findIndex(p => p.partSkuId === id)
      if (idx === -1) errors.push({ partSkuId: id, message: '配件不存在' })
      else {
        mockParts.splice(idx, 1)
        deleted++
      }
    })
    return { ok: true, data: { requested: partSkuIds.length, deleted, failed: errors.length, errors } }
  },
  async importPartsPreview(rows) { await delay(500); const errors = []; const valid = []; rows.forEach((row, idx) => { const lineNo = idx + 2; if (!row.partSkuId) { errors.push({ line: lineNo, msg: 'partSkuId 必填' }); return } if (!row.partName) { errors.push({ line: lineNo, msg: 'partName 必填' }); return } if (!row.partCode) { errors.push({ line: lineNo, msg: 'partCode 必填' }); return } if (!row.unit) { errors.push({ line: lineNo, msg: 'unit 必填' }); return } valid.push({ ...row, _line: lineNo }) }); return { ok: true, data: { valid: valid.length, errors, total: rows.length } } },
  async importPartsCommit(rows) { await delay(800); let created = 0, updated = 0; rows.forEach(row => { const existing = mockParts.find(p => p.partSkuId === row.partSkuId); if (existing) { Object.assign(existing, row, { source: 'Excel', updatedAt: Date.now() }); updated++ } else { mockParts.push({ ...row, active: true, source: 'Excel', updatedAt: Date.now() }); created++ } }); return { ok: true, data: { created, updated } } },

  async listThresholds(assetId) { await delay(); let list = clone(mockThresholds).filter(t => t.active); if (assetId) list = list.filter(t => t.assetId === assetId); const currentYM = dayjs().format('YYYY-MM'); list = list.map(t => ({ ...t, assetName: getAssetName(t.assetId), partName: getPartName(t.partSkuId), partCode: getPartCode(t.partSkuId), currentMonthQty: mockMonthlyUsage.find(u => u.assetId === t.assetId && u.partSkuId === t.partSkuId && u.yearMonth === currentYM)?.qtySum || 0 })); return { ok: true, data: { list } } },
  async upsertThreshold(data) { await delay(); const existing = mockThresholds.find(t => t.assetId === data.assetId && t.partSkuId === data.partSkuId); if (existing) { existing.thresholdMonthly = data.thresholdMonthly; existing.active = true; existing.updatedAt = Date.now(); return { ok: true, data: { thresholdId: existing.thresholdId } } } const th = { thresholdId: genId('th'), assetId: data.assetId, partSkuId: data.partSkuId, thresholdMonthly: data.thresholdMonthly, active: true, updatedAt: Date.now() }; mockThresholds.push(th); return { ok: true, data: { thresholdId: th.thresholdId } } },
  async batchUpsertThresholds(items) { await delay(500); let count = 0; for (const item of items) { await api.upsertThreshold(item); count++ } return { ok: true, data: { count } } },
  async deleteThreshold(thresholdId) { await delay(); const th = mockThresholds.find(t => t.thresholdId === thresholdId); if (!th) return { ok: false, error: { code: 'NOT_FOUND', message: '阈值不存在' } }; th.active = false; return { ok: true, data: {} } },

  async listReplacementLogs({ factoryId, yearMonth, assetId, userId, module: moduleFilter, page = 1, pageSize = 20 } = {}) { await delay(); let list = clone(mockReplacementLogs); if (factoryId) list = list.filter(l => l.factoryId === factoryId); if (yearMonth) list = list.filter(l => l.yearMonth === yearMonth); if (assetId) list = list.filter(l => l.assetId === assetId); if (userId) list = list.filter(l => l.reporterUserIdSnapshot === userId); if (moduleFilter === 'facility' || moduleFilter === 'boiler') { list = list.filter(l => l.module === moduleFilter) } else if (moduleFilter === 'equipment') { list = list.filter(l => !l.module || l.module === 'equipment') } list.sort((a, b) => b.ts - a.ts); const total = list.length; const start = (page - 1) * pageSize; list = list.slice(start, start + pageSize); return { ok: true, data: { list, total, page, pageSize } } },

  async submitFacilityLog(data) { await delay(); return { ok: true, data: { logId: genId('log'), yearMonth: dayjs().format('YYYY-MM') } } },

  async listAlerts({ factoryId, status, yearMonth, assetId, page = 1, pageSize = 20 } = {}) { await delay(); let list = clone(mockAlerts); if (factoryId) list = list.filter(a => a.factoryId === factoryId); if (status) list = list.filter(a => a.status === status); if (yearMonth) list = list.filter(a => a.yearMonth === yearMonth); if (assetId) list = list.filter(a => a.assetId === assetId); list.sort((a, b) => b.createdAt - a.createdAt); list = list.map(a => ({ ...a, assetName: getAssetName(a.assetId), partName: getPartName(a.partSkuId), partCode: getPartCode(a.partSkuId), ackByName: a.ackByUserId ? getUserName(a.ackByUserId) : '' })); const total = list.length; const start = (page - 1) * pageSize; list = list.slice(start, start + pageSize); return { ok: true, data: { list, total, page, pageSize } } },

  async ackAlert(alertId, ackNote) { await delay(); const alert = mockAlerts.find(a => a.alertId === alertId); if (!alert) return { ok: false, error: { code: 'ALERT_NOT_FOUND', message: '报警不存在' } }; if (alert.status !== 'OPEN') return { ok: false, error: { code: 'ALERT_NOT_OPEN', message: '该报警已处理' } }; alert.status = 'ACK'; alert.ackByUserId = 'u001'; alert.ackTs = Date.now(); alert.ackNote = ackNote; return { ok: true, data: {} } },

  async getDashboardStats(opts) { const { yearMonth: yearMonthArg, factoryId, workshop } = typeof opts === 'object' ? opts : { yearMonth: opts, factoryId: null, workshop: null }; await delay(400); const ym = yearMonthArg || dayjs().format('YYYY-MM'); let logs = mockReplacementLogs.filter(l => l.yearMonth === ym); let alerts = mockAlerts.filter(a => a.yearMonth === ym); if (workshop) { const allowedAssetIds = new Set(mockAssets.filter(a => a.workshop === workshop).map(a => a.assetId)); logs = logs.filter(l => allowedAssetIds.has(l.assetId)); alerts = alerts.filter(a => allowedAssetIds.has(a.assetId)) } else if (factoryId) { logs = logs.filter(l => l.factoryId === factoryId); alerts = alerts.filter(a => a.factoryId === factoryId) } const openAlerts = alerts.filter(a => a.status === 'OPEN'); let totalPartsQty = 0; logs.forEach(l => l.items.forEach(item => { totalPartsQty += item.qty })); const partUsageMap = {}; logs.forEach(l => { l.items.forEach(item => { if (!partUsageMap[item.partSkuId]) partUsageMap[item.partSkuId] = { partSkuId: item.partSkuId, partName: item.partNameSnapshot, partCode: item.partCodeSnapshot, totalQty: 0 }; partUsageMap[item.partSkuId].totalQty += item.qty }) }); const topParts = Object.values(partUsageMap).sort((a, b) => b.totalQty - a.totalQty).slice(0, 5); const assetCountMap = {}; logs.forEach(l => { if (!assetCountMap[l.assetId]) assetCountMap[l.assetId] = { assetId: l.assetId, assetName: l.assetNameSnapshot, assetNo: l.assetNoSnapshot, logCount: 0 }; assetCountMap[l.assetId].logCount++ }); const topAssets = Object.values(assetCountMap).sort((a, b) => b.logCount - a.logCount).slice(0, 5); const engineerMap = {}; logs.forEach(l => { if (!engineerMap[l.reporterUserIdSnapshot]) engineerMap[l.reporterUserIdSnapshot] = { userId: l.reporterUserIdSnapshot, name: l.reporterNameSnapshot, logCount: 0 }; engineerMap[l.reporterUserIdSnapshot].logCount++ }); const engineerWorkload = Object.values(engineerMap).sort((a, b) => b.logCount - a.logCount); const today = dayjs(); const dailyTrend = []; for (let i = 6; i >= 0; i--) { const d = today.subtract(i, 'day'); const dateStr = d.format('YYYY-MM-DD'); const count = logs.filter(l => dayjs(l.ts).format('YYYY-MM-DD') === dateStr).length; dailyTrend.push({ date: dateStr, label: d.format('MM-DD'), count }) } const alertAssetMap = {}; openAlerts.forEach(a => { if (!alertAssetMap[a.assetId]) alertAssetMap[a.assetId] = { assetId: a.assetId, assetName: getAssetName(a.assetId), workshop: mockAssets.find(x => x.assetId === a.assetId)?.workshop || '', openCount: 0 }; alertAssetMap[a.assetId].openCount++ }); const alertsByAsset = Object.values(alertAssetMap).sort((a, b) => b.openCount - a.openCount); return { ok: true, data: { yearMonth: ym, totalLogs: logs.length, totalPartsQty, openAlerts: openAlerts.length, totalAlerts: alerts.length, topParts, topAssets, engineerWorkload, dailyTrend, alertsByAsset } } },

  async getAIReport(opts) { const { yearMonth, factoryId, scope = 'factory' } = opts || {}; await delay(500); const ym = yearMonth || dayjs().format('YYYY-MM'); const prevYm = dayjs(ym + '-01').subtract(1, 'month').format('YYYY-MM'); let current, prev; let byFactory = []; if (scope === 'summary') { current = aggregateMonthForFactory(null, ym); prev = aggregateMonthForFactory(null, prevYm); for (const f of mockFactories) { const fc = aggregateMonthForFactory(f.factoryId, ym); byFactory.push({ factoryId: f.factoryId, factoryName: f.factoryName, ...fc }) } } else { current = aggregateMonthForFactory(factoryId, ym); prev = aggregateMonthForFactory(factoryId, prevYm) } const fLabel = scope === 'summary' ? '全部工厂' : (mockFactories.find(f => f.factoryId === factoryId)?.factoryName || '当前工厂'); const report = buildFullReport(current, prev, fLabel, scope, byFactory); return { ok: true, data: { ...report, stats: current, prevStats: prev, byFactory: scope === 'summary' ? byFactory : undefined, factoryLabel: fLabel } } },

  async getDashboardPartDetail(partSkuId, yearMonth, workshop) { await delay(300); return { ok: true, data: { partSkuId, partName: getPartName(partSkuId), byAsset: [] } } },
  async getDashboardAssetDetail(assetId, yearMonth, workshop) { await delay(300); return { ok: true, data: { assetId, assetName: getAssetName(assetId), byPart: [] } } },
  async getDashboardAssetAlerts(assetId, yearMonth, workshop) { await delay(300); return { ok: true, data: { assetId, assetName: getAssetName(assetId), alerts: [] } } },

  async listFactories() { await delay(); return { ok: true, data: { list: clone(mockFactories) } } },
  async createFactory(data) { await delay(); const exists = mockFactories.find(f => f.factoryCode === data.factoryCode); if (exists) return { ok: false, error: { code: 'DUPLICATE', message: '工厂编号已存在' } }; const factory = { factoryId: 'F-' + String(Date.now()).slice(-6), factoryName: data.factoryName, factoryCode: data.factoryCode, address: data.address || '', status: 'active', createdAt: Date.now(), updatedAt: Date.now() }; mockFactories.push(factory); return { ok: true, data: { factoryId: factory.factoryId } } },
  async updateFactory(factoryId, data) { await delay(); const factory = mockFactories.find(f => f.factoryId === factoryId); if (!factory) return { ok: false, error: { code: 'NOT_FOUND', message: '工厂不存在' } }; Object.assign(factory, data, { updatedAt: Date.now() }); return { ok: true, data: {} } },

  async listInventory(factoryId) { await delay(); let list = clone(mockInventory); if (factoryId) list = list.filter(i => i.factoryId === factoryId); return { ok: true, data: { list } } },
  async inventoryInbound(data) { await delay(); return { ok: true, data: { inboundId: 'IB-' + Date.now() } } },
  async listInboundLogs(factoryId, yearMonth) { await delay(); let list = clone(mockInboundLogs); if (factoryId) list = list.filter(l => l.factoryId === factoryId); if (yearMonth) list = list.filter(l => l.yearMonth === yearMonth); list.sort((a, b) => b.ts - a.ts); return { ok: true, data: { list } } },
  async listOutboundLogs(factoryId, yearMonth) { await delay(); let list = clone(mockOutboundLogs); if (factoryId) list = list.filter(l => l.factoryId === factoryId); if (yearMonth) list = list.filter(l => l.yearMonth === yearMonth); list.sort((a, b) => b.ts - a.ts); return { ok: true, data: { list } } },
  async listInventoryAlerts(factoryId) { await delay(); let list = clone(mockInventoryAlerts); if (factoryId) list = list.filter(a => a.factoryId === factoryId); return { ok: true, data: { list } } },
  async updateInventoryThreshold(inventoryId, threshold) { await delay(); return { ok: true, data: {} } },
  async getInventorySummary(factoryId, yearMonth) { await delay(); return { ok: true, data: { yearMonth: yearMonth || dayjs().format('YYYY-MM'), totalInventoryValue: 0, totalItems: 0, totalInboundValue: 0, totalOutboundValue: 0, lowStockCount: 0 } } },
  async getMonthlyCostRanking(factoryId, yearMonth) { await delay(); return { ok: true, data: { yearMonth: yearMonth || dayjs().format('YYYY-MM'), totalMonthlyUsageCost: 0, costByAsset: [] } } },
  async getPartUsageCostList(factoryId, yearMonth) { await delay(); return { ok: true, data: { yearMonth: yearMonth || dayjs().format('YYYY-MM'), totalCost: 0, list: [] } } },
  async getAssetCostDetail(factoryId, assetId, yearMonth) { await delay(); return { ok: true, data: { assetId, yearMonth: yearMonth || dayjs().format('YYYY-MM'), totalCost: 0, partList: [] } } },
  async getInventoryTrend(factoryId, months) { await delay(); return { ok: true, data: { months: [], inventoryByMonth: [], inboundByMonth: [], outboundByMonth: [] } } },
  async getCostTrend(factoryId, months) { await delay(); return { ok: true, data: { months: [], totalByMonth: [], topAssets: [] } } },
}

// 模式选择：http > cloud > real > mock
const MODE = import.meta.env.VITE_APP_MODE || ''
const USE_REAL_API = import.meta.env.VITE_APP_USE_REAL_API === 'true'

function selectApi() {
  if (MODE === 'http') return httpApi
  if (MODE === 'cloud') return cloudApi
  if (USE_REAL_API) return realApi
  return mockApi
}

export const api = selectApi()
