// pages/dashboard/index.js
const api = require('../../utils/api')
const { getCurrentYearMonth } = require('../../utils/util')

Page({
  data: {
    yearMonth: '',
    isCurrentMonth: true,
    stats: {
      totalLogs: 0,
      totalPartsQty: 0,
      totalAlerts: 0,
      openAlerts: 0,
      topParts: [],
      topAssets: [],
      topEngineers: [],
      dailyTrend: [],
      alertsByAsset: []
    }
  },

  onLoad() {
    this.setData({ yearMonth: getCurrentYearMonth() })
    this.loadDashboard()
  },

  onShow() {
    this.loadDashboard()
  },

  onPullDownRefresh() {
    this.loadDashboard().then(() => wx.stopPullDownRefresh())
  },

  async loadDashboard() {
    try {
      const result = await api.getDashboard({ yearMonth: this.data.yearMonth })
      if (result.ok) {
        const data = result.data
        // 处理趋势图高度
        if (data.dailyTrend && data.dailyTrend.length > 0) {
          const maxCount = Math.max(...data.dailyTrend.map(d => d.count), 1)
          const avg = data.dailyTrend.reduce((s, d) => s + d.count, 0) / data.dailyTrend.length
          data.dailyTrend = data.dailyTrend.map(d => ({
            ...d,
            barHeight: Math.max(Math.round((d.count / maxCount) * 160), 8),
            isHigh: d.count > avg * 1.5 && d.count > 0  // 超过平均值1.5倍标红
          }))
        }
        this.setData({ stats: data })
      }
    } catch (e) {
      console.error(e)
    }
  },

  // ========== 月份切换 ==========
  onPrevMonth() {
    const ym = this._shiftMonth(this.data.yearMonth, -1)
    this.setData({
      yearMonth: ym,
      isCurrentMonth: ym === getCurrentYearMonth()
    })
    this.loadDashboard()
  },

  onNextMonth() {
    if (this.data.isCurrentMonth) return
    const ym = this._shiftMonth(this.data.yearMonth, 1)
    this.setData({
      yearMonth: ym,
      isCurrentMonth: ym === getCurrentYearMonth()
    })
    this.loadDashboard()
  },

  _shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number)
    let newY = y
    let newM = m + delta
    if (newM > 12) { newM = 1; newY++ }
    if (newM < 1) { newM = 12; newY-- }
    return `${newY}-${String(newM).padStart(2, '0')}`
  },

  // ========== 报警联动 ==========
  onOpenAlertsTap() {
    const app = getApp()
    app.globalData = app.globalData || {}
    app.globalData.alertFilterStatus = 'OPEN'
    wx.switchTab({ url: '/pages/alerts/index' })
  },

  onAckAlertsTap() {
    const app = getApp()
    app.globalData = app.globalData || {}
    app.globalData.alertFilterStatus = 'ACK'
    wx.switchTab({ url: '/pages/alerts/index' })
  },

  // M6 报警设备分布 → 设备报警明细
  onAlertAssetTap(e) {
    const item = e.currentTarget.dataset.item
    wx.navigateTo({
      url: `/pages/dashboard/asset-alerts?assetId=${item.assetId}&yearMonth=${this.data.yearMonth}&assetName=${encodeURIComponent(item.assetName)}`
    })
  },

  // ========== 排行榜联动 ==========
  onPartTap(e) {
    const item = e.currentTarget.dataset.item
    wx.navigateTo({
      url: `/pages/dashboard/part-detail?partSkuId=${item.partSkuId}&yearMonth=${this.data.yearMonth}&partName=${encodeURIComponent(item.name)}`
    })
  },

  onAssetTap(e) {
    const item = e.currentTarget.dataset.item
    wx.navigateTo({
      url: `/pages/dashboard/asset-detail?assetId=${item.assetId}&yearMonth=${this.data.yearMonth}&assetName=${encodeURIComponent(item.name)}`
    })
  },

  onEngineerTap(e) {
    const item = e.currentTarget.dataset.item
    const app = getApp()
    app.globalData = app.globalData || {}
    app.globalData.recordFilterUser = {
      userId: item.userId,
      userName: item.name,
      yearMonth: this.data.yearMonth
    }
    wx.switchTab({ url: '/pages/record/index' })
  },

  // M5 点击某天 → 跳转记录页查看当天
  onTrendDayTap(e) {
    const item = e.currentTarget.dataset.item
    if (item.count === 0) return
    const app = getApp()
    app.globalData = app.globalData || {}
    app.globalData.recordFilterDate = item.date
    wx.switchTab({ url: '/pages/record/index' })
  }
})
