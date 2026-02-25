const api = require('../../utils/api')

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const METRIC_OPTIONS = [
  { key: 'total_steam_production', label: '总产汽量', unit: '吨' },
  { key: 'total_cost', label: '能源总成本', unit: '元' },
  { key: 'total_electricity', label: '总用电量', unit: '度' },
  { key: 'steam_loss_rate', label: '汽损率', unit: '%' },
  { key: 'cost_per_steam', label: '吨汽成本', unit: '元/吨' },
  { key: 'fuel_stock_estimate', label: '燃料库存', unit: '吨' },
  { key: 'fuel_stock_days', label: '库存可用天数', unit: '天' }
]

const RANGE_OPTIONS = [
  { label: '近7天', days: 7 },
  { label: '近14天', days: 14 },
  { label: '近30天', days: 30 }
]

Page({
  data: {
    loading: true,
    metricOptions: METRIC_OPTIONS,
    metricIndex: 0,
    rangeOptions: RANGE_OPTIONS,
    rangeIndex: 0,
    currentMetric: METRIC_OPTIONS[0],
    trendData: [],
    maxValue: 0,
    factoryId: null
  },

  async onLoad() {
    try {
      const res = await api.checkLogin()
      if (res && res.isRegistered && res.user) {
        this.setData({ factoryId: res.user.factory_id })
      }
    } catch (e) {
      console.error('获取用户失败', e)
    }
    this.loadTrend()
  },

  onMetricChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      metricIndex: idx,
      currentMetric: METRIC_OPTIONS[idx]
    })
    this.loadTrend()
  },

  onRangeChange(e) {
    const idx = Number(e.detail.value)
    this.setData({ rangeIndex: idx })
    this.loadTrend()
  },

  async loadTrend() {
    this.setData({ loading: true })

    const range = RANGE_OPTIONS[this.data.rangeIndex]
    const metric = METRIC_OPTIONS[this.data.metricIndex]

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - range.days)

    try {
      const result = await api.getTrend({
        factoryId: this.data.factoryId,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        metric: metric.key
      })

      const data = Array.isArray(result) ? result : []

      let maxValue = 0
      data.forEach(d => {
        if (d.value != null && d.value > maxValue) maxValue = d.value
      })
      if (maxValue === 0) maxValue = 1

      const trendData = data.map(d => ({
        date: d.date ? d.date.substring(5) : '--',
        fullDate: d.date || '',
        value: d.value != null ? d.value : null,
        displayValue: d.value != null ? Number(d.value).toFixed(1) : '--',
        barHeight: d.value != null ? Math.max(4, (d.value / maxValue) * 100) : 0
      }))

      this.setData({
        trendData,
        maxValue: Number(maxValue).toFixed(1),
        loading: false
      })
    } catch (err) {
      console.error('加载趋势数据失败', err)
      this.setData({ loading: false, trendData: [] })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onTapBar(e) {
    const item = e.currentTarget.dataset.item
    if (!item || item.value == null) return
    wx.showToast({
      title: `${item.fullDate}\n${item.displayValue} ${this.data.currentMetric.unit}`,
      icon: 'none',
      duration: 2000
    })
  }
})
