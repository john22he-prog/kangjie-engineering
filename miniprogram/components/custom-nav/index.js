const auth = require('../../utils/auth')
const { PERMISSIONS } = require('../../utils/permissions')

Component({
  properties: {
    title: {
      type: String,
      value: ''
    }
  },

  data: {
    statusBarHeight: 20,
    navHeight: 44,
    showHome: false
  },

  lifetimes: {
    attached() {
      const sysInfo = wx.getSystemInfoSync()
      const menuBtn = wx.getMenuButtonBoundingClientRect()
      const statusBarHeight = sysInfo.statusBarHeight
      const navHeight = (menuBtn.top - statusBarHeight) * 2 + menuBtn.height

      this.setData({
        statusBarHeight,
        navHeight,
        showHome: auth.hasPermission(PERMISSIONS.MODULE_COMPANY)
      })
    }
  },

  methods: {
    onHomeTap() {
      wx.reLaunch({ url: '/pages/company/index' })
    }
  }
})
