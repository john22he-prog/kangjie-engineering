const app = getApp()
const api = require('../../utils/api')

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
    geocodeResult: null
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
      form: { name: '', address: '', city: '', phone: '', contact: '', remark: '' }
    })
  },

  onEdit(e) {
    const hotel = e.currentTarget.dataset.hotel
    this.setData({
      showAddForm: true,
      editingId: hotel._id,
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
    this.setData({ showAddForm: false, editingId: null, geocodeResult: null })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

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
        await api.saveHotel(form)
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
      content: `确定要删除「${hotel.name}」吗？`,
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
