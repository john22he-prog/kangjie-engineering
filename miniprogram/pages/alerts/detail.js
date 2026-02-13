// pages/alerts/detail.js
const api = require('../../utils/api')
const auth = require('../../utils/auth')

Page({
  data: {
    alert: {},
    ackNote: '',
    submitting: false,
    canAck: false
  },

  onLoad(options) {
    this.alertId = options.alertId
    this.setData({ canAck: auth.canAck() })
    this.loadAlert()
  },

  async loadAlert() {
    wx.showLoading({ title: '加载中...' })
    try {
      const result = await api.getAlertDetail(this.alertId)
      wx.hideLoading()
      if (result.ok) {
        this.setData({ alert: result.data })
      }
    } catch (e) {
      wx.hideLoading()
      console.error(e)
    }
  },

  onAckInput(e) {
    this.setData({ ackNote: e.detail.value })
  },

  async onAck() {
    if (!this.data.ackNote) {
      wx.showToast({ title: '请填写确认说明', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const result = await api.ackAlert({
        alertId: this.alertId,
        ackNote: this.data.ackNote
      })
      this.setData({ submitting: false })
      if (result.ok) {
        wx.showToast({ title: '已确认', icon: 'success' })
        // 刷新当前页面显示已确认状态
        this.loadAlert()
      } else {
        wx.showToast({ title: result.error.message || '确认失败', icon: 'none' })
      }
    } catch (e) {
      this.setData({ submitting: false })
      wx.showToast({ title: '确认失败', icon: 'none' })
    }
  }
})
