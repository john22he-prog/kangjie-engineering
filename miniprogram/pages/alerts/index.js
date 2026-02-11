// pages/alerts/index.js
const api = require('../../utils/api')
const { getCurrentYearMonth } = require('../../utils/util')

Page({
  data: {
    tabStatus: 'OPEN',
    yearMonth: '',
    list: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true
  },

  onLoad() {
    this.setData({ yearMonth: getCurrentYearMonth() })
    this.loadList(true)
  },

  onShow() {
    // 检查是否从看板跳转过来，带有筛选状态
    const app = getApp()
    if (app.globalData && app.globalData.alertFilterStatus) {
      const status = app.globalData.alertFilterStatus
      app.globalData.alertFilterStatus = null  // 用完即清
      if (status !== this.data.tabStatus) {
        this.setData({ tabStatus: status })
      }
    }
    this.loadList(true)
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh())
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab !== this.data.tabStatus) {
      this.setData({ tabStatus: tab })
      this.loadList(true)
    }
  },

  onMonthChange(e) {
    this.setData({ yearMonth: e.detail.value })
    this.loadList(true)
  },

  async loadList(reset) {
    if (reset) {
      this.setData({ page: 1, hasMore: true, list: [] })
    }
    this.setData({ loading: true })
    try {
      const result = await api.listAlerts({
        status: this.data.tabStatus,
        yearMonth: this.data.yearMonth,
        page: this.data.page,
        pageSize: this.data.pageSize
      })
      if (result.ok) {
        const newList = result.data.list || []
        this.setData({
          list: reset ? newList : this.data.list.concat(newList),
          page: this.data.page + 1,
          hasMore: newList.length >= this.data.pageSize,
          loading: false
        })
      }
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
    }
  },

  onAlertTap(e) {
    const alert = e.currentTarget.dataset.alert
    wx.navigateTo({
      url: `/pages/alerts/detail?alertId=${alert.alertId}`
    })
  }
})
