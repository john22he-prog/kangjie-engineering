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
    canWrite: false,
    canManage: false
  },

  onShow() {
    this.setData({
      canWrite: auth.canWrite(),
      canManage: auth.canManage()
    })
    this.loadPlan()
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

        this.setData({
          plan,
          assets,
          pendingAssets,
          doneAssets,
          completed,
          total,
          inspectDate,
          progress,
          loading: false
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: result.error.message || '加载失败', icon: 'none' })
      }
    } catch (e) {
      console.error('loadPlan error', e)
      this.setData({ loading: false })
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  onScanInspect() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: (res) => {
        const assetId = res.result
        if (!assetId) return

        // 检查是否在巡检清单中
        const asset = this.data.assets.find(a => a.assetId === assetId)
        if (!asset) {
          wx.showModal({
            title: '不在巡检清单',
            content: '该设备不在今日巡检清单中',
            showCancel: false
          })
          return
        }

        if (asset.done) {
          wx.showModal({
            title: '已完成',
            content: `该设备今日已由 ${asset.log.userDisplayName} 完成巡检`,
            showCancel: false
          })
          return
        }

        wx.navigateTo({
          url: `/pages/inspection/checkin?assetId=${asset.assetId}&assetName=${encodeURIComponent(asset.assetName)}&assetNo=${encodeURIComponent(asset.assetNo)}`
        })
      },
      fail: (e) => {
        if (e.errMsg && e.errMsg.indexOf('cancel') > -1) return
        console.error('扫码失败', e)
      }
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
    this.loadPlan().then(() => wx.stopPullDownRefresh())
  }
})
