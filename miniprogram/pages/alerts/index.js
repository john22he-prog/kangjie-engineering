// pages/alerts/index.js
const api = require('../../utils/api')
const { getCurrentYearMonth } = require('../../utils/util')

Page({
  data: {
    alertType: 'threshold',  // 'threshold' | 'inventory'
    tabStatus: 'OPEN',
    yearMonth: '',
    list: [],
    inventoryList: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    thresholdOpenCount: 0,
    inventoryOpenCount: 0
  },

  onLoad() {
    this.setData({ yearMonth: getCurrentYearMonth() })
    this.loadList(true)
    this.loadInventoryAlerts()
  },

  onShow() {
    // 检查是否从看板跳转过来，带有筛选状态
    const app = getApp()
    if (app.globalData && app.globalData.alertFilterStatus) {
      const status = app.globalData.alertFilterStatus
      app.globalData.alertFilterStatus = null
      if (status !== this.data.tabStatus) {
        this.setData({ tabStatus: status })
      }
    }
    // 检查是否从看板跳转到库存报警
    if (app.globalData && app.globalData.alertFilterType) {
      const type = app.globalData.alertFilterType
      app.globalData.alertFilterType = null
      if (type !== this.data.alertType) {
        this.setData({ alertType: type })
      }
    }
    this.loadList(true)
    this.loadInventoryAlerts()
  },

  onPullDownRefresh() {
    Promise.all([
      this.loadList(true),
      this.loadInventoryAlerts()
    ]).then(() => wx.stopPullDownRefresh())
  },

  // 切换报警类型
  switchType(e) {
    const type = e.currentTarget.dataset.type
    if (type !== this.data.alertType) {
      this.setData({ alertType: type, tabStatus: 'OPEN' })
      if (type === 'threshold') {
        this.loadList(true)
      } else {
        this.loadInventoryAlerts()
      }
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab !== this.data.tabStatus) {
      this.setData({ tabStatus: tab })
      if (this.data.alertType === 'threshold') {
        this.loadList(true)
      } else {
        this.loadInventoryAlerts()
      }
    }
  },

  onMonthChange(e) {
    this.setData({ yearMonth: e.detail.value })
    this.loadList(true)
    this.loadInventoryAlerts()
  },

  // 加载超阈值报警
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
        // 计算 OPEN 数量
        if (reset && this.data.tabStatus === 'OPEN') {
          this.setData({ thresholdOpenCount: result.data.total || newList.length })
        }
      }
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
    }
  },

  // 加载低库存报警
  async loadInventoryAlerts() {
    try {
      const result = await api.listInventoryAlerts()
      if (result.ok) {
        let allAlerts = result.data.list || []
        // 按状态过滤
        const filtered = allAlerts.filter(a => a.status === this.data.tabStatus)
        const openCount = allAlerts.filter(a => a.status === 'OPEN').length
        this.setData({
          inventoryList: filtered,
          inventoryOpenCount: openCount
        })
      }
    } catch (e) {
      console.error('loadInventoryAlerts error:', e)
    }
  },

  onAlertTap(e) {
    const alert = e.currentTarget.dataset.alert
    wx.navigateTo({
      url: `/pages/alerts/detail?alertId=${alert.alertId}`
    })
  },

  onInventoryAlertTap(e) {
    const alert = e.currentTarget.dataset.alert
    wx.showModal({
      title: '低库存预警',
      content: `配件「${alert.partNameSnapshot}」当前库存 ${alert.currentQty}，低于阈值 ${alert.threshold}，请及时补充库存。`,
      showCancel: false
    })
  }
})
