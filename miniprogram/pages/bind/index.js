// pages/bind/index.js — 微信账号绑定页面
const auth = require('../../utils/auth')

Page({
  data: {
    username: '',
    password: '',
    loading: false,
    errorMsg: ''
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value, errorMsg: '' })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value, errorMsg: '' })
  },

  async onBind() {
    const { username, password } = this.data
    if (!username.trim()) {
      this.setData({ errorMsg: '请输入用户名' })
      return
    }
    if (!password.trim()) {
      this.setData({ errorMsg: '请输入密码' })
      return
    }

    this.setData({ loading: true, errorMsg: '' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'bindUser',
        data: { username: username.trim(), password: password.trim() }
      })
      const result = res.result

      if (result.ok) {
        // 绑定成功，设置用户信息
        auth.setUser(result.data.user)
        const app = getApp()
        app.globalData.userInfo = result.data.user

        wx.showToast({ title: '绑定成功！', icon: 'success' })

        // 延迟跳回首页
        setTimeout(() => {
          wx.switchTab({ url: '/pages/scan/index' })
        }, 1000)
      } else {
        this.setData({
          loading: false,
          errorMsg: result.error?.message || '绑定失败，请重试'
        })
      }
    } catch (err) {
      console.error('bindUser error:', err)
      this.setData({
        loading: false,
        errorMsg: '网络错误，请重试'
      })
    }
  }
})
