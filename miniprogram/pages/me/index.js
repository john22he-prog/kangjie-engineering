// pages/me/index.js
const auth = require('../../utils/auth')
const api = require('../../utils/api')
const offlineQueue = require('../../utils/offline-queue')

const IS_DEV = false  // 正式上线为 false，隐藏角色切换等开发入口

Page({
  data: {
    userInfo: {},
    offlineCount: 0,
    syncing: false,
    devMode: IS_DEV,
    mockUsers: [],
    canManage: false,
    canSwitchFactory: false,
    currentFactoryName: '',
    factories: []
  },

  onShow() {
    const app = getApp()
    const user = auth.getUser()
    this.setData({
      userInfo: user,
      offlineCount: offlineQueue.getCount(),
      mockUsers: IS_DEV ? auth.getMockUsers() : [],
      canManage: auth.canManage(),
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
        // If no factory selected yet, auto-select user's factory or first one
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

  onAIAnalysis() {
    wx.navigateTo({ url: '/pages/ai-report/index' })
  },

  // 切换角色
  onSwitchRole(e) {
    const userId = e.currentTarget.dataset.userid
    auth.switchMockUser(userId)
    const user = auth.getUser()
    this.setData({
      userInfo: user,
      canManage: auth.canManage()
    })
    wx.showToast({ title: `已切换为 ${user.displayName}（${user.role}）`, icon: 'none' })
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
