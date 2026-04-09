// pages/company/index.js
const api = require('../../utils/api')
const auth = require('../../utils/auth')
const { PERMISSIONS } = require('../../utils/permissions')
const { getCurrentYearMonth } = require('../../utils/util')

Page({
  data: {
    loading: true,
    yearMonth: '',
    userInfo: {},
    factories: [],
    currentFactoryId: null,
    currentFactoryName: '全部工厂',
    engStatus: 'normal',
    engStatusText: '运行正常',
    stats: {
      totalLogs: 0,
      totalPartsQty: 0,
      totalAlerts: 0,
      openAlerts: 0
    }
  },

  async onLoad() {
    this.setData({ yearMonth: getCurrentYearMonth() })

    const app = getApp()
    const loggedIn = await app.waitForLogin()

    if (!loggedIn) {
      return
    }

    const canViewCompany = auth.hasPermission(PERMISSIONS.MODULE_COMPANY)

    if (!canViewCompany) {
      wx.switchTab({ url: '/pages/scan/index' })
      return
    }

    // 恢复上次选择的工厂
    const saved = app.globalData.currentFactoryId
    if (saved) {
      this.setData({
        currentFactoryId: saved,
        currentFactoryName: app.globalData.currentFactoryName || '全部工厂'
      })
    }

    this.setData({
      loading: false,
      userInfo: auth.getUser()
    })
    this.loadFactories()
    this.loadData()
  },

  async onShow() {
    if (!this.data.loading && auth.isLoggedIn()) {
      this.loadData()
    }
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  async loadFactories() {
    try {
      const result = await api.getFactories()
      if (result.ok) {
        const app = getApp()
        app.globalData.factories = result.data.factories
        this.setData({ factories: result.data.factories || [] })
      }
    } catch (e) {
      console.error('loadFactories error', e)
    }
  },

  onSwitchFactory() {
    const factories = this.data.factories
    if (!factories.length) {
      wx.showToast({ title: '暂无工厂数据', icon: 'none' })
      return
    }

    const items = ['全部工厂（汇总）', ...factories.map(f => f.factoryName)]

    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const app = getApp()
        if (res.tapIndex === 0) {
          this.setData({ currentFactoryId: null, currentFactoryName: '全部工厂' })
          app.setCurrentFactory(null, '全部工厂')
        } else {
          const selected = factories[res.tapIndex - 1]
          this.setData({
            currentFactoryId: selected.factoryId,
            currentFactoryName: selected.factoryName
          })
          app.setCurrentFactory(selected.factoryId, selected.factoryName)
        }
        this.loadData()
      }
    })
  },

  async loadData() {
    try {
      const params = { yearMonth: this.data.yearMonth }
      if (this.data.currentFactoryId) {
        params.factoryId = this.data.currentFactoryId
      }
      const result = await api.getDashboard(params)
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
  },

  onGoBoiler() {
    wx.navigateTo({ url: '/packages/boiler/pages/home/index' })
  },

  onGoBusiness() {
    wx.navigateTo({ url: '/packages/business/pages/map/index' })
  }
})
