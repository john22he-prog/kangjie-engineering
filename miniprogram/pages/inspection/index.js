const api = require('../../utils/api')
const auth = require('../../utils/auth')

Page({
  data: {
    loading: true,
    plan: null,
    assets: [],
    pendingAssets: [],
    doneAssets: [],
    completed: 0,
    total: 0,
    inspectDate: '',
    progress: 0,
    isManager: false,
    canWrite: false,
    canManage: false,
    // manager-only: per-engineer summary
    engineerSummary: [],
    weekData: null,
    statsLoading: false
  },

  onShow() {
    const isManager = auth.canManage() || auth.isSupervisor() || auth.isAdmin()
    this.setData({
      isManager,
      canWrite: auth.canWrite(),
      canManage: auth.canManage()
    })
    this.loadPlan()
    this.loadStats()
  },

  async loadPlan() {
    this.setData({ loading: true })
    try {
      const result = await api.getInspectionPlan()
      if (result.ok) {
        const { plan, assets, completed, total, inspectDate } = result.data
        const pendingAssets = assets.filter(a => !a.done)
        const doneAssets = assets.filter(a => a.done)
        const progress = total > 0 ? Math.round(completed / total * 100) : 0

        // Build per-engineer summary for managers
        let engineerSummary = []
        if (this.data.isManager) {
          const byEngineer = {}
          doneAssets.forEach(a => {
            const name = a.log?.userDisplayName || '未知'
            if (!byEngineer[name]) byEngineer[name] = 0
            byEngineer[name]++
          })
          engineerSummary = Object.entries(byEngineer)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
        }

        this.setData({
          plan, assets, pendingAssets, doneAssets,
          completed, total, inspectDate, progress,
          engineerSummary, loading: false
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: result.error?.message || '加载失败', icon: 'none' })
      }
    } catch (e) {
      console.error('loadPlan error', e)
      this.setData({ loading: false })
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  async loadStats() {
    this.setData({ statsLoading: true })
    try {
      const result = await api.getInspectionStats()
      if (result.ok && result.data.hasPlan) {
        this.setData({ weekData: result.data.week, statsLoading: false })
      } else {
        this.setData({ statsLoading: false })
      }
    } catch (e) {
      this.setData({ statsLoading: false })
    }
  },

  onScanInspect() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: (res) => {
        const assetId = res.result
        if (!assetId) return
        const asset = this.data.assets.find(a => a.assetId === assetId)
        if (!asset) {
          wx.showModal({ title: '不在巡检清单', content: '该设备不在今日巡检清单中', showCancel: false })
          return
        }
        if (asset.done) {
          wx.showModal({ title: '已完成', content: `该设备今日已由 ${asset.log.userDisplayName} 完成巡检`, showCancel: false })
          return
        }
        wx.navigateTo({
          url: `/pages/inspection/checkin?assetId=${asset.assetId}&assetName=${encodeURIComponent(asset.assetName)}&assetNo=${encodeURIComponent(asset.assetNo)}`
        })
      },
      fail: (e) => { if (e.errMsg && e.errMsg.indexOf('cancel') > -1) return }
    })
  },

  onAssetTap(e) {
    const { assetid, done } = e.currentTarget.dataset
    if (done) return
    if (!this.data.canWrite) return
    const asset = this.data.assets.find(a => a.assetId === assetid)
    if (!asset) return
    wx.navigateTo({
      url: `/pages/inspection/checkin?assetId=${asset.assetId}&assetName=${encodeURIComponent(asset.assetName)}&assetNo=${encodeURIComponent(asset.assetNo)}`
    })
  },

  onPreviewImage(e) {
    const { urls, current } = e.currentTarget.dataset
    wx.previewImage({ current, urls })
  },

  onViewHistory() {
    wx.navigateTo({ url: '/pages/inspection/history' })
  },

  onConfigPlan() {
    wx.navigateTo({ url: '/pages/inspection/plan-config' })
  },

  onPullDownRefresh() {
    Promise.all([this.loadPlan(), this.loadStats()]).then(() => wx.stopPullDownRefresh())
  }
})
