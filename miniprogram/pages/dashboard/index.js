// pages/dashboard/index.js
const api = require('../../utils/api')
const auth = require('../../utils/auth')
const { getCurrentYearMonth } = require('../../utils/util')

Page({
  data: {
    loading: true,
    yearMonth: '',
    isCurrentMonth: true,
    canViewCost: false,
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
    },
    costRanking: {
      totalMonthlyUsageCost: 0,
      costByAsset: []
    },
    inventoryOpenCount: 0,
    inspection: { hasPlan: false },
    canSwitchFactory: false,
    currentFactoryName: '',
    factories: []
  },

  onLoad() {
    const app = getApp()
    this.setData({
      yearMonth: getCurrentYearMonth(),
      canViewCost: auth.canViewCost(),
      canSwitchFactory: auth.canSwitchFactory(),
      currentFactoryName: app.globalData.currentFactoryName || ''
    })
    this.loadAll()
  },

  onShow() {
    const app = getApp()
    this.setData({
      canViewCost: auth.canViewCost(),
      currentFactoryName: app.globalData.currentFactoryName || ''
    })
    this.loadAll()
  },

  onPullDownRefresh() {
    this.loadAll(true).then(() => wx.stopPullDownRefresh())
  },

  /**
   * 并行加载看板所需全部数据，首屏只需等最慢的一个请求
   */
  async loadAll(isRefresh) {
    if (!isRefresh) this.setData({ loading: true })
    const yearMonth = this.data.yearMonth
    const canViewCost = this.data.canViewCost

    const tasks = [
      api.getDashboard({ yearMonth }).then(result => {
        if (result.ok) {
          const data = result.data
          if (data.dailyTrend && data.dailyTrend.length > 0) {
            const maxCount = Math.max(...data.dailyTrend.map(d => d.count), 1)
            const avg = data.dailyTrend.reduce((s, d) => s + d.count, 0) / data.dailyTrend.length
            data.dailyTrend = data.dailyTrend.map(d => ({
              ...d,
              barHeight: Math.max(Math.round((d.count / maxCount) * 160), 8),
              isHigh: d.count > avg * 1.5 && d.count > 0
            }))
          }
          this.setData({ stats: data })
        }
      }),
      api.getInspectionStats().then(result => {
        if (result.ok) {
          const d = result.data
          const todayItem = (d.week || []).find(w => w.isToday)
          d.todayCompleted = todayItem ? todayItem.done : 0
          d.todayTotal = todayItem ? todayItem.total : 0
          this.setData({ inspection: d })
        }
      }),
      api.listInventoryAlerts().then(result => {
        if (result.ok) {
          const openCount = (result.data.list || []).filter(a => a.status === 'OPEN').length
          this.setData({ inventoryOpenCount: openCount })
        }
      })
    ]
    if (canViewCost) {
      tasks.push(
        api.getMonthlyCostRanking({ yearMonth }).then(result => {
          if (result.ok) {
            const data = result.data
            data.totalMonthlyUsageCostStr = this._formatMoney(data.totalMonthlyUsageCost || 0)
            if (data.costByAsset && data.costByAsset.length > 0) {
              const maxCost = data.costByAsset[0].totalCost || 1
              data.costByAsset = data.costByAsset.map(item => ({
                ...item,
                barWidth: Math.max(Math.round((item.totalCost / maxCost) * 100), 5),
                totalCostStr: this._formatMoney(item.totalCost)
              }))
            }
            this.setData({ costRanking: data })
          }
        })
      )
    }
    if (auth.canSwitchFactory()) {
      tasks.push(
        api.getFactories().then(result => {
          if (result.ok) this.setData({ factories: result.data.factories || [] })
        })
      )
    }

    try {
      await Promise.all(tasks)
    } catch (e) {
      console.error(e)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadDashboard() {
    try {
      const result = await api.getDashboard({ yearMonth: this.data.yearMonth })
      if (result.ok) {
        const data = result.data
        if (data.dailyTrend && data.dailyTrend.length > 0) {
          const maxCount = Math.max(...data.dailyTrend.map(d => d.count), 1)
          const avg = data.dailyTrend.reduce((s, d) => s + d.count, 0) / data.dailyTrend.length
          data.dailyTrend = data.dailyTrend.map(d => ({
            ...d,
            barHeight: Math.max(Math.round((d.count / maxCount) * 160), 8),
            isHigh: d.count > avg * 1.5 && d.count > 0
          }))
        }
        this.setData({ stats: data })
      }
      if (this.data.canViewCost) this.loadCostRanking()
      this.loadInventoryAlertCount()
    } catch (e) {
      console.error(e)
    }
  },

  async loadCostRanking() {
    try {
      const result = await api.getMonthlyCostRanking({ yearMonth: this.data.yearMonth })
      if (result.ok) {
        const data = result.data
        // 格式化总金额（兼容模拟器不支持 toLocaleString）
        data.totalMonthlyUsageCostStr = this._formatMoney(data.totalMonthlyUsageCost || 0)
        // 计算柱状图宽度比例
        if (data.costByAsset && data.costByAsset.length > 0) {
          const maxCost = data.costByAsset[0].totalCost || 1
          data.costByAsset = data.costByAsset.map(item => ({
            ...item,
            barWidth: Math.max(Math.round((item.totalCost / maxCost) * 100), 5),
            totalCostStr: this._formatMoney(item.totalCost)
          }))
        }
        this.setData({ costRanking: data })
      }
    } catch (e) {
      console.error('loadCostRanking error:', e)
    }
  },

  // 金额格式化（兼容模拟器）
  _formatMoney(num) {
    if (!num && num !== 0) return '0'
    return Number(num).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  },

  // ========== 月份切换 ==========
  onPrevMonth() {
    const ym = this._shiftMonth(this.data.yearMonth, -1)
    this.setData({
      yearMonth: ym,
      isCurrentMonth: ym === getCurrentYearMonth()
    })
    this.loadAll(true)
  },

  onNextMonth() {
    if (this.data.isCurrentMonth) return
    const ym = this._shiftMonth(this.data.yearMonth, 1)
    this.setData({
      yearMonth: ym,
      isCurrentMonth: ym === getCurrentYearMonth()
    })
    this.loadAll(true)
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

  // ========== 低库存报警数量 ==========
  async loadInventoryAlertCount() {
    try {
      const result = await api.listInventoryAlerts()
      if (result.ok) {
        const openCount = (result.data.list || []).filter(a => a.status === 'OPEN').length
        this.setData({ inventoryOpenCount: openCount })
      }
    } catch (e) {
      console.error('loadInventoryAlertCount error:', e)
    }
  },

  // ========== 报警联动（低库存） ==========
  onInventoryAlertsTap() {
    const app = getApp()
    app.globalData = app.globalData || {}
    app.globalData.alertFilterType = 'inventory'
    app.globalData.alertFilterStatus = 'OPEN'
    wx.switchTab({ url: '/pages/alerts/index' })
  },

  // ========== 配件使用金额 → 设备配件金额明细 ==========
  onCostAssetTap(e) {
    const item = e.currentTarget.dataset.item
    wx.navigateTo({
      url: `/pages/dashboard/asset-cost-detail?assetId=${item.assetId}&yearMonth=${this.data.yearMonth}&assetName=${encodeURIComponent(item.assetName)}`
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

  // ========== 巡检统计 ==========
  async loadInspection() {
    try {
      const result = await api.getInspectionStats()
      if (result.ok) {
        const d = result.data
        const todayItem = (d.week || []).find(w => w.isToday)
        d.todayCompleted = todayItem ? todayItem.done : 0
        d.todayTotal = todayItem ? todayItem.total : 0
        this.setData({ inspection: d })
      }
    } catch (e) {
      console.error('loadInspection error:', e)
    }
  },

  onInspectionTap() {
    wx.navigateTo({ url: '/pages/inspection/index' })
  },

  // ========== 工厂切换 ==========
  async loadFactories() {
    try {
      const result = await api.getFactories()
      if (result.ok) {
        this.setData({ factories: result.data.factories || [] })
      }
    } catch (e) {}
  },

  onSwitchFactory() {
    const factories = this.data.factories
    if (!factories.length) return
    const itemList = ['全部工厂（汇总）', ...factories.map(f => f.factoryName)]
    wx.showActionSheet({
      itemList,
      success: (res) => {
        const app = getApp()
        if (res.tapIndex === 0) {
          app.setCurrentFactory(null, '全部工厂')
          this.setData({ currentFactoryName: '全部工厂' })
        } else {
          const selected = factories[res.tapIndex - 1]
          app.setCurrentFactory(selected.factoryId, selected.factoryName)
          this.setData({ currentFactoryName: selected.factoryName })
        }
        this.loadAll(true)
        wx.showToast({ title: '已切换', icon: 'none' })
      }
    })
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
