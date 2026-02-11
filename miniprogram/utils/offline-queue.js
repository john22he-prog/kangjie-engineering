// utils/offline-queue.js — 离线队列管理
const { OFFLINE_QUEUE_KEY } = require('./constants')

/**
 * 获取队列
 */
function getQueue() {
  try {
    return wx.getStorageSync(OFFLINE_QUEUE_KEY) || []
  } catch (e) {
    return []
  }
}

/**
 * 保存队列
 */
function saveQueue(queue) {
  try {
    wx.setStorageSync(OFFLINE_QUEUE_KEY, queue)
  } catch (e) {
    console.error('保存离线队列失败', e)
  }
}

/**
 * 获取未同步条数
 */
function getCount() {
  return getQueue().length
}

/**
 * 入队（提交前调用）
 * @param {Object} record 提交数据（必须包含 clientOfflineId）
 */
function enqueue(record) {
  if (!record.clientOfflineId) {
    console.error('离线队列：缺少 clientOfflineId')
    return
  }
  const queue = getQueue()
  // 幂等：已存在则不重复入队
  const exists = queue.find(q => q.clientOfflineId === record.clientOfflineId)
  if (exists) return

  record._enqueueTs = Date.now()
  queue.push(record)
  saveQueue(queue)
}

/**
 * 按 clientOfflineId 移除（提交成功后调用）
 */
function removeByClientOfflineId(clientOfflineId) {
  let queue = getQueue()
  queue = queue.filter(q => q.clientOfflineId !== clientOfflineId)
  saveQueue(queue)
}

/**
 * 同步全部队列
 * 逐条调用 submitReplacementLog，成功移除，失败保留
 */
async function syncAll() {
  // 延迟加载避免循环依赖
  const api = require('./api')
  const queue = getQueue()
  if (queue.length === 0) return

  let failCount = 0
  for (const record of queue) {
    try {
      const payload = { ...record }
      delete payload._status
      delete payload._enqueueTs
      const result = await api.submitReplacementLog(payload)
      if (result.ok) {
        removeByClientOfflineId(record.clientOfflineId)
      } else {
        failCount++
      }
    } catch (e) {
      failCount++
      console.error('同步单条失败', record.clientOfflineId, e)
    }
  }
  if (failCount > 0) {
    throw new Error(`${failCount} 条同步失败`)
  }
}

module.exports = {
  getQueue,
  getCount,
  enqueue,
  removeByClientOfflineId,
  syncAll
}
