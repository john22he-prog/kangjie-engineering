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
    offlineCount: 0,
    hasLocations: false
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
        const locations = locResult.data.locations || []
        const allParts = locResult.data.allParts || []
        this.setData({
          locations,
          availableSkus: allParts,  // 默认显示全部配件
          hasLocations: locations.length > 0
        })
        this.locationPartMap = locResult.data.map || {}
        this.allParts = allParts
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

    this.setData({
      locationIndex: idx,
      locationId: loc.locationId,
      locationName: loc.locationName,
      availableSkus: skus.length > 0 ? skus : (this.allParts || []),
      selectedSkus: [] // 切换部位清空已选
    })
    this.checkCanSubmit()
  },

  onClearLocation() {
    // 清除部位选择，恢复显示全部配件
    this.setData({
      locationIndex: -1,
      locationId: '',
      locationName: '',
      availableSkus: this.allParts || [],
      selectedSkus: []
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
    const { type, selectedSkus, images } = this.data
    const hasType = !!type
    const hasSkus = selectedSkus.length > 0 && selectedSkus.every(s => s.qty > 0)
    const hasImages = images.length >= 1
    this.setData({ canSubmit: hasType && hasSkus && hasImages })
  },

  // 校验
  validate() {
    const { type, selectedSkus, images } = this.data
    if (!type) return ERRORS.TYPE_REQUIRED
    // 部位为可选，不再强制校验
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

    // 尝试提交（含自动重试）
    const result = await this._trySubmit(payload, clientOfflineId)
    this.setData({ submitting: false })

    if (result && result.ok) {
      offlineQueue.removeByClientOfflineId(clientOfflineId)
      wx.showToast({ title: '提交成功', icon: 'success', duration: 1500 })
      setTimeout(() => wx.navigateBack(), 1500)
    }
    // 失败情况已在 _trySubmit 中处理提示
  },

  /**
   * 尝试提交，如果因会话问题失败则刷新后重试一次
   */
  async _trySubmit(payload, clientOfflineId) {
    const app = getApp()

    try {
      const result = await api.submitReplacementLog(payload)
      if (result.ok) return result

      // 云函数返回了错误
      const errCode = result.error && result.error.code
      const errMsg = result.error && result.error.message

      // 如果是认证/权限失败，尝试刷新会话后重试
      if (errCode === 'AUTH_FAILED' || errCode === 'PERMISSION_DENIED') {
        console.log('认证失败，尝试刷新会话...')
        const refreshOk = await app.refreshSession()
        if (refreshOk) {
          // 重试一次
          const retryResult = await api.submitReplacementLog(payload)
          if (retryResult.ok) return retryResult
          // 重试仍然失败
          const retryMsg = (retryResult.error && retryResult.error.message) || '提交失败'
          wx.showToast({ title: retryMsg, icon: 'none', duration: 2500 })
          return retryResult
        } else {
          wx.showModal({
            title: '登录已过期',
            content: '请关闭小程序后重新打开再试',
            showCancel: false
          })
          return null
        }
      }

      // 其他错误，显示具体原因
      wx.showToast({ title: errMsg || '提交失败，已保存待同步', icon: 'none', duration: 2500 })
      return result
    } catch (e) {
      console.error('提交异常', e)
      // 网络超时等异常，尝试刷新会话重试
      try {
        const refreshOk = await app.refreshSession()
        if (refreshOk) {
          const retryResult = await api.submitReplacementLog(payload)
          if (retryResult.ok) return retryResult
        }
      } catch (retryErr) {
        console.error('重试也失败', retryErr)
      }
      wx.showToast({ title: '网络异常，已保存待同步', icon: 'none', duration: 2500 })
      return null
    }
  }
})
