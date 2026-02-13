// pages/ai-report/index.js
const api = require('../../utils/api')
const auth = require('../../utils/auth')

Page({
  data: {
    yearMonth: '',
    loading: false,
    report: null,
    factoryLabel: ''
  },

  onLoad() {
    const now = new Date()
    const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
    const user = auth.getUser()
    const factoryLabel = user && user.factoryId ? '当前工厂' : '全部数据'
    this.setData({ yearMonth: ym, factoryLabel: factoryLabel })
  },

  onMonthChange(e) {
    this.setData({ yearMonth: e.detail.value })
  },

  async onGenerate() {
    const { yearMonth } = this.data
    const user = auth.getUser()
    const factoryId = (user && user.role === 'Supervisor') ? (user.factoryId || '') : undefined

    this.setData({ loading: true, report: null })
    try {
      const res = await api.getAIReport({
        yearMonth: yearMonth,
        factoryId: factoryId,
        scope: 'factory'
      })
      if (res.ok && res.data) {
        this.setData({ report: res.data })
      } else {
        wx.showToast({ title: res.error ? res.error.message : '生成失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '请求失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  }
})
