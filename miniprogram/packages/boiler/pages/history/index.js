const api = require('../../utils/api')

Page({
  data: {
    loading: true,
    records: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    refreshing: false,
    expandedId: '',
    factoryId: null
  },

  async onLoad() {
    try {
      const res = await api.checkLogin()
      if (res && res.isRegistered && res.user) {
        this.setData({ factoryId: res.user.factory_id })
      }
    } catch (e) {
      console.error('获取用户信息失败', e)
    }
    this.loadRecords(true)
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true })
    this.loadRecords(true).then(() => {
      wx.stopPullDownRefresh()
      this.setData({ refreshing: false })
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadRecords(false)
    }
  },

  async loadRecords(reset) {
    if (reset) {
      this.setData({ page: 1, hasMore: true, records: [] })
    }
    this.setData({ loading: true })

    try {
      const result = await api.listRecords({
        factoryId: this.data.factoryId,
        page: this.data.page,
        pageSize: this.data.pageSize
      })

      const raw = result && result.list ? result.list : (Array.isArray(result) ? result : [])
      const newRecords = raw.map(r => ({
        ...r,
        _id: r.id,
        displayDate: r.record_date || '',
        totalSteam: r.total_steam_production != null ? Number(r.total_steam_production).toFixed(1) : '--',
        totalCost: r.total_cost != null ? Number(r.total_cost).toFixed(0) : '--'
      }))

      this.setData({
        records: reset ? newRecords : this.data.records.concat(newRecords),
        page: this.data.page + 1,
        hasMore: newRecords.length >= this.data.pageSize,
        loading: false
      })
    } catch (err) {
      console.error('加载记录失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onTapRecord(e) {
    const id = e.currentTarget.dataset.id
    const expandedId = this.data.expandedId === id ? '' : id
    this.setData({ expandedId })
  },

  async showDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.showLoading({ title: '加载中...' })
    try {
      const detail = await api.getRecordDetail(id)
      wx.hideLoading()

      const lines = []
      lines.push(`日期：${detail.record_date}`)
      lines.push('')

      if (detail.boiler_data && detail.boiler_data.length > 0) {
        lines.push('【锅炉数据】')
        detail.boiler_data.forEach(b => {
          lines.push(`${b.boiler_name || '锅炉'}: 电${b.electricity || 0}度, 汽${b.steam_production || 0}吨`)
          if (b.start_time || b.end_time) {
            lines.push(`  运行: ${b.start_time || '--'} ~ ${b.end_time || '--'}`)
          }
        })
        lines.push('')
      }

      if (detail.customer_steam_data && detail.customer_steam_data.length > 0) {
        lines.push('【客户用汽】')
        detail.customer_steam_data.forEach(c => {
          lines.push(`${c.customer_name || '客户'}: ${c.steam_usage || 0}吨`)
        })
        lines.push('')
      }

      lines.push('【工厂汇总】')
      lines.push(`用水: ${detail.total_water || 0}吨`)
      lines.push(`燃料消耗: ${detail.total_fuel_consumed || 0}吨`)
      lines.push(`进柴量: ${detail.fuel_intake || 0}吨`)

      if (detail.daily_derived_metrics) {
        const m = detail.daily_derived_metrics
        lines.push('')
        lines.push('【衍生指标】')
        lines.push(`总成本: ${m.total_cost || 0}元`)
        lines.push(`吨汽成本: ${m.cost_per_steam || 0}元/吨`)
        lines.push(`汽损率: ${m.steam_loss_rate || 0}%`)
      }

      wx.showModal({
        title: '记录详情',
        content: lines.join('\n'),
        showCancel: false
      })
    } catch (err) {
      wx.hideLoading()
      console.error('加载详情失败', err)
      wx.showToast({ title: '加载详情失败', icon: 'none' })
    }
  }
})
