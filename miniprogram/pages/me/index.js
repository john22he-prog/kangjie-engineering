// pages/me/index.js
const auth = require('../../utils/auth')
const offlineQueue = require('../../utils/offline-queue')

const IS_DEV = true  // 正式上线改为 false

Page({
  data: {
    userInfo: {},
    offlineCount: 0,
    syncing: false,
    devMode: IS_DEV,
    mockUsers: [],
    canManage: false
  },

  onShow() {
    const user = auth.getUser()
    this.setData({
      userInfo: user,
      offlineCount: offlineQueue.getCount(),
      mockUsers: IS_DEV ? auth.getMockUsers() : [],
      canManage: user.role === 'Supervisor' || user.role === 'Admin'
    })
  },

  // 数据管理
  onDataManage() {
    wx.navigateTo({ url: '/pages/data-manage/index' })
  },

  // 切换角色
  onSwitchRole(e) {
    const userId = e.currentTarget.dataset.userid
    auth.switchMockUser(userId)
    const user = auth.getUser()
    this.setData({
      userInfo: user,
      canManage: user.role === 'Supervisor' || user.role === 'Admin'
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
