// utils/api.js — 统一 API 调用入口（mock / 云函数切换）
const mockApi = require('./mock')

// ========== 开关：true=使用mock数据，false=调用云函数（正式上线为 false） ==========
const USE_MOCK = false

// 云函数通用调用封装
function callCloud(name, data) {
  return wx.cloud.callFunction({ name, data }).then(res => res.result)
}

// ======================== API ========================

/**
 * 获取当前用户信息
 */
function getMe() {
  if (USE_MOCK) return mockApi.getMe()
  return callCloud('getMe', {})
}

/**
 * 扫码获取设备详情
 * @param {string} assetId
 */
function getAssetByQr(assetId) {
  if (USE_MOCK) return mockApi.getAssetByQr(assetId)
  return callCloud('getAssetByQr', { assetId })
}

/**
 * 获取部位与配件映射
 * @param {string} assetId
 */
function getLocationsAndParts(assetId) {
  if (USE_MOCK) return mockApi.getLocationsAndParts(assetId)
  return callCloud('getLocationsAndParts', { assetId })
}

/**
 * 提交更换记录
 * @param {Object} payload
 */
function submitReplacementLog(payload) {
  if (USE_MOCK) return mockApi.submitReplacementLog(payload)
  return callCloud('submitReplacementLog', payload)
}

/**
 * 查询更换记录列表
 * @param {Object} params { yearMonth, assetId?, userId?, page, pageSize }
 */
function listReplacementLogs(params) {
  if (USE_MOCK) return mockApi.listReplacementLogs(params)
  return callCloud('listReplacementLogs', params)
}

/**
 * 查询报警列表
 * @param {Object} params { status?, yearMonth?, assetId?, page, pageSize }
 */
function listAlerts(params) {
  if (USE_MOCK) return mockApi.listAlerts(params)
  return callCloud('listAlerts', params)
}

/**
 * 获取报警详情
 * @param {string} alertId
 */
function getAlertDetail(alertId) {
  if (USE_MOCK) return mockApi.getAlertDetail(alertId)
  return callCloud('getAlertDetail', { alertId })
}

/**
 * 确认报警（ACK）
 * @param {Object} params { alertId, ackNote }
 */
function ackAlert(params) {
  if (USE_MOCK) return mockApi.ackAlert(params)
  return callCloud('ackAlert', params)
}

/**
 * 看板数据
 * @param {Object} params { yearMonth }
 */
function getDashboard(params) {
  if (USE_MOCK) return mockApi.getDashboard(params)
  return callCloud('getDashboard', params)
}

/**
 * 配件用量详情（按设备分布）
 * @param {Object} params { partSkuId, yearMonth }
 */
function getPartUsageDetail(params) {
  if (USE_MOCK) return mockApi.getPartUsageDetail(params)
  return callCloud('getPartUsageDetail', params)
}

/**
 * 设备用量详情（按配件排行）
 * @param {Object} params { assetId, yearMonth }
 */
function getAssetUsageDetail(params) {
  if (USE_MOCK) return mockApi.getAssetUsageDetail(params)
  return callCloud('getAssetUsageDetail', params)
}

/**
 * 导出数据为 Excel
 * @param {Object} params { exportMode: 'month'|'year', yearMonth?, year? }
 */
function exportData(params) {
  if (USE_MOCK) return mockApi.exportData(params)
  return callCloud('exportData', params)
}

/**
 * 导入数据（Excel/CSV），去重后只写入新记录
 * @param {Object} params { fileID, importType: 'parts'|'thresholds'|'logs' }
 */
function importData(params) {
  if (USE_MOCK) return mockApi.importData(params)
  return callCloud('importData', params)
}

/**
 * 设备报警明细下钻
 * @param {Object} params { assetId, yearMonth }
 */
function getAssetAlerts(params) {
  if (USE_MOCK) return mockApi.getAssetAlerts(params)
  return callCloud('getAssetAlerts', params)
}

/**
 * 获取设备列表
 */
function listAssets() {
  if (USE_MOCK) return mockApi.listAssets()
  return callCloud('listAssets', {})
}

/**
 * 获取设备配件金额明细（下钻）
 * @param {Object} params { assetId, yearMonth }
 */
function getAssetCostDetail(params) {
  if (USE_MOCK) return mockApi.getAssetCostDetail(params)
  return callCloud('adminDashboard', { action: 'assetCostDetail', data: params })
}

/**
 * 获取当月配件使用金额排名
 * @param {Object} params { yearMonth, factoryId }
 */
function getMonthlyCostRanking(params) {
  if (USE_MOCK) return mockApi.getMonthlyCostRanking(params)
  return callCloud('adminDashboard', { action: 'monthlyCostRanking', data: params })
}

/**
 * 获取低库存报警列表
 */
function listInventoryAlerts() {
  if (USE_MOCK) return mockApi.listInventoryAlerts()
  return callCloud('adminInventoryManage', { action: 'listInventoryAlerts' })
}

/**
 * 获取当前用户可访问的工厂列表
 */
function getFactories() {
  if (USE_MOCK) return mockApi.getFactories()
  return callCloud('getFactories', {})
}

/**
 * AI 分析报告（规则+模板）
 * @param {Object} params { yearMonth, workshop?, scope: 'workshop'|'summary' }
 */
function getAIReport(params) {
  if (USE_MOCK) return mockApi.getAIReport(params)
  return callCloud('adminDashboard', { action: 'getAIReport', data: params })
}

module.exports = {
  getMe,
  getAssetByQr,
  getLocationsAndParts,
  submitReplacementLog,
  listReplacementLogs,
  listAlerts,
  getAlertDetail,
  ackAlert,
  getDashboard,
  getPartUsageDetail,
  getAssetUsageDetail,
  exportData,
  importData,
  getAssetAlerts,
  listAssets,
  getAssetCostDetail,
  getMonthlyCostRanking,
  listInventoryAlerts,
  getFactories,
  getAIReport
}
