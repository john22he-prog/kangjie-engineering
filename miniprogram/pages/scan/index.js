// pages/scan/index.js
const api = require('../../utils/api')
const offlineQueue = require('../../utils/offline-queue')

const IS_DEV = true  // 正式上线改为 false

Page({
  data: {
    lastAsset: null,
    offlineCount: 0,
    syncing: false,
    devMode: IS_DEV
  },

  onShow() {
    const app = getApp()
    this.setData({
      lastAsset: app.globalData.lastAsset,
      offlineCount: offlineQueue.getCount()
    })
  },

  // 扫码
  async onScan() {
    try {
      const res = await wx.scanCode({ onlyFromCamera: false, scanType: ['qrCode'] })
      const assetId = res.result
      if (!assetId) return

      wx.showLoading({ title: '查询设备...' })
      const result = await api.getAssetByQr(assetId)
      wx.hideLoading()

      if (!result.ok) {
        wx.showToast({ title: result.error.message || '未找到该设备', icon: 'none' })
        return
      }

      // 保存最近设备
      const app = getApp()
      app.globalData.lastAsset = result.data.asset
      this.setData({ lastAsset: result.data.asset })

      // 跳转设备详情
      wx.navigateTo({
        url: `/pages/asset/detail?assetId=${assetId}`
      })
    } catch (e) {
      wx.hideLoading()
      // 扫码取消不提示
      if (e.errMsg && e.errMsg.indexOf('cancel') > -1) return
      console.error('扫码失败', e)
    }
  },

  // 点击最近设备
  onAssetTap() {
    if (this.data.lastAsset) {
      wx.navigateTo({
        url: `/pages/asset/detail?assetId=${this.data.lastAsset.assetId}`
      })
    }
  },

  // 开发模式快捷跳转
  async onDevJump(e) {
    const assetId = e.currentTarget.dataset.id
    wx.showLoading({ title: '查询设备...' })
    const result = await api.getAssetByQr(assetId)
    wx.hideLoading()
    if (result.ok) {
      const app = getApp()
      app.globalData.lastAsset = result.data.asset
      this.setData({ lastAsset: result.data.asset })
      wx.navigateTo({ url: `/pages/asset/detail?assetId=${assetId}` })
    }
  },

  // 同步离线队列
  async onSync() {
    this.setData({ syncing: true })
    try {
      await offlineQueue.syncAll()
      this.setData({
        offlineCount: offlineQueue.getCount(),
        syncing: false
      })
      wx.showToast({ title: '同步完成', icon: 'success' })
    } catch (e) {
      this.setData({ syncing: false })
      wx.showToast({ title: '同步失败：' + (e.message || '未知错误'), icon: 'none' })
    }
  }
})
