const api = require('../../utils/api')

Page({
  data: {
    loading: true,
    loggedIn: false,
    user: null,
    overview: {},
    error: '',
    today: ''
  },

  onLoad() {
    this.setData({ today: this._formatDate(new Date()) })
    this.init()
  },

  onShow() {
    if (this.data.loggedIn && this.data.user) {
      this.loadOverview(this.data.user.factory_id)
    }
  },

  onPullDownRefresh() {
    this.refresh()
  },

  _formatDate(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const weekDay = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
    return `${y}年${m}月${d}日 星期${weekDay}`
  },

  async init() {
    this.setData({ loading: true, error: '' })
    try {
      const res = await api.checkLogin()
      if (!res || !res.isRegistered || !res.user) {
        this.setData({ loading: false, loggedIn: false })
        return
      }
      const user = res.user
      this.setData({ loggedIn: true, user })
      await this.loadOverview(user.factory_id)
    } catch (err) {
      console.error('初始化失败', err)
      this.setData({ error: err.message || '加载失败，请重试' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadOverview(factoryId) {
    try {
      const res = await api.getOverview({ factoryId })
      if (!res || !res.record) {
        this.setData({ overview: {} })
        return
      }
      const r = res.record
      this.setData({
        overview: {
          date: res.date,
          totalSteam: r.total_steam_production != null ? Number(r.total_steam_production).toFixed(1) : '--',
          totalCost: r.total_cost != null ? Number(r.total_cost).toFixed(0) : '--',
          totalElectricity: r.total_electricity != null ? Number(r.total_electricity).toFixed(0) : '--',
          steamLossRate: r.steam_loss_rate != null ? Number(r.steam_loss_rate).toFixed(1) : '--',
          costPerSteam: r.cost_per_steam != null ? Number(r.cost_per_steam).toFixed(2) : '--',
          fuelStock: r.fuel_stock_estimate != null ? Number(r.fuel_stock_estimate).toFixed(1) : '--',
          fuelStockDays: r.fuel_stock_days != null ? Number(r.fuel_stock_days).toFixed(0) : '--',
          totalWater: r.total_water != null ? Number(r.total_water).toFixed(1) : '--',
          totalFuel: r.total_fuel_consumed != null ? Number(r.total_fuel_consumed).toFixed(1) : '--'
        }
      })
    } catch (err) {
      console.error('获取概览失败', err)
      this.setData({ error: err.message || '获取数据失败' })
    }
  },

  refresh() {
    this.init().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  goToEntry() {
    wx.redirectTo({ url: '/packages/boiler/pages/entry/index' })
  },

  goToHistory() {
    wx.navigateTo({ url: '/packages/boiler/pages/history/index' })
  },

  goToAlerts() {
    wx.navigateTo({ url: '/packages/boiler/pages/alerts/index' })
  },

  goToTrend() {
    wx.navigateTo({ url: '/packages/boiler/pages/trend/index' })
  }
})
