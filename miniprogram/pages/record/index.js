// pages/record/index.js
const api = require('../../utils/api')
const { getCurrentYearMonth, formatDate } = require('../../utils/util')

Page({
  data: {
    filters: {
      yearMonth: '',
      assetId: '',
      assetName: '',
      userId: '',
      userName: ''
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
    this.loadAssets()
    this.loadList(true)
  },

  // 加载设备列表用于筛选下拉
  async loadAssets() {
    try {
      const result = await api.listAssets()
      if (result.ok) {
        // 头部加一个"全部设备"选项
        const all = [{ assetId: '', assetName: '全部设备', assetNo: '' }]
        this.setData({ assetOptions: all.concat(result.data.list || []) })
      }
    } catch (e) {
      console.error('加载设备列表失败', e)
    }
  },

  onShow() {
    const app = getApp()
    // 从看板跳转：人员筛选
    if (app.globalData && app.globalData.recordFilterUser) {
      const u = app.globalData.recordFilterUser
      app.globalData.recordFilterUser = null
      this.setData({
        'filters.userId': u.userId,
        'filters.userName': u.userName,
        'filters.yearMonth': u.yearMonth || this.data.filters.yearMonth
      })
    }
    // 从趋势图跳转：日期筛选
    if (app.globalData && app.globalData.recordFilterDate) {
      const dateStr = app.globalData.recordFilterDate  // e.g. '2026-02-08'
      app.globalData.recordFilterDate = null
      const ym = dateStr.substring(0, 7)  // '2026-02'
      this.setData({
        'filters.yearMonth': ym,
        'filters.filterDate': dateStr,
        'filters.filterDateLabel': dateStr.substring(5)  // '02-08'
      })
    }
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
      const params = {
        yearMonth: this.data.filters.yearMonth,
        assetId: this.data.filters.assetId || undefined,
        userId: this.data.filters.userId || undefined,
        page: this.data.page,
        pageSize: this.data.pageSize
      }
      if (this.data.filters.filterDate) {
        params.filterDate = this.data.filters.filterDate
      }
      const result = await api.listReplacementLogs(params)
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

  onClearDateFilter() {
    this.setData({
      'filters.filterDate': '',
      'filters.filterDateLabel': ''
    })
    this.loadList(true)
  },

  onClearUserFilter() {
    this.setData({
      'filters.userId': '',
      'filters.userName': ''
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
