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

  async listParts() {
    return call('listParts', {})
  },

  async listThresholds(assetId) {
    return call('listThresholds', { assetId: assetId || undefined })
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

  createUser: notImplemented,
  updateUser: notImplemented,
  disableUser: notImplemented,
  bindOpenid: notImplemented,
  unbindOpenid: notImplemented,
  getAIConfig: notImplemented,
  setAIConfig: notImplemented,
  createAsset: notImplemented,
  updateAsset: notImplemented,
  setAssetStatus: notImplemented,
  upsertLocation: notImplemented,
  deleteLocation: notImplemented,
  copyLocations: notImplemented,
  upsertLocationPartMap: notImplemented,
  deleteLocationPartMap: notImplemented,
  createPart: notImplemented,
  updatePart: notImplemented,
  importPartsPreview: notImplemented,
  importPartsCommit: notImplemented,
  batchUpsertThresholds: notImplemented,
  deleteThreshold: notImplemented,
  getAIReport: notImplemented,
  getDashboardPartDetail: notImplemented,
  getDashboardAssetDetail: notImplemented,
  getDashboardAssetAlerts: notImplemented,
  listFactories: notImplemented,
  createFactory: notImplemented,
  updateFactory: notImplemented,
  listInventory: notImplemented,
  inventoryInbound: notImplemented,
  listInboundLogs: notImplemented,
  listOutboundLogs: notImplemented,
  listInventoryAlerts: notImplemented,
  updateInventoryThreshold: notImplemented,
  getInventorySummary: notImplemented,
  getMonthlyCostRanking: notImplemented,
  getPartUsageCostList: notImplemented,
  getAssetCostDetail: notImplemented,
  getInventoryTrend: notImplemented,
  getCostTrend: notImplemented,
}
