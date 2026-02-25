const auth = require('../../utils/auth')
const { PERMISSIONS } = require('../../utils/permissions')

Page({
  data: {
    loading: true,
    assetId: '',
    assetName: '',
    assetNo: '',
    factoryName: '',
    loadError: false,
    isLoggedIn: false,
    canReplace: false,
    canInspect: false,
    canViewDetail: false,
  },

  async onLoad(options) {
    let assetId = options.assetId || ''
    if (!assetId && options.scene) {
      assetId = decodeURIComponent(options.scene)
    }
    if (!assetId) {
      this.setData({ loading: false, loadError: true })
      return
    }

    const app = getApp()
    await app.waitForLogin()

    const loggedIn = auth.isLoggedIn()
    this.setData({
      isLoggedIn: loggedIn,
      canReplace: loggedIn && auth.hasPermission(PERMISSIONS.RECORD_WRITE),
      canInspect: loggedIn && auth.hasPermission(PERMISSIONS.INSPECTION_WRITE),
      canViewDetail: loggedIn && auth.hasPermission(PERMISSIONS.MODULE_ENGINEERING),
    })

    this._loadAsset(assetId)
  },

  async _loadAsset(assetId) {
    try {
      const cfRes = await wx.cloud.callFunction({
        name: 'getAssetByQr',
        data: { assetId }
      })
      const result = cfRes.result
      if (result.ok && result.data && result.data.asset) {
        const asset = result.data.asset
        this.setData({
          loading: false,
          assetId,
          assetName: asset.assetName,
          assetNo: asset.assetNo || '',
          factoryName: asset.factoryName || '',
        })
      } else {
        this.setData({ loading: false, loadError: true })
      }
    } catch (e) {
      console.error('loadAsset error:', e)
      this.setData({ loading: false, loadError: true })
    }
  },

  onFaultReport() {
    wx.navigateTo({
      url: `/pages/fault-report/index?assetId=${this.data.assetId}`
    })
  },

  onReplace() {
    wx.navigateTo({
      url: `/pages/replace/form?assetId=${this.data.assetId}`
    })
  },

  onInspect() {
    const { assetId, assetName, assetNo } = this.data
    wx.navigateTo({
      url: `/pages/inspection/checkin?assetId=${assetId}&assetName=${encodeURIComponent(assetName)}&assetNo=${encodeURIComponent(assetNo)}`
    })
  },

  onViewDetail() {
    wx.navigateTo({
      url: `/pages/asset/detail?assetId=${this.data.assetId}`
    })
  },

  onGoBind() {
    wx.navigateTo({ url: '/pages/bind/index' })
  },
})
