// 锅炉房 API 调用封装
function callFunction(name, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        const result = res.result
        if (result.code === 0) resolve(result.data)
        else reject(new Error(result.message || '请求失败'))
      },
      fail: (err) => reject(err)
    })
  })
}

// ======================== 登录 ========================
function checkLogin() {
  return callFunction('boiler-auth', { module: 'login', action: 'checkLogin' })
}

function getOpenId() {
  return callFunction('boiler-auth', { module: 'login', action: 'getOpenId' })
}

// ======================== 工厂 ========================
function listFactories(factoryId) {
  return callFunction('boiler-core', { module: 'factory', action: 'list', factoryId })
}

function getFactoryDetail(id) {
  return callFunction('boiler-core', { module: 'factory', action: 'detail', id })
}

// ======================== 锅炉 ========================
function listBoilers(factoryId) {
  return callFunction('boiler-core', { module: 'boiler', action: 'list', factoryId })
}

// ======================== 客户 ========================
function listCustomers(factoryId) {
  return callFunction('boiler-core', { module: 'customer', action: 'list', factoryId })
}

// ======================== 每日记录 ========================
function createRecord(data) {
  return callFunction('boiler-core', { module: 'record', action: 'create', ...data })
}

function listRecords(params) {
  return callFunction('boiler-core', { module: 'record', action: 'list', ...params })
}

function getRecordDetail(id) {
  return callFunction('boiler-core', { module: 'record', action: 'detail', id })
}

// ======================== 统计 ========================
function getOverview(params) {
  return callFunction('boiler-analysis', { module: 'statistics', action: 'overview', ...params })
}

function getTrend(params) {
  return callFunction('boiler-analysis', { module: 'statistics', action: 'trend', ...params })
}

function getCompare(params) {
  return callFunction('boiler-analysis', { module: 'statistics', action: 'compare', ...params })
}

// ======================== 预警 ========================
function listAlerts(params) {
  return callFunction('boiler-analysis', { module: 'alert', action: 'list', ...params })
}

function resolveAlert(alertId, resolveNote) {
  return callFunction('boiler-analysis', { module: 'alert', action: 'resolve', alertId, resolveNote })
}

function acknowledgeAlert(alertId) {
  return callFunction('boiler-analysis', { module: 'alert', action: 'acknowledge', alertId })
}

// ======================== 用户管理 ========================
function listUsers(params) {
  return callFunction('boiler-auth', { module: 'user', action: 'list', ...params })
}

function createUser(data) {
  return callFunction('boiler-auth', { module: 'user', action: 'create', ...data })
}

// ======================== 配置 ========================
function listPrices(params) {
  return callFunction('boiler-auth', { module: 'config', action: 'listPrices', ...params })
}

function setPrice(data) {
  return callFunction('boiler-auth', { module: 'config', action: 'setPrice', ...data })
}

function listAlertRules(params) {
  return callFunction('boiler-auth', { module: 'config', action: 'listAlertRules', ...params })
}

function setAlertRule(data) {
  return callFunction('boiler-auth', { module: 'config', action: 'setAlertRule', ...data })
}

module.exports = {
  checkLogin, getOpenId,
  listFactories, getFactoryDetail,
  listBoilers, listCustomers,
  createRecord, listRecords, getRecordDetail,
  getOverview, getTrend, getCompare,
  listAlerts, resolveAlert, acknowledgeAlert,
  listUsers, createUser,
  listPrices, setPrice, listAlertRules, setAlertRule
}
