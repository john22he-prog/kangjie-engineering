// pages/dashboard/asset-alerts.js
const api = require('../../utils/api')
const auth = require('../../utils/auth')
const { formatDate } = require('../../utils/util')

Page({
  data: {
    assetId: '',
    assetName: '',
    yearMonth: '',
    info: null,
    loading: true,
    canAck: false
  },

  onLoad(options) {
    this.setData({
      assetId: options.assetId || '',
      assetName: decodeURIComponent(options.assetName || ''),
      yearMonth: options.yearMonth || '',
      canAck: auth.canAck()
    })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const result = await api.getAssetAlerts({
        assetId: this.data.assetId,
        yearMonth: this.data.yearMonth
      })
      if (result.ok) {
        const info = result.data
        // 格式化时间
        info.alerts = (info.alerts || []).map(a => ({
          ...a,
          createdAtStr: formatDate(a.createdAt),
          logs: (a.logs || []).map(l => ({
            ...l,
            dateStr: formatDate(l.ts)
          })),
          expanded: false
        }))
        this.setData({ info, loading: false })
      }
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
    }
  },

  // 展开/折叠消耗明细
  toggleLogs(e) {
    const idx = e.currentTarget.dataset.idx
    const key = `info.alerts[${idx}].expanded`
    this.setData({ [key]: !this.data.info.alerts[idx].expanded })
  },

  // ACK 确认
  async onAck(e) {
    const alert = e.currentTarget.dataset.alert
    const idx = e.currentTarget.dataset.idx

    wx.showModal({
      title: '确认已知晓',
      content: '确认后该报警将标记为"已确认"',
      confirmText: '已知晓',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const result = await api.ackAlert({ alertId: alert.alertId, ackNote: '已知晓' })
          if (result.ok) {
            wx.showToast({ title: '已确认', icon: 'success' })
            // 更新本地状态
            this.setData({
              [`info.alerts[${idx}].status`]: 'ACK',
              [`info.openCount`]: Math.max(0, (this.data.info.openCount || 0) - 1)
            })
          }
        } catch (err) {
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  }
})
