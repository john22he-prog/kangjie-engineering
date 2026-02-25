const api = require('../../utils/api')
const auth = require('../../utils/auth')
const notification = require('../../utils/notification')

Page({
  data: {
    assetId: '',
    assetName: '',
    assetNo: '',
    reporterName: '',
    checkTime: '',
    condition: 'normal',
    images: [],
    remark: '',
    submitting: false,
    canSubmit: false
  },

  onLoad(options) {
    const user = auth.getUser()
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const checkTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
    this.setData({
      assetId: options.assetId || '',
      assetName: decodeURIComponent(options.assetName || ''),
      assetNo: decodeURIComponent(options.assetNo || ''),
      reporterName: user.displayName || '',
      checkTime
    })
  },

  onConditionChange(e) {
    this.setData({ condition: e.currentTarget.dataset.val })
  },

  onImageChange(e) {
    this.setData({ images: e.detail })
    this.checkCanSubmit()
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  checkCanSubmit() {
    this.setData({ canSubmit: this.data.images.length >= 1 })
  },

  async onSubmit() {
    if (this.data.images.length < 1) {
      wx.showToast({ title: '请至少上传 1 张照片', icon: 'none' })
      return
    }

    // 提交前静默获取推送额度
    await notification.preSubscribeForInspection()

    this.setData({ submitting: true })

    try {
      const result = await api.submitInspectionLog({
        assetId: this.data.assetId,
        images: this.data.images,
        condition: this.data.condition,
        remark: this.data.remark
      })

      this.setData({ submitting: false })

      if (result.ok) {
        const { completed, total, assetName } = result.data
        wx.showToast({
          title: `打卡成功 ${completed}/${total}`,
          icon: 'success',
          duration: 1500
        })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: result.error.message || '提交失败', icon: 'none', duration: 2500 })
      }
    } catch (e) {
      this.setData({ submitting: false })
      console.error('submit inspection error', e)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    }
  },

  onAbandonTap() {
    if (this.data.images.length === 0 && !this.data.remark) {
      wx.navigateBack()
      return
    }
    wx.showModal({
      title: '放弃打卡',
      content: '已拍摄的照片将丢失，确定放弃吗？',
      confirmText: '放弃',
      confirmColor: '#FA5151',
      success: (res) => {
        if (res.confirm) wx.navigateBack()
      }
    })
  }
})
