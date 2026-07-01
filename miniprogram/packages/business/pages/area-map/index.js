const app = getApp()
const api = require('../../utils/api')
const auth = require('../../../../utils/auth')
const { PERMISSIONS } = require('../../../../utils/permissions')

const POI_TYPES = '100000|120000'

Page({
  data: {
    loading: false,
    latitude: 25.0389,
    longitude: 102.7183,
    scale: 13,
    markers: [],
    polygons: [],

    // 搜索
    searchKeywords: '酒店',
    searchCity: '',
    searchRadius: 3000,
    searchMode: 'center',

    // 绘制区域
    drawingMode: false,
    drawPoints: [],
    polyline: [],

    // POI 结果
    pois: [],
    poiTotal: 0,
    poiMarkers: [],
    stats: { total: 0, bound: 0, suggested: 0, unmatched: 0 },

    // 分页
    currentPage: 1,
    hasMore: false,
    loadingMore: false,

    // 我方客户图层（盲区）
    showHotelLayer: false,
    hotelLayer: [],
    hotelMarkers: [],
    blindCount: 0,

    // 详情面板
    showDetail: false,
    selectedPoi: null,
    suggestThreshold: 0.55,

    // 底部列表
    showList: false,
    activeTab: 'all',
    filteredPois: [],

    // 搜索设置面板
    showSettings: false,

    canManage: false
  },

  async onLoad() {
    await app.waitForLogin()
    if (!auth.hasPermission(PERMISSIONS.MODULE_BUSINESS)) {
      wx.showModal({
        title: '无权限',
        content: '您没有业务部访问权限，请联系管理员',
        showCancel: false,
        success: () => wx.navigateBack({ delta: 1, fail: () => wx.reLaunch({ url: '/pages/company/index' }) })
      })
      return
    }
    this.setData({ canManage: auth.hasPermission(PERMISSIONS.BUSINESS_MANAGE) })
    this._getUserLocation()
  },

  _getUserLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude
        })
      }
    })
  },

  // ─── 搜索设置 ───

  onToggleSettings() {
    this.setData({ showSettings: !this.data.showSettings })
  },

  onKeywordsInput(e) {
    this.setData({ searchKeywords: e.detail.value })
  },

  onCityInput(e) {
    this.setData({ searchCity: e.detail.value })
  },

  onRadiusChange(e) {
    this.setData({ searchRadius: parseInt(e.detail.value, 10) || 3000 })
  },

  onThresholdChange(e) {
    this.setData({ suggestThreshold: parseFloat(e.detail.value) || 0.55 })
  },

  onModeChange(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ searchMode: mode })
    if (mode === 'draw') {
      this.setData({ drawingMode: true, drawPoints: [], polyline: [], polygons: [] })
      wx.showToast({ title: '请在地图上点选区域顶点', icon: 'none', duration: 2000 })
    } else {
      this.setData({ drawingMode: false, drawPoints: [], polyline: [] })
    }
  },

  // ─── 区域绘制 ───

  onMapTap(e) {
    if (!this.data.drawingMode) return
    const { latitude, longitude } = e.detail
    const points = [...this.data.drawPoints, { latitude, longitude }]

    const polyline = points.length >= 2 ? [{
      points: [...points, points[0]],
      color: '#409EFF',
      width: 3,
      dottedLine: points.length < 3
    }] : []

    const drawMarkers = points.map((p, idx) => ({
      id: 10000 + idx,
      latitude: p.latitude,
      longitude: p.longitude,
      width: 16,
      height: 16,
      anchor: { x: 0.5, y: 0.5 },
      callout: {
        content: `${idx + 1}`,
        color: '#fff',
        fontSize: 12,
        borderRadius: 10,
        bgColor: '#409EFF',
        padding: 4,
        display: 'ALWAYS'
      }
    }))

    this.setData({
      drawPoints: points,
      polyline,
      markers: drawMarkers
    })
  },

  onUndoPoint() {
    const points = this.data.drawPoints.slice(0, -1)

    const polyline = points.length >= 2 ? [{
      points: [...points, points[0]],
      color: '#409EFF',
      width: 3,
      dottedLine: points.length < 3
    }] : []

    const drawMarkers = points.map((p, idx) => ({
      id: 10000 + idx,
      latitude: p.latitude,
      longitude: p.longitude,
      width: 16,
      height: 16,
      anchor: { x: 0.5, y: 0.5 },
      callout: {
        content: `${idx + 1}`,
        color: '#fff',
        fontSize: 12,
        borderRadius: 10,
        bgColor: '#409EFF',
        padding: 4,
        display: 'ALWAYS'
      }
    }))

    this.setData({ drawPoints: points, polyline, markers: drawMarkers })
  },

  onClearDraw() {
    this.setData({
      drawPoints: [],
      polyline: [],
      polygons: [],
      markers: [],
      poiMarkers: [],
      hotelMarkers: [],
      pois: [],
      filteredPois: [],
      hotelLayer: [],
      blindCount: 0,
      hasMore: false,
      stats: { total: 0, bound: 0, suggested: 0, unmatched: 0 }
    })
  },

  onFinishDraw() {
    if (this.data.drawPoints.length < 3) {
      wx.showToast({ title: '至少需要3个顶点', icon: 'none' })
      return
    }
    const points = this.data.drawPoints
    this.setData({
      drawingMode: false,
      polyline: [],
      polygons: [{
        points,
        strokeColor: '#409EFF',
        strokeWidth: 3,
        fillColor: '#409EFF33'
      }]
    })
    this._doSearch()
  },

  // ─── 搜索执行 ───

  onSearch() {
    if (this.data.searchMode === 'draw' && this.data.drawPoints.length >= 3) {
      this.onFinishDraw()
    } else if (this.data.searchMode === 'center') {
      this._doSearch()
    }
  },

  _buildSearchParams(page) {
    const { searchKeywords, searchCity, searchRadius, searchMode, drawPoints, suggestThreshold } = this.data
    const params = {
      keywords: searchKeywords,
      city: searchCity,
      types: POI_TYPES,
      suggestThreshold,
      page,
      pageSize: 25
    }
    if (searchMode === 'draw' && drawPoints.length >= 3) {
      params.polygon = drawPoints.map(p => `${p.longitude},${p.latitude}`).join('|')
    } else {
      params.location = `${this.data.longitude},${this.data.latitude}`
      params.radius = searchRadius
    }
    return params
  },

  _poiMarker(p, idx) {
    let bgColor = '#999'
    if (p.matchStatus === 'bound') bgColor = '#07C160'
    else if (p.matchStatus === 'suggested') bgColor = '#E6A23C'
    return {
      id: idx,
      latitude: p.latitude,
      longitude: p.longitude,
      title: p.name,
      width: 28,
      height: 36,
      anchor: { x: 0.5, y: 1 },
      callout: {
        content: this._getCalloutText(p),
        color: '#333', fontSize: 12, borderRadius: 8,
        borderWidth: 1, borderColor: bgColor, bgColor: '#fff',
        padding: 6, display: 'BYCLICK', textAlign: 'left'
      }
    }
  },

  // 我方客户图层标记（盲区客户用紫色突出）
  _buildHotelMarkers(hotelLayer) {
    if (!this.data.showHotelLayer) return []
    return (hotelLayer || [])
      .filter(h => !h.matchedHere)
      .map((h, i) => ({
        id: 50000 + i,
        latitude: h.latitude,
        longitude: h.longitude,
        width: 22,
        height: 22,
        anchor: { x: 0.5, y: 0.5 },
        callout: {
          content: (h.bound ? '🔒 ' : '🏠 ') + h.name + (h.bound ? '' : '（盲区）'),
          color: '#fff', fontSize: 12, borderRadius: 8,
          bgColor: h.bound ? '#909399' : '#8E44AD',
          padding: 6, display: 'BYCLICK', textAlign: 'left'
        }
      }))
  },

  _syncMarkers() {
    this.setData({ markers: [...this.data.poiMarkers, ...this.data.hotelMarkers] })
  },

  async _doSearch() {
    if (!this.data.searchKeywords) {
      wx.showToast({ title: '请输入搜索关键词', icon: 'none' })
      return
    }
    this.setData({ loading: true, showSettings: false, currentPage: 1 })
    wx.showLoading({ title: '搜索匹配中...' })
    try {
      const result = await api.searchAndMatch(this._buildSearchParams(1))
      const pois = result.pois || []
      const poiMarkers = pois.filter(p => p.latitude && p.longitude).map((p, idx) => this._poiMarker(p, idx))
      const hotelLayer = result.hotelLayer || []

      this.setData({
        pois,
        poiTotal: result.total || 0,
        stats: result.stats || { total: 0, bound: 0, suggested: 0, unmatched: 0 },
        poiMarkers,
        hotelLayer,
        blindCount: result.blindCount || 0,
        hasMore: pois.length < (result.total || 0),
        loading: false
      })
      this.setData({ hotelMarkers: this._buildHotelMarkers(hotelLayer) })
      this._syncMarkers()
      this._refreshFiltered()
      wx.hideLoading()

      const { bound, suggested } = result.stats || {}
      wx.showToast({
        title: `${pois.length}条 | 已绑${bound} 建议${suggested} 盲区${result.blindCount || 0}`,
        icon: 'none',
        duration: 2500
      })
    } catch (err) {
      wx.hideLoading()
      console.error('[_doSearch]', err)
      wx.showToast({ title: err.message || '搜索失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  async onLoadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return
    const nextPage = this.data.currentPage + 1
    this.setData({ loadingMore: true })
    try {
      const result = await api.searchAndMatch(this._buildSearchParams(nextPage))
      const newPois = result.pois || []
      const merged = [...this.data.pois, ...newPois]
      const poiMarkers = merged.filter(p => p.latitude && p.longitude).map((p, idx) => this._poiMarker(p, idx))
      this.setData({
        pois: merged,
        poiMarkers,
        currentPage: nextPage,
        stats: result.stats || this.data.stats,
        hotelLayer: result.hotelLayer || this.data.hotelLayer,
        blindCount: result.blindCount || this.data.blindCount,
        hasMore: merged.length < (result.total || 0),
        loadingMore: false
      })
      this.setData({ hotelMarkers: this._buildHotelMarkers(this.data.hotelLayer) })
      this._syncMarkers()
      this._refreshFiltered()
    } catch (err) {
      console.error('[onLoadMore]', err)
      wx.showToast({ title: '加载更多失败', icon: 'none' })
      this.setData({ loadingMore: false })
    }
  },

  onToggleHotelLayer() {
    const next = !this.data.showHotelLayer
    this.setData({ showHotelLayer: next })
    this.setData({ hotelMarkers: this._buildHotelMarkers(this.data.hotelLayer) })
    this._syncMarkers()
  },

  _getCalloutText(poi) {
    let text = poi.name
    if (poi.matchStatus === 'bound') {
      text += `\n✅ 已绑定: ${poi.boundHotelName}`
    } else if (poi.matchStatus === 'suggested') {
      text += `\n🟡 建议匹配: ${poi.suggestedHotelName}`
      text += `\n匹配度: ${Math.round(poi.matchScore.total * 100)}%`
    } else {
      text += '\n⚪ 未匹配'
    }
    return text
  },

  // ─── 标记/列表交互 ───

  onMarkerTap(e) {
    const idx = e.markerId
    if (idx >= 50000) return // 我方客户图层标记，仅展示 callout
    const poi = this.data.pois[idx]
    if (poi) {
      this.setData({ selectedPoi: poi, showDetail: true })
    }
  },

  onCalloutTap(e) {
    this.onMarkerTap(e)
  },

  onCloseDetail() {
    this.setData({ showDetail: false, selectedPoi: null })
  },

  onToggleList() {
    this.setData({ showList: !this.data.showList })
  },

  onTabChange(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
    this._refreshFiltered()
  },

  onSelectPoi(e) {
    const idx = e.currentTarget.dataset.index
    const poi = this.data.pois[idx]
    if (poi) {
      this.setData({
        selectedPoi: poi,
        showDetail: true,
        showList: false,
        latitude: poi.latitude,
        longitude: poi.longitude,
        scale: 16
      })
    }
  },

  // ─── 绑定操作 ───

  async onConfirmBind() {
    const poi = this.data.selectedPoi
    if (!poi) return

    if (poi.matchStatus === 'unmatched' && poi.bestCandidateTaken) {
      wx.showToast({ title: '最佳候选已被占用（1:1）', icon: 'none' })
      return
    }

    const hotelId = poi.matchStatus === 'suggested' ? poi.suggestedHotelId : poi.bestCandidateId
    const hotelName = poi.matchStatus === 'suggested' ? poi.suggestedHotelName : poi.bestCandidateName

    if (!hotelId) {
      wx.showToast({ title: '没有可绑定的内部客户', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认绑定',
      content: `将高德POI「${poi.name}」绑定到内部客户「${hotelName}」？`,
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '绑定中...' })
        try {
          await api.bindPOI({
            poiId: poi.id,
            poiName: poi.name,
            hotelId,
            hotelName,
            poiData: {
              name: poi.name,
              address: poi.address,
              tel: poi.tel,
              latitude: poi.latitude,
              longitude: poi.longitude
            }
          })
          wx.hideLoading()
          wx.showToast({ title: '绑定成功', icon: 'success' })
          this.setData({ showDetail: false })
          this._doSearch()
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message || '绑定失败', icon: 'none' })
        }
      }
    })
  },

  async onUnbind() {
    const poi = this.data.selectedPoi
    if (!poi || poi.matchStatus !== 'bound') return

    wx.showModal({
      title: '确认解绑',
      content: `确定要解除「${poi.name}」和「${poi.boundHotelName}」的绑定？`,
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '解绑中...' })
        try {
          await api.unbindPOI({
            poiId: poi.id,
            bindingId: poi.bindingId
          })
          wx.hideLoading()
          wx.showToast({ title: '已解绑', icon: 'success' })
          this.setData({ showDetail: false })
          this._doSearch()
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message || '解绑失败', icon: 'none' })
        }
      }
    })
  },

  onNavigateTo() {
    const poi = this.data.selectedPoi
    if (!poi) return
    wx.openLocation({
      latitude: poi.latitude,
      longitude: poi.longitude,
      name: poi.name,
      address: poi.address,
      scale: 18
    })
  },

  onCallPhone() {
    const poi = this.data.selectedPoi
    if (poi && poi.tel) {
      const phone = poi.tel.split(';')[0].split(',')[0]
      wx.makePhoneCall({ phoneNumber: phone })
    }
  },

  // ─── 全部显示 ───

  onGoReview() {
    wx.navigateTo({ url: '/packages/business/pages/match-review/index' })
  },

  onFitMarkers() {
    if (this.data.markers.length === 0) return
    const mapCtx = wx.createMapContext('areaMap', this)
    mapCtx.includePoints({
      points: this.data.markers.map(m => ({
        latitude: m.latitude,
        longitude: m.longitude
      })),
      padding: [80, 80, 80, 80]
    })
  },

  _refreshFiltered() {
    const { pois, activeTab } = this.data
    const filteredPois = activeTab === 'all'
      ? pois
      : pois.filter(p => p.matchStatus === activeTab)
    this.setData({ filteredPois })
  }
})
