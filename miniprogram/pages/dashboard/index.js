// pages/dashboard/index.js
const api = require('../../utils/api')
const { getCurrentYearMonth } = require('../../utils/util')

Page({
  data: {
    yearMonth: '',
    stats: {
      totalAlerts: 0,
      openAlerts: 0,
      topParts: [],
      topAssets: [],
      topEngineers: []
    }
  },

  onLoad() {
    this.setData({ yearMonth: getCurrentYearMonth() })
    this.loadDashboard()
  },

  onShow() {
    this.loadDashboard()
  },

  async loadDashboard() {
    try {
      const result = await api.getDashboard({ yearMonth: this.data.yearMonth })
      if (result.ok) {
        this.setData({ stats: result.data })
      }
    } catch (e) {
      console.error(e)
    }
  },

  // 点击待处理 → 跳转到报警列表（OPEN）
  onOpenAlertsTap() {
    wx.switchTab({ url: '/pages/alerts/index' })
  },

  // 点击配件 → 查看该配件在各设备上的分布
  onPartTap(e) {
    const item = e.currentTarget.dataset.item
    wx.navigateTo({
      url: `/pages/dashboard/part-detail?partSkuId=${item.partSkuId}&yearMonth=${this.data.yearMonth}&partName=${encodeURIComponent(item.name)}`
    })
  },

  // 点击设备 → 查看该设备各配件用量排行
  onAssetTap(e) {
    const item = e.currentTarget.dataset.item
    wx.navigateTo({
      url: `/pages/dashboard/asset-detail?assetId=${item.assetId}&yearMonth=${this.data.yearMonth}&assetName=${encodeURIComponent(item.name)}`
    })
  }
})
