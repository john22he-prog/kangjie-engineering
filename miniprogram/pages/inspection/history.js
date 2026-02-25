const api = require('../../utils/api')

Page({
  data: {
    loading: true,
    list: [],
    expandedDate: '',
    page: 1,
    pageSize: 30,
    hasMore: true,
    planTotal: 0,
    summary: null
  },

  onLoad() {
    this.loadHistory()
  },

  async loadHistory() {
    this.setData({ loading: true })
    try {
      const result = await api.listInspectionHistory({
        page: this.data.page,
        pageSize: this.data.pageSize
      })
      if (result.ok) {
        const { list, total, planTotal } = result.data
        const newList = this.data.page === 1 ? list : [...this.data.list, ...list]

        const fullDays = newList.filter(d => d.completed >= d.total && d.total > 0).length
        const totalLogs = newList.reduce((sum, d) => sum + d.completed, 0)
        const avgRate = newList.length > 0
          ? Math.round(newList.reduce((sum, d) => sum + (d.total > 0 ? d.completed / d.total * 100 : 0), 0) / newList.length)
          : 0

        this.setData({
          list: newList,
          hasMore: this.data.page * this.data.pageSize < total,
          planTotal,
          loading: false,
          summary: { totalDays: newList.length, fullDays, totalLogs, avgRate }
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: result.error.message || '加载失败', icon: 'none' })
      }
    } catch (e) {
      console.error('loadHistory error', e)
      this.setData({ loading: false })
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  onToggleDate(e) {
    const date = e.currentTarget.dataset.date
    this.setData({ expandedDate: this.data.expandedDate === date ? '' : date })
  },

  onPreviewImage(e) {
    const { urls, current } = e.currentTarget.dataset
    wx.previewImage({ current, urls })
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return
    this.setData({ page: this.data.page + 1 })
    this.loadHistory()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, list: [], hasMore: true })
    this.loadHistory().then(() => wx.stopPullDownRefresh())
  }
})
