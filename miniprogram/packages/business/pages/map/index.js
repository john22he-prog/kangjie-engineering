const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    loading: true,
    hotels: [],
    markers: [],
    latitude: 25.0389,
    longitude: 102.7183,
    scale: 12,
    selectedHotel: null,
    showDetail: false
  },

  async onLoad() {
    await app.waitForLogin()
    await this.loadHotels()
  },

  async onShow() {
    if (!this.data.loading) {
      await this.loadHotels()
    }
  },

  onPullDownRefresh() {
    this.loadHotels().then(() => wx.stopPullDownRefresh())
  },

  async loadHotels() {
    this.setData({ loading: true })
    try {
      const result = await api.listHotels({ status: 'active' })
      const hotels = result.list || []
      const markers = hotels
        .filter(h => h.latitude && h.longitude)
        .map((h, idx) => ({
          id: idx,
          hotelId: h._id,
          latitude: h.latitude,
          longitude: h.longitude,
          title: h.name,
          width: 32,
          height: 32,
          callout: {
            content: h.name,
            color: '#333333',
            fontSize: 14,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#07C160',
            bgColor: '#ffffff',
            padding: 8,
            display: 'BYCLICK',
            textAlign: 'center'
          },
          anchor: { x: 0.5, y: 1 }
        }))

      let lat = this.data.latitude
      let lng = this.data.longitude
      if (markers.length > 0) {
        lat = markers.reduce((s, m) => s + m.latitude, 0) / markers.length
        lng = markers.reduce((s, m) => s + m.longitude, 0) / markers.length
      }

      this.setData({
        hotels,
        markers,
        latitude: lat,
        longitude: lng,
        loading: false
      })
    } catch (err) {
      console.error('[loadHotels]', err)
      wx.showToast({ title: '加载酒店失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  onMarkerTap(e) {
    const markerId = e.markerId
    const marker = this.data.markers[markerId]
    if (!marker) return
    const hotel = this.data.hotels.find(h => h._id === marker.hotelId)
    if (hotel) {
      this.setData({ selectedHotel: hotel, showDetail: true })
    }
  },

  onCalloutTap(e) {
    this.onMarkerTap(e)
  },

  onCloseDetail() {
    this.setData({ showDetail: false, selectedHotel: null })
  },

  onNavigateTo() {
    const hotel = this.data.selectedHotel
    if (!hotel) return
    wx.openLocation({
      latitude: hotel.latitude,
      longitude: hotel.longitude,
      name: hotel.name,
      address: hotel.address,
      scale: 18
    })
  },

  onGoManage() {
    wx.navigateTo({ url: '/packages/business/pages/hotel-manage/index' })
  },

  onGoAreaMap() {
    wx.navigateTo({ url: '/packages/business/pages/area-map/index' })
  },

  onIncludePoints() {
    if (this.data.markers.length === 0) return
    const mapCtx = wx.createMapContext('hotelMap', this)
    mapCtx.includePoints({
      points: this.data.markers.map(m => ({
        latitude: m.latitude,
        longitude: m.longitude
      })),
      padding: [80, 80, 80, 80]
    })
  }
})
