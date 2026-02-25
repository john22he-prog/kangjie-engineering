// pages/asset/detail.js
const api = require('../../utils/api')
const auth = require('../../utils/auth')
const offlineQueue = require('../../utils/offline-queue')
const { formatDate } = require('../../utils/util')

Page({
  data: {
    asset: null,
    recentLogs: [],
    canWrite: false,
    loading: false,
    offlineCount: 0,
    syncing: false
  },

  onLoad(options) {
    this.assetId = options.assetId
    this.setData({ canWrite: auth.canWrite() })
    this.loadAsset()
  },

  onShow() {
    this.setData({ offlineCount: offlineQueue.getCount() })
    // 从表单返回后刷新
    if (this.assetId) {
      this.loadAsset()
    }
  },

  async loadAsset() {
    this.setData({ loading: true })
    try {
      const result = await api.getAssetByQr(this.assetId)
      if (result.ok) {
        const logs = (result.data.recentLogs || []).map(l => ({
          ...l,
          displayDate: formatDate(l.ts),
          totalQty: (l.items || []).reduce((s, i) => s + i.qty, 0)
        }))
        this.setData({
          asset: result.data.asset,
          recentLogs: logs,
          loading: false
        })
        // 更新全局最近设备
        getApp().globalData.lastAsset = result.data.asset
      } else {
        wx.showToast({ title: result.error.message || '设备不存在', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
    }
  },

  onReplace() {
    if (!this.data.asset || this.data.asset.status === 'inactive') {
      wx.showToast({ title: '设备已停用，无法录入', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/replace/form?assetId=${this.assetId}`
    })
  },

  onInspect() {
    const asset = this.data.asset
    if (!asset) return
    wx.navigateTo({
      url: `/pages/inspection/checkin?assetId=${asset.assetId}&assetName=${encodeURIComponent(asset.assetName)}&assetNo=${encodeURIComponent(asset.assetNo)}`
    })
  },

  onLogTap(e) {
    const log = e.currentTarget.dataset.log
    const items = (log.items || []).map(i => `${i.partNameSnapshot} x${i.qty}`).join('\n')
    wx.showModal({
      title: '记录详情',
      content: `部位：${log.locationNameSnapshot}\n配件：\n${items}\n备注：${log.remark || '无'}`,
      showCancel: false
    })
  },

  async onSync() {
    this.setData({ syncing: true })
    try {
      await offlineQueue.syncAll()
      this.setData({ offlineCount: offlineQueue.getCount(), syncing: false })
      wx.showToast({ title: '同步完成', icon: 'success' })
    } catch (e) {
      this.setData({ syncing: false })
      wx.showToast({ title: '同步失败', icon: 'none' })
    }
  }
})
