// pages/dashboard/part-detail.js
const api = require('../../utils/api')

Page({
  data: {
    info: {},
    list: [],
    loading: false
  },

  onLoad(options) {
    const { partSkuId, yearMonth, partName } = options
    wx.setNavigationBarTitle({ title: decodeURIComponent(partName || '配件详情') })
    this.loadDetail(partSkuId, yearMonth)
  },

  async loadDetail(partSkuId, yearMonth) {
    this.setData({ loading: true })
    try {
      const result = await api.getPartUsageDetail({ partSkuId, yearMonth })
      if (result.ok) {
        const data = result.data
        const maxQty = data.list.length > 0 ? data.list[0].qty : 1
        const list = data.list.map(item => ({
          ...item,
          percent: Math.round((item.qty / maxQty) * 100)
        }))
        this.setData({
          info: {
            partName: data.partName,
            partCode: data.partCode,
            unit: data.unit,
            yearMonth: data.yearMonth,
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
