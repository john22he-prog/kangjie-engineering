/**
 * PC 端云端 API：使用 @cloudbase/js-sdk 直接调用云函数
 * 部署到云开发静态网站托管后使用，无需 pc-server
 * 匿名登录仅用于建立云开发连接，业务鉴权靠 pcGateway 内的 JWT 验证
 */
import cloudbase from '@cloudbase/js-sdk'
import { useAuthStore } from '@/stores/auth'

const CLOUD_ENV = import.meta.env.VITE_APP_CLOUD_ENV || 'cloud1-0g0grbwt8c230b0d'

let app = null
let signedIn = false

/** 初始化 cloudbase 并匿名登录 */
async function ensureInit() {
  if (!app) {
    app = cloudbase.init({ env: CLOUD_ENV })
  }
  if (!signedIn) {
    try {
      const auth = app.auth()
      const loginState = await auth.getLoginState()
      if (!loginState) {
        await auth.signInAnonymously()
      }
      signedIn = true
    } catch (err) {
      console.error('cloudbase 匿名登录失败:', err)
      throw err
    }
  }
  return app
}

/** 调用云函数并解析返回结果 */
async function invokeFunction(name, data) {
  try {
    const cbApp = await ensureInit()
    const res = await cbApp.callFunction({ name, data })
    const result = res.result
    if (typeof result === 'string') {
      try { return JSON.parse(result) } catch { return result }
    }
    return result
  } catch (err) {
    console.error(`云函数 ${name} 调用失败:`, err)
    return { ok: false, error: { code: 'CLOUD_ERROR', message: err.message || '云函数调用失败' } }
  }
}

/** 通过 pcGateway 调用业务接口（需 JWT token） */
async function call(action, data = {}) {
  const token = useAuthStore().token
  if (!token) return { ok: false, error: { code: 'AUTH_FAILED', message: '请先登录' } }
  return invokeFunction('pcGateway', { token, action, data })
}

function notImplemented() {
  return Promise.resolve({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: '该功能 PC 端暂未对接云开发，请使用 Mock 模式或后续版本' } })
}

export const cloudApi = {
  async adminLogin({ username, password }) {
    return invokeFunction('adminPcLogin', { username, password })
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
  deletePart: notImplemented,
  batchSetPartsActive: notImplemented,
  batchDeleteParts: notImplemented,
  async submitFacilityLog(data) { return call('submitFacilityLog', data) },
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

  async getDailyTimeline(date, factoryId) {
    return call("getDailyTimeline", { date, factoryId: factoryId || undefined })
  },

}
