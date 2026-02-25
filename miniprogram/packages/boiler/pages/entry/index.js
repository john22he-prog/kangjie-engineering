const api = require('../../utils/api')
const notification = require('../../../../utils/notification')

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

Page({
  data: {
    loading: true,
    user: null,
    authorized: false,
    selectedDate: '',
    dateIndex: 0,
    dateOptions: [],
    factory: null,
    boilers: [],
    customers: [],
    formData: {
      total_water: '',
      total_fuel_consumed: '',
      fuel_intake: '',
      remark: '',
      boiler_data: [],
      customer_data: []
    },
    submitting: false
  },

  onLoad() {
    this._initDateOptions()
    this._checkLoginAndLoad()
  },

  _initDateOptions() {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const dateOptions = [
      { label: '今天 (' + formatDate(today) + ')', value: formatDate(today) },
      { label: '昨天 (' + formatDate(yesterday) + ')', value: formatDate(yesterday) }
    ]
    this.setData({
      dateOptions,
      selectedDate: dateOptions[0].value,
      dateIndex: 0
    })
  },

  async _checkLoginAndLoad() {
    try {
      const res = await api.checkLogin()
      if (!res || !res.isRegistered || !res.user) {
        this.setData({ loading: false, authorized: false, user: null })
        return
      }
      const user = res.user
      if (user.role !== 'operator' && user.role !== 'admin') {
        this.setData({ loading: false, authorized: false, user })
        return
      }
      this.setData({ user, authorized: true })
      await this._loadBoilersAndCustomers(user.factory_id)
    } catch (err) {
      console.error('登录检查失败', err)
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async _loadBoilersAndCustomers(factoryId) {
    if (!factoryId) return
    try {
      const [boilers, customers] = await Promise.all([
        api.listBoilers(factoryId),
        api.listCustomers(factoryId)
      ])
      const boilerList = Array.isArray(boilers) ? boilers : (boilers.list || [])
      const customerList = Array.isArray(customers) ? customers : (customers.list || [])
      const boiler_data = boilerList.map(b => ({
        boiler_id: b.id,
        name: b.name,
        electricity: '',
        steam_production: '',
        start_time: '',
        end_time: ''
      }))
      const customer_data = customerList.map(c => ({
        customer_id: c.id,
        name: c.name,
        steam_usage: '',
        remark: ''
      }))
      this.setData({
        boilers: boilerList,
        customers: customerList,
        'formData.boiler_data': boiler_data,
        'formData.customer_data': customer_data
      })
    } catch (err) {
      console.error('加载锅炉/客户数据失败', err)
      wx.showToast({ title: '加载数据失败', icon: 'none' })
    }
  },

  onDateChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      dateIndex: idx,
      selectedDate: this.data.dateOptions[idx].value
    })
  },

  onBoilerInput(e) {
    const { index, field } = e.currentTarget.dataset
    this.setData({ [`formData.boiler_data[${index}].${field}`]: e.detail.value })
  },

  onBoilerTimeChange(e) {
    const { index, field } = e.currentTarget.dataset
    this.setData({ [`formData.boiler_data[${index}].${field}`]: e.detail.value })
  },

  onCustomerInput(e) {
    const { index, field } = e.currentTarget.dataset
    this.setData({ [`formData.customer_data[${index}].${field}`]: e.detail.value })
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`formData.${field}`]: e.detail.value })
  },

  _validate() {
    if (!this.data.selectedDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return false
    }
    const hasBoilerData = this.data.formData.boiler_data.some(
      b => b.electricity || b.steam_production || b.start_time || b.end_time
    )
    if (!hasBoilerData) {
      wx.showToast({ title: '请至少填写一台锅炉的数据', icon: 'none' })
      return false
    }
    return true
  },

  async onSubmit() {
    if (this.data.submitting) return
    if (!this._validate()) return

    // 提交前静默获取推送额度
    await notification.preSubscribeForBoilerDaily()

    this.setData({ submitting: true })
    try {
      const payload = {
        record_date: this.data.selectedDate,
        factory_id: this.data.user.factory_id,
        total_water: this.data.formData.total_water || 0,
        total_fuel_consumed: this.data.formData.total_fuel_consumed || 0,
        fuel_intake: this.data.formData.fuel_intake || 0,
        boiler_data: this.data.formData.boiler_data
          .filter(b => b.electricity || b.steam_production || b.start_time || b.end_time)
          .map(b => ({
            boiler_id: b.boiler_id,
            electricity: b.electricity || 0,
            steam_production: b.steam_production || 0,
            start_time: b.start_time || null,
            end_time: b.end_time || null,
            remark: ''
          })),
        customer_data: this.data.formData.customer_data
          .filter(c => c.steam_usage)
          .map(c => ({
            customer_id: c.customer_id,
            steam_usage: c.steam_usage || 0,
            remark: c.remark || ''
          }))
      }
      await api.createRecord(payload)
      wx.showToast({ title: '提交成功', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: '/packages/boiler/pages/home/index' })
      }, 1500)
    } catch (err) {
      console.error('提交失败', err)
      wx.showToast({ title: err.message || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
