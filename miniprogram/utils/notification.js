// utils/notification.js — 订阅消息授权管理
const auth = require('./auth')

const TMPL_IDS = {
  REPLACEMENT:     'B20NDBx_LwjWVbTLTXI0J4YMT9m6B1wa3XBllHc9Dts',
  INSPECTION:      '5uUWq_iIWyrMYXoY8W7bQ120Uc5ns2nFxrkhOaRTl0k',
  THRESHOLD_ALERT: '2MWKeleoiWrX-HOftZ0V7QwRIynlsDDkJQF5vbYaMeM',
  LOW_INVENTORY:   'isCQiLS5ms-Vrbi5OlVbFjJsNTDRFYDJjgb8Tvz0z2g',
  BOILER_DAILY:    '7AMlN_cyGnOGXwwthRhEVkW7UR8qHqAqkNrEOdLZuk4',
}

// 管理人员需要订阅的模板（Supervisor/Management/Admin）
const MANAGER_TEMPLATES = [
  TMPL_IDS.REPLACEMENT,
  TMPL_IDS.INSPECTION,
  TMPL_IDS.THRESHOLD_ALERT,
  TMPL_IDS.LOW_INVENTORY,
]

// 锅炉房管理人员额外需要的模板
const BOILER_TEMPLATES = [
  TMPL_IDS.BOILER_DAILY,
]

/**
 * 请求订阅消息授权
 * 根据用户角色自动选择需要订阅的模板（最多 3 个/次）
 * @param {string[]} [specificIds] 指定模板ID数组，不传则根据角色自动选择
 * @returns {Promise<Object>} 授权结果
 */
function requestSubscribe(specificIds) {
  const tmplIds = specificIds || getTemplatesForCurrentUser()
  if (tmplIds.length === 0) return Promise.resolve({})

  // 微信限制每次最多请求 3 个模板
  const batch = tmplIds.slice(0, 3)

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: batch,
      success: (res) => resolve(res),
      fail: (err) => {
        console.warn('订阅消息授权失败:', err)
        resolve({})
      }
    })
  })
}

/**
 * 根据当前用户角色获取需要订阅的模板列表
 */
function getTemplatesForCurrentUser() {
  const user = auth.getUser()
  if (!user || !user.role) return []

  const role = user.role
  const templates = []

  if (['Supervisor', 'Management', 'Admin'].includes(role)) {
    templates.push(...MANAGER_TEMPLATES)
  }

  // Management/Admin 有锅炉房权限的也需要订阅日报
  if (['Management', 'Admin'].includes(role)) {
    templates.push(...BOILER_TEMPLATES)
  }

  return templates
}

/**
 * 提交数据前请求订阅授权（静默模式）
 * 如果用户之前勾选了"总是保持以上选择，不再询问"，此调用完全无感。
 * 否则会弹窗让用户授权（首次需要手动勾选一次）。
 * @param {string[]} tmplIds 需要订阅的模板ID数组
 * @returns {Promise<Object>} 授权结果
 */
function preSubscribe(tmplIds) {
  if (!tmplIds || tmplIds.length === 0) return Promise.resolve({})

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: tmplIds.slice(0, 3),
      success: (res) => resolve(res),
      fail: () => resolve({}),
    })
  })
}

/**
 * 配件更换提交前获取推送额度
 * 用户勾选"总是允许"后，后续调用完全静默无弹窗
 */
function preSubscribeForReplacement() {
  return preSubscribe([
    TMPL_IDS.REPLACEMENT,
    TMPL_IDS.THRESHOLD_ALERT,
    TMPL_IDS.LOW_INVENTORY,
  ])
}

/**
 * 巡检打卡提交前获取推送额度
 */
function preSubscribeForInspection() {
  return preSubscribe([TMPL_IDS.INSPECTION])
}

/**
 * 锅炉房日报提交前获取推送额度
 */
function preSubscribeForBoilerDaily() {
  return preSubscribe([TMPL_IDS.BOILER_DAILY])
}

module.exports = {
  TMPL_IDS,
  requestSubscribe,
  getTemplatesForCurrentUser,
  preSubscribe,
  preSubscribeForReplacement,
  preSubscribeForInspection,
  preSubscribeForBoilerDaily,
}
