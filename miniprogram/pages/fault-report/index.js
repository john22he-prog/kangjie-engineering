Page({
  data: {
    assetId: '',
    assetName: '',
    assetNo: '',
    images: [],
    remark: '',
    submitting: false,
    canSubmit: false,
    submitted: false,
    loading: false,
  },

  async onLoad(options) {
    const app = getApp()
    await app.waitForLogin()

    let assetId = options.assetId || ''
    if (!assetId && options.scene) {
      assetId = decodeURIComponent(options.scene)
    }
    if (assetId) {
      this._loadAsset(assetId)
    }
  },

  async _loadAsset(assetId) {
    this.setData({ loading: true })
    try {
      const cfRes = await wx.cloud.callFunction({
        name: 'getAssetByQr',
        data: { assetId }
      })
      const result = cfRes.result
      if (result.ok && result.data && result.data.asset) {
        this.setData({
          assetId,
          assetName: result.data.asset.assetName,
          assetNo: result.data.asset.assetNo || '',
          loading: false,
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: '未找到该设备', icon: 'none' })
      }
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: '设备查询失败', icon: 'none' })
    }
  },

  async onScan() {
    try {
      const res = await wx.scanCode({ onlyFromCamera: false, scanType: ['qrCode'] })
      const assetId = res.result
      if (!assetId) return

      wx.showLoading({ title: '识别设备...' })
      const cfRes = await wx.cloud.callFunction({
        name: 'getAssetByQr',
        data: { assetId }
      })
      wx.hideLoading()

      const result = cfRes.result
      if (result.ok && result.data && result.data.asset) {
        this.setData({
          assetId,
          assetName: result.data.asset.assetName,
          assetNo: result.data.asset.assetNo || '',
        })
        this._checkCanSubmit()
      } else {
        wx.showToast({ title: '未找到该设备', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      if (e.errMsg && e.errMsg.indexOf('cancel') > -1) return
      wx.showToast({ title: '扫码失败', icon: 'none' })
    }
  },

  onChooseImage() {
    const remaining = 3 - this.data.images.length
    if (remaining <= 0) return

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' })
        const newImages = [...this.data.images]
        let failCount = 0
        for (const file of res.tempFiles) {
          try {
            const ext = file.tempFilePath.split('.').pop() || 'jpg'
            const cloudPath = `fault/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
            const uploadRes = await wx.cloud.uploadFile({
              cloudPath,
              filePath: file.tempFilePath,
            })
            newImages.push(uploadRes.fileID)
          } catch (e) {
            failCount++
            console.error('上传失败', e)
          }
        }
        wx.hideLoading()
        if (failCount > 0) {
          wx.showToast({ title: `${failCount}张照片上传失败`, icon: 'none' })
        }
        this.setData({ images: newImages })
        this._checkCanSubmit()
      }
    })
  },

  onDelImage(e) {
    const idx = e.currentTarget.dataset.idx
    const images = [...this.data.images]
    images.splice(idx, 1)
    this.setData({ images })
    this._checkCanSubmit()
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  _checkCanSubmit() {
    this.setData({ canSubmit: this.data.images.length >= 1 && !!this.data.assetId })
  },

  async onSubmit() {
    if (this.data.submitting || !this.data.canSubmit) return

    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'submitFaultReport',
        data: {
          assetId: this.data.assetId,
          images: this.data.images,
          remark: this.data.remark,
        }
      })
      const result = res.result
      this.setData({ submitting: false })

      if (result.ok) {
        this.setData({ submitted: true })
      } else {
        wx.showToast({ title: result.error.message || '提交失败', icon: 'none' })
      }
    } catch (e) {
      this.setData({ submitting: false })
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    }
  },

  onRescan() {
    this.setData({
      assetId: '', assetName: '', assetNo: '',
      images: [], remark: '', canSubmit: false,
    })
  },

  onReset() {
    this.setData({
      assetId: '', assetName: '', assetNo: '',
      images: [], remark: '', canSubmit: false, submitted: false,
    })
  }
})
