// pages/me/index.js
const auth = require('../../utils/auth')
const api = require('../../utils/api')
const offlineQueue = require('../../utils/offline-queue')

Page({
  data: {
    userInfo: {},
    offlineCount: 0,
    syncing: false,
    canManage: false,
    canViewCompany: false,
    canSwitchFactory: false,
    currentFactoryName: '',
    factories: [],
    isLoggedIn: false
  },

  async onShow() {
    const app = getApp()

    // 等待登录完成
    await app.waitForLogin()

    const user = auth.getUser()
    this.setData({
      userInfo: user,
      isLoggedIn: auth.isLoggedIn(),
      offlineCount: offlineQueue.getCount(),
      canManage: auth.canManage(),
      canViewCompany: auth.isAdmin() || auth.isManagement(),
      canSwitchFactory: auth.canSwitchFactory(),
      currentFactoryName: app.globalData.currentFactoryName || '未选择'
    })

    // Load factories if user can switch
    if (auth.canSwitchFactory()) {
      this.loadFactories()
    }
  },

  async loadFactories() {
    try {
      const result = await api.getFactories()
      if (result.ok) {
        const app = getApp()
        app.globalData.factories = result.data.factories
        this.setData({ factories: result.data.factories })
        if (!app.globalData.currentFactoryId && result.data.factories.length > 0) {
          const defaultFactory = result.data.factories.find(f => f.factoryId === result.data.userFactoryId) || result.data.factories[0]
          app.setCurrentFactory(defaultFactory.factoryId, defaultFactory.factoryName)
          this.setData({ currentFactoryName: defaultFactory.factoryName })
        }
      }
    } catch (e) {
      console.error('loadFactories error', e)
    }
  },

  // 切换工厂
  onSwitchFactory() {
    const factories = this.data.factories
    if (!factories.length) return
    wx.showActionSheet({
      itemList: factories.map(f => f.factoryName),
      success: (res) => {
        const selected = factories[res.tapIndex]
        const app = getApp()
        app.setCurrentFactory(selected.factoryId, selected.factoryName)
        this.setData({ currentFactoryName: selected.factoryName })
        wx.showToast({ title: `已切换到 ${selected.factoryName}`, icon: 'none' })
      }
    })
  },

  onInspection() {
    wx.navigateTo({ url: '/pages/inspection/index' })
  },

  onCompanyOverview() {
    wx.navigateTo({ url: '/pages/company/index' })
  },

  onAIAnalysis() {
    wx.navigateTo({ url: '/pages/ai-report/index' })
  },

  // 退出账号 / 切换账号
  onLogout() {
    wx.showModal({
      title: '切换账号',
      content: '退出当前账号后需要重新绑定微信。确定要退出吗？',
      confirmText: '退出',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          auth.logout()
          const app = getApp()
          app.globalData.userInfo = null
          // 跳转到绑定页
          wx.navigateTo({ url: '/pages/bind/index' })
        }
      }
    })
  },

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
  },

  onAbout() {
    wx.showModal({
      title: '关于',
      content: '康洁工程部小程序 v1.0.0\n设备配件更换记录与报警系统',
      showCancel: false
    })
  }
})
