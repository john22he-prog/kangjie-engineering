const app = getApp()
const api = require('../../utils/api')

const POI_TYPES = '100000|120000'

Page({
  data: {
    loading: true,
    hotels: [],
    showAddForm: false,
    submitting: false,
    form: {
      name: '',
      address: '',
      city: '',
      phone: '',
      contact: '',
      remark: ''
    },
    editingId: null,
    geocodeResult: null,

    // POI 搜索建档
    addMode: 'poi',
    poiKeyword: '',
    poiCity: '',
    poiSearching: false,
    poiResults: [],
    selectedPoi: null
  },

  async onLoad() {
    await app.waitForLogin()
    await this.loadHotels()
  },

  async loadHotels() {
    this.setData({ loading: true })
    try {
      const result = await api.listHotels({ status: 'active' })
      this.setData({ hotels: result.list || [], loading: false })
    } catch (err) {
      console.error('[loadHotels]', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  onShowAdd() {
    this.setData({
      showAddForm: true,
      editingId: null,
      geocodeResult: null,
      addMode: 'poi',
      poiKeyword: '',
      poiCity: '',
      poiResults: [],
      selectedPoi: null,
      form: { name: '', address: '', city: '', phone: '', contact: '', remark: '' }
    })
  },

  onEdit(e) {
    const hotel = e.currentTarget.dataset.hotel
    this.setData({
      showAddForm: true,
      addMode: 'manual',
      editingId: hotel._id,
      selectedPoi: null,
      poiResults: [],
      geocodeResult: hotel.latitude ? {
        latitude: hotel.latitude,
        longitude: hotel.longitude,
        formatted_address: hotel.formatted_address
      } : null,
      form: {
        name: hotel.name || '',
        address: hotel.address || '',
        city: hotel.city || '',
        phone: hotel.phone || '',
        contact: hotel.contact || '',
        remark: hotel.remark || ''
      }
    })
  },

  onCancel() {
    this.setData({ showAddForm: false, editingId: null, geocodeResult: null, selectedPoi: null, poiResults: [] })
  },

  onModeChange(e) {
    this.setData({ addMode: e.currentTarget.dataset.mode })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  // ─── POI 搜索建档 ───

  onPoiKeywordInput(e) {
    this.setData({ poiKeyword: e.detail.value })
  },

  onPoiCityInput(e) {
    this.setData({ poiCity: e.detail.value })
  },

  async onSearchPoi() {
    const { poiKeyword, poiCity } = this.data
    if (!poiKeyword.trim()) {
      wx.showToast({ title: '请输入名称关键词', icon: 'none' })
      return
    }
    this.setData({ poiSearching: true, poiResults: [] })
    try {
      const result = await api.searchPOI({
        keywords: poiKeyword,
        city: poiCity,
        types: POI_TYPES,
        pageSize: 20
      })
      this.setData({ poiResults: result.pois || [], poiSearching: false })
      if (!result.pois || result.pois.length === 0) {
        wx.showToast({ title: '未搜到相关POI，可改用手动录入', icon: 'none' })
      }
    } catch (err) {
      console.error('[onSearchPoi]', err)
      wx.showToast({ title: err.message || '搜索失败', icon: 'none' })
      this.setData({ poiSearching: false })
    }
  },

  async onPickPoi(e) {
    const poi = e.currentTarget.dataset.poi
    this.setData({ selectedPoi: poi })

    wx.showModal({
      title: '确认建档',
      content: `将「${poi.name}」录入为内部客户？\n地址：${poi.address || '—'}`,
      confirmText: '建档',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ submitting: true })
        wx.showLoading({ title: '建档中...' })
        try {
          await api.saveHotelFromPOI({ poi })
          wx.hideLoading()
          wx.showToast({ title: '建档成功', icon: 'success' })
          this.setData({ showAddForm: false, submitting: false, selectedPoi: null, poiResults: [] })
          await this.loadHotels()
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message || '建档失败', icon: 'none' })
          this.setData({ submitting: false })
        }
      }
    })
  },

  // ─── 手动/地址录入（地理编码兜底） ───

  async onTestGeocode() {
    const { address, city } = this.data.form
    if (!address) {
      wx.showToast({ title: '请先输入地址', icon: 'none' })
      return
    }
    wx.showLoading({ title: '解析地址...' })
    try {
      const result = await api.geocode(address, city)
      this.setData({ geocodeResult: result })
      wx.hideLoading()
      wx.showToast({ title: '地址解析成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '地址解析失败', icon: 'none' })
      this.setData({ geocodeResult: null })
    }
  },

  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        if (res.name || res.address) {
          this.setData({
            'form.address': res.address || res.name,
            geocodeResult: {
              latitude: res.latitude,
              longitude: res.longitude,
              formatted_address: res.address || res.name
            }
          })
        }
      }
    })
  },

  async onSubmit() {
    const { form, editingId } = this.data
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入酒店名称', icon: 'none' })
      return
    }
    if (!form.address.trim()) {
      wx.showToast({ title: '请输入酒店地址', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '保存中...' })

    try {
      if (editingId) {
        await api.updateHotel({ hotelId: editingId, ...form })
      } else {
        const res = await api.saveHotel(form)
        if (res && res.warning) {
          wx.hideLoading()
          wx.showModal({ title: '已保存（提醒）', content: res.warning, showCancel: false })
        }
      }
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.setData({ showAddForm: false, submitting: false, editingId: null })
      await this.loadHotels()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
      this.setData({ submitting: false })
    }
  },

  onDelete(e) {
    const hotel = e.currentTarget.dataset.hotel
    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${hotel.name}」吗？将同时解除其POI绑定。`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.deleteHotel(hotel._id)
          wx.showToast({ title: '已删除', icon: 'success' })
          await this.loadHotels()
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  onCallPhone(e) {
    const phone = e.currentTarget.dataset.phone
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone })
    }
  }
})
