/**
 * PC 端 HTTP API：通过「HTTP 访问服务」直接请求云函数
 * 购买云开发个人版并开通 HTTP 访问服务后使用，无需匿名登录、无 PERMISSION_DENIED
 * 请求同域名下的 /adminPcLogin、/pcGateway（或 /api/pcGateway，取决于配置的触发路径）
 */
import { useAuthStore } from '@/stores/auth'

function getBase() {
  return (import.meta.env.VITE_APP_CLOUD_HTTP_BASE || '').replace(/\/$/, '')
}

async function request(path, body) {
  const base = getBase()
  try {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      return { ok: false, error: { code: 'PARSE_ERROR', message: '返回数据解析失败: ' + text.slice(0, 200) } }
    }
  } catch (err) {
    return { ok: false, error: { code: 'NETWORK', message: err.message || '网络请求失败' } }
  }
}

async function call(action, data = {}) {
  const token = useAuthStore().token
  if (!token) return { ok: false, error: { code: 'AUTH_FAILED', message: '请先登录' } }
  return request('/pcGateway', { token, action, data })
}

function notImplemented() {
  return Promise.resolve({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: '该功能 PC 端暂未对接云开发' } })
}

export const httpApi = {
  async adminLogin({ username, password }) {
    return request('/adminPcLogin', { username, password })
  },

  async getMe() {
    return call('getMe', {})
  },

  async listReplacementLogs(params = {}) {
    return call('listReplacementLogs', params)
  },

  async listAlerts(params = {}) {
    return call('listAlerts', params)
  },

  async ackAlert(alertId, ackNote) {
    return call('ackAlert', { alertId, ackNote })
  },

  async listAssets(factoryId) {
    return call('listAssets', { factoryId: factoryId || undefined })
  },

  async listParts(factoryId) {
    return call('listParts', { factoryId: factoryId || undefined })
  },

  async listThresholds(assetId, factoryId) {
    return call('listThresholds', { assetId: assetId || undefined, factoryId: factoryId || undefined })
  },

  async upsertThreshold(data) {
    return call('upsertThreshold', data)
  },

  async listUsers() {
    return call('listUsers', {})
  },

  async listLocations(assetId) {
    return call('listLocations', { assetId })
  },

  async listLocationPartMap(assetId, locationId) {
    return call('listLocationPartMap', { assetId, locationId })
  },

  async getFactories() {
    return call('getFactories', {})
  },

  async getDashboardStats(opts) {
    const { yearMonth, factoryId } = typeof opts === 'object' ? opts : { yearMonth: opts, factoryId: null }
    return call('getDashboardStats', { yearMonth, factoryId })
  },

  // ===== 用户管理 =====
  async createUser(data) { return call('createUser', data) },
  async updateUser(userId, data) { return call('updateUser', { userId, ...data }) },
  async disableUser(userId) { return call('disableUser', { userId }) },
  async deleteUser(userId) { return call('deleteUser', { userId }) },
  async bindOpenid(userId, openid) { return call('bindOpenid', { userId, openid }) },
  async unbindOpenid(userId) { return call('unbindOpenid', { userId }) },

  // ===== 设备管理 =====
  async createAsset(data) { return call('createAsset', data) },
  async updateAsset(assetId, data) { return call('updateAsset', { assetId, ...data }) },
  async setAssetStatus(assetId, status) { return call('setAssetStatus', { assetId, status }) },

  // ===== 部位管理 =====
  async upsertLocation(data) { return call('upsertLocation', data) },
  async deleteLocation(locationId) { return call('deleteLocation', { locationId }) },
  async copyLocations(fromAssetId, toAssetId) { return call('copyLocations', { fromAssetId, toAssetId }) },

  // ===== 部位-配件映射 =====
  async upsertLocationPartMap(data) { return call('upsertLocationPartMap', data) },
  async deleteLocationPartMap(mapId) { return call('deleteLocationPartMap', { mapId }) },

  // ===== 配件管理 =====
  async createPart(data) { return call('createPart', data) },
  async updatePart(partSkuId, data) { return call('updatePart', { partSkuId, ...data }) },
  async importPartsPreview(rows) { return call('importPartsPreview', { rows }) },
  async importPartsCommit(rows, factoryId) { return call('importPartsCommit', { rows, factoryId: factoryId || undefined }) },
  async migratePartsToFactory(factoryId) { return call('migratePartsToFactory', { factoryId }) },
  async cleanupParts(factoryId) { return call('cleanupParts', { factoryId: factoryId || undefined }) },
  async getFileUrls(fileIds) { return call('getFileUrls', { fileIds }) },
  async toggleLogStatus(logId, disabled) { return call('toggleLogStatus', { logId, disabled }) },
  async editReplacementLogItems(logId, items) { return call('editReplacementLogItems', { logId, items }) },

  // ===== 阈值管理 =====
  async batchUpsertThresholds(items) { return call('batchUpsertThresholds', { items }) },
  async deleteThreshold(thresholdId) { return call('deleteThreshold', { thresholdId }) },

  // ===== AI 报告 & 看板下钻 =====
  async getAIReport(opts) { return call('getAIReport', opts) },
  async listAIReports(opts) { return call('listAIReports', opts || {}) },
  async getAIReportDetail(reportId) { return call('getAIReportDetail', { reportId }) },
  async deleteAIReport(reportId) { return call('deleteAIReport', { reportId }) },
  async getAIConfig() { return call('getAIConfig', {}) },
  async setAIConfig(data) { return call('setAIConfig', data) },
  async getDashboardPartDetail(partSkuId, yearMonth) { return call('getDashboardPartDetail', { partSkuId, yearMonth }) },
  async getDashboardAssetDetail(assetId, yearMonth) { return call('getDashboardAssetDetail', { assetId, yearMonth }) },
  async getDashboardAssetAlerts(assetId, yearMonth) { return call('getDashboardAssetAlerts', { assetId, yearMonth }) },

  // ===== 工厂管理 =====
  async listFactories() { return call('getFactories', {}) },
  async createFactory(data) { return call('createFactory', data) },
  async updateFactory(factoryId, data) { return call('updateFactory', { factoryId, ...data }) },

  // ===== 库存管理 =====
  async listInventory(factoryId) { return call('listInventory', { factoryId }) },
  async inventoryInbound(data) { return call('inventoryInbound', data) },
  async listInboundLogs(factoryId, yearMonth) { return call('listInboundLogs', { factoryId, yearMonth }) },
  async listOutboundLogs(factoryId, yearMonth) { return call('listOutboundLogs', { factoryId, yearMonth }) },
  async listInventoryAlerts(factoryId) { return call('listInventoryAlerts', { factoryId }) },
  async updateInventoryThreshold(inventoryId, threshold) { return call('updateInventoryThreshold', { inventoryId, threshold }) },
  async getInventorySummary(factoryId, yearMonth) { return call('getInventorySummary', { factoryId, yearMonth }) },
  async getMonthlyCostRanking(factoryId, yearMonth) { return call('getMonthlyCostRanking', { factoryId, yearMonth }) },
  async getPartUsageCostList(factoryId, yearMonth) { return call('getPartUsageCostList', { factoryId, yearMonth }) },
  async getAssetCostDetail(factoryId, assetId, yearMonth) { return call('getAssetCostDetail', { factoryId, assetId, yearMonth }) },
  async getInventoryTrend(factoryId, months) { return call('getInventoryTrend', { factoryId, months }) },
  async getCostTrend(factoryId, months) { return call('getCostTrend', { factoryId, months }) },
}
