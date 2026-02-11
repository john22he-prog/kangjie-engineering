// pages/dashboard/asset-detail.js
const api = require('../../utils/api')

Page({
  data: {
    info: {},
    list: [],
    loading: false
  },

  onLoad(options) {
    const { assetId, yearMonth, assetName } = options
    wx.setNavigationBarTitle({ title: decodeURIComponent(assetName || '设备详情') })
    this.loadDetail(assetId, yearMonth)
  },

  async loadDetail(assetId, yearMonth) {
    this.setData({ loading: true })
    try {
      const result = await api.getAssetUsageDetail({ assetId, yearMonth })
      if (result.ok) {
        const data = result.data
        const maxQty = data.list.length > 0 ? data.list[0].qty : 1
        const list = data.list.map(item => ({
          ...item,
          percent: Math.round((item.qty / maxQty) * 100)
        }))
        this.setData({
          info: {
            assetName: data.assetName,
            assetNo: data.assetNo,
            yearMonth: data.yearMonth,
            logCount: data.logCount,
            totalQty: data.totalQty
          },
          list,
          loading: false
        })
      }
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
    }
  }
})
