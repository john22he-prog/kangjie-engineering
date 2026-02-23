// pages/company/index.js
const api = require('../../utils/api')
const { getCurrentYearMonth } = require('../../utils/util')

Page({
  data: {
    yearMonth: '',
    engStatus: 'normal',
    engStatusText: '运行正常',
    stats: {
      totalLogs: 0,
      totalPartsQty: 0,
      totalAlerts: 0,
      openAlerts: 0
    }
  },

  onLoad() {
    this.setData({ yearMonth: getCurrentYearMonth() })
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    try {
      const result = await api.getDashboard({ yearMonth: this.data.yearMonth })
      if (result.ok) {
        const d = result.data
        const openAlerts = d.openAlerts || 0
        this.setData({
          stats: {
            totalLogs: d.totalLogs || 0,
            totalPartsQty: d.totalPartsQty || 0,
            totalAlerts: d.totalAlerts || 0,
            openAlerts
          },
          engStatus: openAlerts > 0 ? 'warn' : 'normal',
          engStatusText: openAlerts > 0 ? `${openAlerts} 条报警待处理` : '运行正常'
        })
      }
    } catch (e) {
      console.error('loadData error', e)
      wx.showToast({ title: '数据加载失败', icon: 'none' })
    }
  },

  onGoEngineering() {
    wx.switchTab({ url: '/pages/dashboard/index' })
  }
})
