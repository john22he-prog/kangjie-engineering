// pages/replace/form.js
const api = require('../../utils/api')
const auth = require('../../utils/auth')
const offlineQueue = require('../../utils/offline-queue')
const { generateUUID, formatDate, getCurrentYearMonth } = require('../../utils/util')
const { ERRORS, REPLACE_TYPES } = require('../../utils/constants')

Page({
  data: {
    // 固定区
    assetId: '',
    assetName: '',
    assetNo: '',
    reporterName: '',
    displayDate: '',
    // 可填区
    typeOptions: REPLACE_TYPES,
    typeIndex: -1,
    type: '',
    locations: [],
    locationIndex: -1,
    locationId: '',
    locationName: '',
    availableSkus: [],
    selectedSkus: [],  // [{partSkuId, qty}]
    remark: '',
    images: [],        // fileId[]
    // 控制
    submitting: false,
    canSubmit: false,
    offlineCount: 0
  },

  onLoad(options) {
    this.assetId = options.assetId
    const user = auth.getUser()
    this.setData({
      assetId: options.assetId,
      reporterName: user.displayName,
      displayDate: formatDate(Date.now()),
      offlineCount: offlineQueue.getCount()
    })
    this.loadAssetAndLocations()
  },

  async loadAssetAndLocations() {
    wx.showLoading({ title: '加载中...' })
    try {
      // 获取设备信息
      const assetResult = await api.getAssetByQr(this.assetId)
      if (assetResult.ok) {
        this.setData({
          assetName: assetResult.data.asset.assetName,
          assetNo: assetResult.data.asset.assetNo
        })
      }
      // 获取部位和配件映射
      const locResult = await api.getLocationsAndParts(this.assetId)
      if (locResult.ok) {
        this.setData({ locations: locResult.data.locations || [] })
        this.locationPartMap = locResult.data.map || {}
      }
    } catch (e) {
      console.error(e)
    }
    wx.hideLoading()
  },

  onTypeChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({
      typeIndex: idx,
      type: REPLACE_TYPES[idx]
    })
    this.checkCanSubmit()
  },

  onLocationChange(e) {
    const idx = parseInt(e.detail.value)
    const loc = this.data.locations[idx]
    if (!loc) return

    const skus = (this.locationPartMap && this.locationPartMap[loc.locationId]) || []
    if (skus.length === 0) {
      wx.showModal({
        title: '提示',
        content: ERRORS.NO_PARTS_FOR_LOCATION,
        showCancel: false
      })
    }

    this.setData({
      locationIndex: idx,
      locationId: loc.locationId,
      locationName: loc.locationName,
      availableSkus: skus,
      selectedSkus: [] // 切换部位清空已选
    })
    this.checkCanSubmit()
  },

  onSkuChange(e) {
    this.setData({ selectedSkus: e.detail })
    this.checkCanSubmit()
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  onImageChange(e) {
    this.setData({ images: e.detail })
    this.checkCanSubmit()
  },

  // 是否有未保存的填写内容
  hasUnsavedChanges() {
    const { selectedSkus, images, remark } = this.data
    return (selectedSkus && selectedSkus.length > 0) ||
      (images && images.length > 0) ||
      (remark && String(remark).trim() !== '')
  },

  onAbandonTap() {
    if (!this.hasUnsavedChanges()) {
      wx.navigateBack()
      return
    }
    wx.showModal({
      title: '放弃填写',
      content: '当前已填写内容将丢失，确定放弃吗？',
      confirmText: '放弃',
      confirmColor: '#FA5151',
      success: (res) => {
        if (res.confirm) wx.navigateBack()
      }
    })
  },

  checkCanSubmit() {
    const { type, locationId, selectedSkus, images } = this.data
    const hasType = !!type
    const hasLocation = !!locationId
    const hasSkus = selectedSkus.length > 0 && selectedSkus.every(s => s.qty > 0)
    const hasImages = images.length >= 1
    this.setData({ canSubmit: hasType && hasLocation && hasSkus && hasImages })
  },

  // 校验
  validate() {
    const { type, locationId, selectedSkus, images } = this.data
    if (!type) return ERRORS.TYPE_REQUIRED
    if (!locationId) return ERRORS.LOCATION_REQUIRED
    if (selectedSkus.length === 0) return ERRORS.SKU_REQUIRED
    for (const s of selectedSkus) {
      if (!s.qty || s.qty < 1 || !Number.isInteger(s.qty)) return ERRORS.QTY_INVALID
    }
    if (images.length < 1) return ERRORS.IMAGE_REQUIRED
    return null
  },

  async onSubmit() {
    const error = this.validate()
    if (error) {
      wx.showToast({ title: error, icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    // 构建提交数据
    const clientOfflineId = generateUUID()
    const payload = {
      assetId: this.data.assetId,
      type: this.data.type,
      locationId: this.data.locationId,
      selectedPartSkuIds: this.data.selectedSkus.map(s => s.partSkuId),
      qtyMap: {},
      remark: this.data.remark,
      images: this.data.images,
      clientOfflineId
    }
    this.data.selectedSkus.forEach(s => {
      payload.qtyMap[s.partSkuId] = s.qty
    })

    // 先写入离线队列
    offlineQueue.enqueue({ ...payload, _status: 'PENDING' })

    try {
      const result = await api.submitReplacementLog(payload)
      if (result.ok) {
        // 成功：移除离线队列
        offlineQueue.removeByClientOfflineId(clientOfflineId)
        this.setData({ submitting: false })
        wx.showToast({ title: '提交成功（本月累计已更新）', icon: 'success', duration: 1500 })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        this.setData({ submitting: false })
        wx.showToast({ title: '提交失败，已保存待同步', icon: 'none', duration: 2000 })
      }
    } catch (e) {
      console.error('提交失败', e)
      this.setData({ submitting: false })
      wx.showToast({ title: '提交失败，已保存待同步', icon: 'none', duration: 2000 })
    }
  }
})
