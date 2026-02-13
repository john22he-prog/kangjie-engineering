// app.js
App({
  onLaunch() {
    // 云开发初始化 — 创建云环境后替换 env
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-0g0grbwt8c230b0d', // 云开发环境 ID
        traceUser: true
      })
    }

    // 全局状态
    this.globalData = {
      userInfo: null,       // { userId, displayName, role, status, factoryId }
      lastAsset: null,      // 最近扫过的设备
      currentFactoryId: null,   // 当前选中工厂ID
      currentFactoryName: '',   // 当前选中工厂名称
      factories: []             // 可访问的工厂列表
    }
  },

  /**
   * 设置当前工厂
   */
  setCurrentFactory(factoryId, factoryName) {
    this.globalData.currentFactoryId = factoryId
    this.globalData.currentFactoryName = factoryName
    // 持久化到本地存储
    wx.setStorageSync('kj_current_factory', { factoryId, factoryName })
  },

  /**
   * 获取当前工厂ID
   */
  getCurrentFactoryId() {
    return this.globalData.currentFactoryId
  },

  /**
   * 恢复上次选择的工厂
   */
  restoreFactory() {
    const saved = wx.getStorageSync('kj_current_factory')
    if (saved && saved.factoryId) {
      this.globalData.currentFactoryId = saved.factoryId
      this.globalData.currentFactoryName = saved.factoryName
    }
  },

  globalData: {
    userInfo: null,
    lastAsset: null,
    currentFactoryId: null,
    currentFactoryName: '',
    factories: []
  }
})
