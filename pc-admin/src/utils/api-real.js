/**
 * PC 端真实 API：请求网关（pc-server），与云开发数据同步
 * 开发模式：vite proxy 自动将 /api 转发到 http://localhost:3001
 * 生产模式：通过 VITE_APP_API_BASE 配置网关地址
 */
import { useAuthStore } from '@/stores/auth'

function getBase() {
  return (import.meta.env.VITE_APP_API_BASE || '').replace(/\/$/, '')
}

async function request(path, body) {
  const base = getBase()
  try {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return data
  } catch (err) {
    return { ok: false, error: { code: 'NETWORK', message: err.message || '网络请求失败，请确认 pc-server 已启动' } }
  }
}

async function call(action, data = {}) {
  const token = useAuthStore().token
  if (!token) return { ok: false, error: { code: 'AUTH_FAILED', message: '请先登录' } }
  return request('/api/call', { token, action, data })
}

function notImplemented() {
  return Promise.resolve({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: '该功能 PC 端暂未对接云开发，请使用 Mock 模式或后续版本' } })
}

export const realApi = {
  async adminLogin({ username, password }) {
    return request('/api/login', { username, password })
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
    const { yearMonth, factoryId, workshop } = typeof opts === 'object' ? opts : { yearMonth: opts, factoryId: null, workshop: null }
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
