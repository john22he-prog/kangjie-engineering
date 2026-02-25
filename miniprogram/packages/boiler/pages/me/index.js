const api = require('../../utils/api')

Page({
  data: {
    loading: true,
    user: null,
    userName: '未登录',
    avatarChar: '?',
    factoryName: '',
    roleLabel: '--'
  },

  async onShow() {
    this.setData({ loading: true })
    try {
      const res = await api.checkLogin()
      if (res && res.isRegistered && res.user) {
        const u = res.user
        const roleMap = { admin: '管理员', viewer: '查看员', operator: '操作员' }
        const displayName = u.real_name || u.nickname || '未登录'
        this.setData({
          user: u,
          userName: displayName,
          avatarChar: displayName.substring(0, 1),
          factoryName: u.factory_name || '',
          roleLabel: roleMap[u.role] || u.role || '--'
        })
      } else {
        this.setData({ user: null, userName: '未登录', avatarChar: '?', factoryName: '', roleLabel: '--' })
      }
    } catch (e) {
      console.error('checkLogin error', e)
      this.setData({ user: null, userName: '未登录', avatarChar: '?', factoryName: '', roleLabel: '--' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goToHistory() {
    wx.navigateTo({ url: '/packages/boiler/pages/history/index' })
  },

  goToAlerts() {
    wx.navigateTo({ url: '/packages/boiler/pages/alerts/index' })
  },

  goToTrend() {
    wx.navigateTo({ url: '/packages/boiler/pages/trend/index' })
  },

  goBack() {
    wx.navigateTo({ url: '/pages/company/index' })
  }
})
