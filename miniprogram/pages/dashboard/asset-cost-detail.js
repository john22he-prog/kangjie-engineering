// pages/dashboard/asset-cost-detail.js
const api = require('../../utils/api')

Page({
  data: {
    assetId: '',
    assetName: '',
    yearMonth: '',
    totalCost: 0,
    totalCostStr: '0',
    partList: [],
    loading: false
  },

  onLoad(options) {
    const { assetId, yearMonth, assetName } = options
    const name = decodeURIComponent(assetName || '设备')
    wx.setNavigationBarTitle({ title: name + ' - 配件金额' })
    this.setData({ assetId, yearMonth, assetName: name })
    this.loadDetail(assetId, yearMonth)
  },

  async loadDetail(assetId, yearMonth) {
    this.setData({ loading: true })
    try {
      const result = await api.getAssetCostDetail({ assetId, yearMonth })
      if (result.ok) {
        const data = result.data
        const maxCost = data.partList.length > 0 ? data.partList[0].totalCost : 1
        const partList = data.partList.map(item => ({
          ...item,
          totalCostStr: this._formatMoney(item.totalCost),
          barWidth: Math.max(Math.round((item.totalCost / maxCost) * 100), 5)
        }))
        this.setData({
          totalCost: data.totalCost,
          totalCostStr: this._formatMoney(data.totalCost),
          partList,
          loading: false
        })
      }
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
    }
  },

  _formatMoney(num) {
    if (!num && num !== 0) return '0'
    return Number(num).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
})
