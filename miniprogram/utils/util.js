// utils/util.js — 通用工具函数

/**
 * 生成 UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * 格式化时间戳为日期字符串
 * @param {number} ts 毫秒时间戳
 * @param {string} fmt 格式 'YYYY-MM-DD' | 'YYYY-MM-DD HH:mm'
 */
function formatDate(ts, fmt = 'YYYY-MM-DD') {
  if (!ts) return '--'
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  const map = {
    'YYYY': d.getFullYear(),
    'MM': pad(d.getMonth() + 1),
    'DD': pad(d.getDate()),
    'HH': pad(d.getHours()),
    'mm': pad(d.getMinutes()),
    'ss': pad(d.getSeconds())
  }
  let result = fmt
  for (const [k, v] of Object.entries(map)) {
    result = result.replace(k, v)
  }
  return result
}

/**
 * 获取当前自然月 YYYY-MM
 */
function getCurrentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 从时间戳获取 yearMonth
 */
function getYearMonth(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

module.exports = {
  generateUUID,
  formatDate,
  getCurrentYearMonth,
  getYearMonth
}
