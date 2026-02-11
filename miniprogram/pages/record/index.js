// pages/record/index.js
const api = require('../../utils/api')
const { getCurrentYearMonth, formatDate } = require('../../utils/util')

Page({
  data: {
    filters: {
      yearMonth: '',
      assetId: '',
      assetName: ''
    },
    assetOptions: [],
    assetPickerIndex: 0,
    list: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true
  },

  onLoad() {
    this.setData({ 'filters.yearMonth': getCurrentYearMonth() })
    this.loadList(true)
  },

  onShow() {
    // 从表单返回时刷新
    this.loadList(true)
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false)
    }
  },

  async loadList(reset) {
    if (reset) {
      this.setData({ page: 1, hasMore: true, list: [] })
    }
    this.setData({ loading: true })
    try {
      const result = await api.listReplacementLogs({
        yearMonth: this.data.filters.yearMonth,
        assetId: this.data.filters.assetId || undefined,
        page: this.data.page,
        pageSize: this.data.pageSize
      })
      if (result.ok) {
        const newList = (result.data.list || []).map(item => ({
          ...item,
          displayDate: formatDate(item.ts),
          totalQty: (item.items || []).reduce((s, i) => s + i.qty, 0)
        }))
        this.setData({
          list: reset ? newList : this.data.list.concat(newList),
          page: this.data.page + 1,
          hasMore: newList.length >= this.data.pageSize,
          loading: false
        })
      }
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
    }
  },

  onMonthChange(e) {
    this.setData({ 'filters.yearMonth': e.detail.value })
    this.loadList(true)
  },

  onAssetFilter(e) {
    const idx = e.detail.value
    const asset = this.data.assetOptions[idx]
    this.setData({
      assetPickerIndex: idx,
      'filters.assetId': asset ? asset.assetId : '',
      'filters.assetName': asset ? asset.assetName : '全部设备'
    })
    this.loadList(true)
  },

  onItemTap(e) {
    const log = e.currentTarget.dataset.log
    // 一期用弹窗显示详情
    const items = (log.items || []).map(i => `${i.partNameSnapshot} x${i.qty}`).join('\n')
    wx.showModal({
      title: '记录详情',
      content: `设备：${log.assetNameSnapshot}\n部位：${log.locationNameSnapshot}\n配件：\n${items}\n备注：${log.remark || '无'}`,
      showCancel: false
    })
  }
})
