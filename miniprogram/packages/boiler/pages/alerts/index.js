const api = require('../../utils/api')

Page({
  data: {
    loading: true,
    alerts: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    filterStatus: '',
    statusOptions: [
      { label: '全部', value: '' },
      { label: '未处理', value: 'open' },
      { label: '已确认', value: 'acknowledged' },
      { label: '已解决', value: 'resolved' }
    ],
    statusIndex: 0,
    user: null
  },

  async onLoad() {
    try {
      const res = await api.checkLogin()
      if (res && res.isRegistered && res.user) {
        this.setData({ user: res.user })
      }
    } catch (e) {
      console.error('获取用户失败', e)
    }
    this.loadAlerts(true)
  },

  onPullDownRefresh() {
    this.loadAlerts(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadAlerts(false)
    }
  },

  async loadAlerts(reset) {
    if (reset) {
      this.setData({ page: 1, hasMore: true, alerts: [] })
    }
    this.setData({ loading: true })

    try {
      const params = {
        page: this.data.page,
        pageSize: this.data.pageSize
      }
      if (this.data.filterStatus) {
        params.status = this.data.filterStatus
      }

      const result = await api.listAlerts(params)
      const list = result && result.list ? result.list : []
      const newAlerts = list.map(a => ({
        ...a,
        statusLabel: this._statusLabel(a.status),
        statusClass: this._statusClass(a.status),
        severityLabel: this._severityLabel(a.rule_severity),
        severityClass: this._severityClass(a.rule_severity),
        displayTime: a.triggered_at ? a.triggered_at.replace('T', ' ').substring(0, 16) : '--'
      }))

      this.setData({
        alerts: reset ? newAlerts : this.data.alerts.concat(newAlerts),
        page: this.data.page + 1,
        hasMore: newAlerts.length >= this.data.pageSize,
        loading: false
      })
    } catch (err) {
      console.error('加载预警失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  _statusLabel(status) {
    const map = { open: '未处理', acknowledged: '已确认', resolved: '已解决' }
    return map[status] || status || '未知'
  },

  _statusClass(status) {
    const map = { open: 'status-open', acknowledged: 'status-ack', resolved: 'status-resolved' }
    return map[status] || ''
  },

  _severityLabel(severity) {
    const map = { high: '高', medium: '中', low: '低' }
    return map[severity] || severity || '--'
  },

  _severityClass(severity) {
    const map = { high: 'severity-high', medium: 'severity-medium', low: 'severity-low' }
    return map[severity] || ''
  },

  onFilterChange(e) {
    const idx = Number(e.detail.value)
    const status = this.data.statusOptions[idx].value
    this.setData({ statusIndex: idx, filterStatus: status })
    this.loadAlerts(true)
  },

  async onAcknowledge(e) {
    const alertId = e.currentTarget.dataset.id
    wx.showLoading({ title: '处理中...' })
    try {
      await api.acknowledgeAlert(alertId)
      wx.hideLoading()
      wx.showToast({ title: '已确认', icon: 'success' })
      this.loadAlerts(true)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  },

  async onResolve(e) {
    const alertId = e.currentTarget.dataset.id
    wx.showModal({
      title: '解决预警',
      content: '确认将此预警标记为已解决？',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...' })
        try {
          await api.resolveAlert(alertId, '')
          wx.hideLoading()
          wx.showToast({ title: '已解决', icon: 'success' })
          this.loadAlerts(true)
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message || '操作失败', icon: 'none' })
        }
      }
    })
  }
})
