const auth = require('../../utils/auth')
const { PERMISSIONS } = require('../../utils/permissions')

Component({
  data: {
    show: false
  },

  lifetimes: {
    attached() {
      this.setData({
        show: auth.hasPermission(PERMISSIONS.MODULE_COMPANY)
      })
    }
  },

  methods: {
    onTap() {
      wx.reLaunch({ url: '/pages/company/index' })
    }
  }
})
