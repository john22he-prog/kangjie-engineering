// app.js
const auth = require('./utils/auth')
const offlineQueue = require('./utils/offline-queue')

App({
  onLaunch() {
    // 云开发初始化
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-0g0grbwt8c230b0d',
        traceUser: true
      })
    }

    // 全局状态
    this.globalData = {
      userInfo: null,
      lastAsset: null,
      currentFactoryId: null,
      currentFactoryName: '',
      factories: [],
      loginReady: false,       // 登录流程是否完成
      loginCallbacks: []       // 等待登录完成的回调队列
    }

    // 恢复上次选择的工厂
    this.restoreFactory()

    // 启动登录流程
    this.initLogin()
  },

  onShow() {
    // 每次从后台回到前台时，自动同步离线队列中的待提交记录
    this._syncOfflineQueue()
  },

  /**
   * 启动登录：调用 getMe 云函数获取当前微信用户信息
   */
  async initLogin() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getMe', data: {} })
      const result = res.result

      if (result.ok) {
        // 已绑定用户，设置用户信息
        auth.setUser(result.data)
        this.globalData.userInfo = result.data
        this.globalData.loginReady = true
        this._fireLoginCallbacks(true)
      } else if (result.error && result.error.code === 'AUTH_NOT_BOUND') {
        // 未绑定，需要跳转到绑定页
        this.globalData.loginReady = true
        this._fireLoginCallbacks(false)
        // 跳转到绑定页
        wx.navigateTo({ url: '/pages/bind/index' })
      } else if (result.error && result.error.code === 'USER_DISABLED') {
        // 账号已禁用
        this.globalData.loginReady = true
        this._fireLoginCallbacks(false)
        wx.showModal({
          title: '账号已禁用',
          content: result.error.message || '您的账号已被管理员禁用，如有疑问请联系管理员',
          showCancel: false,
        })
      } else {
        console.error('getMe failed:', result.error)
        this.globalData.loginReady = true
        this._fireLoginCallbacks(false)
        wx.showToast({ title: result.error?.message || '获取用户失败', icon: 'none' })
      }
    } catch (err) {
      console.error('initLogin error:', err)
      this.globalData.loginReady = true
      this._fireLoginCallbacks(false)
      // 如果是网络错误，尝试使用缓存的用户
      if (auth.isLoggedIn()) {
        this.globalData.userInfo = auth.getUser()
      }
    }
  },

  /**
   * 等待登录完成（供页面调用）
   * @returns {Promise<boolean>} 是否登录成功
   */
  waitForLogin() {
    return new Promise((resolve) => {
      if (this.globalData.loginReady) {
        resolve(auth.isLoggedIn())
      } else {
        this.globalData.loginCallbacks.push(resolve)
      }
    })
  },

  _fireLoginCallbacks(success) {
    const cbs = this.globalData.loginCallbacks
    this.globalData.loginCallbacks = []
    cbs.forEach(cb => cb(success))
  },

  /**
   * 设置当前工厂
   */
  setCurrentFactory(factoryId, factoryName) {
    this.globalData.currentFactoryId = factoryId
    this.globalData.currentFactoryName = factoryName
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

  /**
   * 刷新会话（提交前调用，确保 OPENID 有效）
   * @returns {Promise<boolean>} 是否刷新成功
   */
  async refreshSession() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getMe', data: {} })
      const result = res.result
      if (result.ok) {
        auth.setUser(result.data)
        this.globalData.userInfo = result.data
        return true
      }
      return false
    } catch (e) {
      console.error('refreshSession error:', e)
      return false
    }
  },

  /**
   * 自动同步离线队列
   */
  async _syncOfflineQueue() {
    const count = offlineQueue.getCount()
    if (count === 0) return
    try {
      await offlineQueue.syncAll()
      wx.showToast({ title: `${count}条离线记录已同步`, icon: 'success' })
    } catch (e) {
      console.warn('离线队列同步部分失败:', e.message)
    }
  },

  globalData: {
    userInfo: null,
    lastAsset: null,
    currentFactoryId: null,
    currentFactoryName: '',
    factories: [],
    loginReady: false,
    loginCallbacks: []
  }
})
