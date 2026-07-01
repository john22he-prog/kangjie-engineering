const app = getApp()
const api = require('../../utils/api')
const auth = require('../../../../utils/auth')
const { PERMISSIONS } = require('../../../../utils/permissions')

Page({
  data: {
    loading: true,
    accepting: false,
    results: [],
    stats: { total: 0, matched: 0, high: 0 },
    suggestThreshold: 0.55
  },

  async onLoad() {
    await app.waitForLogin()
    if (!auth.hasPermission(PERMISSIONS.BUSINESS_MANAGE)) {
      wx.showModal({
        title: '无权限',
        content: '您没有业务部管理权限，无法进行匹配复核',
        showCancel: false,
        success: () => wx.navigateBack({ delta: 1, fail: () => wx.reLaunch({ url: '/pages/company/index' }) })
      })
      return
    }
    await this.loadReview()
  },

  onPullDownRefresh() {
    this.loadReview().then(() => wx.stopPullDownRefresh())
  },

  async loadReview() {
    this.setData({ loading: true })
    wx.showLoading({ title: '批量匹配中...' })
    try {
      const data = await api.batchMatch({ suggestThreshold: this.data.suggestThreshold })
      const results = (data.results || []).map(r => ({
        ...r,
        scorePct: r.matchScore ? Math.round(r.matchScore.total * 100) : 0,
        accepted: false,
        ignored: false
      }))
      const high = results.filter(r => r.matchLevel === 'high').length
      this.setData({
        results,
        stats: { total: data.total || results.length, matched: data.matched || 0, high },
        loading: false
      })
      wx.hideLoading()
      if (results.length === 0) {
        wx.showToast({ title: data.message || '没有待匹配客户', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[loadReview]', err)
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async _bindOne(row) {
    await api.bindPOI({
      poiId: row.bestPoi.id,
      poiName: row.bestPoi.name,
      hotelId: row.hotelId,
      hotelName: row.hotelName,
      poiData: row.bestPoi
    })
  },

  async onAccept(e) {
    const idx = e.currentTarget.dataset.index
    const row = this.data.results[idx]
    if (!row || !row.bestPoi) return
    wx.showLoading({ title: '绑定中...' })
    try {
      await this._bindOne(row)
      wx.hideLoading()
      wx.showToast({ title: '已绑定', icon: 'success' })
      this.setData({ [`results[${idx}].accepted`]: true })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '绑定失败', icon: 'none' })
    }
  },

  onIgnore(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ [`results[${idx}].ignored`]: true })
  },

  onAcceptAllHigh() {
    const targets = this.data.results
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.matchLevel === 'high' && !r.accepted && !r.ignored && r.bestPoi)

    if (targets.length === 0) {
      wx.showToast({ title: '没有可一键接受的高分建议', icon: 'none' })
      return
    }

    wx.showModal({
      title: '一键接受高分建议',
      content: `将自动绑定 ${targets.length} 条匹配度≥80% 的建议，确认继续？`,
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ accepting: true })
        wx.showLoading({ title: `0/${targets.length}` })
        let done = 0, failed = 0
        for (const { r, i } of targets) {
          try {
            await this._bindOne(r)
            this.setData({ [`results[${i}].accepted`]: true })
          } catch (e) {
            failed++
          }
          done++
          wx.showLoading({ title: `${done}/${targets.length}` })
        }
        wx.hideLoading()
        this.setData({ accepting: false })
        wx.showToast({
          title: `完成：成功${done - failed}${failed ? `，失败${failed}` : ''}`,
          icon: 'none'
        })
      }
    })
  }
})
