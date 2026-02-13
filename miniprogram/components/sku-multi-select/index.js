// components/sku-multi-select/index.js
const MAX_QTY = 999  // 单次更换数量上限

Component({
  properties: {
    availableSkus: {
      type: Array,
      value: []  // [{ partSkuId, partName, partCode, unit }]
    },
    value: {
      type: Array,
      value: []  // [{ partSkuId, qty }]
    },
    readonly: {
      type: Boolean,
      value: false
    }
  },

  data: {
    innerValue: [],   // [{ partSkuId, partName, partCode, unit, qty }]
    showPicker: false,
    pickerItems: [],
    selectedCount: 0
  },

  observers: {
    'availableSkus, value': function(skus, val) {
      this.rebuildInnerValue(skus, val)
    }
  },

  methods: {
    rebuildInnerValue(skus, val) {
      if (!skus || !val) return
      const inner = val.map(v => {
        const sku = skus.find(s => s.partSkuId === v.partSkuId)
        return {
          partSkuId: v.partSkuId,
          partName: sku ? sku.partName : v.partSkuId,
          partCode: sku ? sku.partCode : '',
          unit: sku ? sku.unit : '个',
          qty: v.qty || 1
        }
      })
      this.setData({ innerValue: inner, selectedCount: inner.length })
    },

    openPicker() {
      const selectedIds = this.data.innerValue.map(v => v.partSkuId)
      const pickerItems = this.properties.availableSkus.map(sku => ({
        ...sku,
        selected: selectedIds.includes(sku.partSkuId)
      }))
      this.setData({ showPicker: true, pickerItems })
    },

    closePicker() {
      // 根据 picker 选择结果更新 value
      const selected = this.data.pickerItems.filter(p => p.selected)
      const oldMap = {}
      this.data.innerValue.forEach(v => { oldMap[v.partSkuId] = v.qty })

      const newValue = selected.map(s => ({
        partSkuId: s.partSkuId,
        qty: oldMap[s.partSkuId] || 1
      }))

      this.setData({ showPicker: false })
      this.triggerEvent('change', newValue)
    },

    toggleItem(e) {
      const idx = e.currentTarget.dataset.index
      const key = `pickerItems[${idx}].selected`
      this.setData({ [key]: !this.data.pickerItems[idx].selected })
    },

    onQtyInput(e) {
      const idx = e.currentTarget.dataset.index
      let qty = parseInt(e.detail.value)
      if (isNaN(qty) || qty < 1) qty = 1
      if (qty > MAX_QTY) qty = MAX_QTY
      const newValue = this.data.innerValue.map((v, i) => ({
        partSkuId: v.partSkuId,
        qty: i === idx ? qty : v.qty
      }))
      this.triggerEvent('change', newValue)
    },

    onPlus(e) {
      const idx = e.currentTarget.dataset.index
      const current = this.data.innerValue[idx].qty
      if (current >= MAX_QTY) return
      const newValue = this.data.innerValue.map((v, i) => ({
        partSkuId: v.partSkuId,
        qty: i === idx ? v.qty + 1 : v.qty
      }))
      this.triggerEvent('change', newValue)
    },

    onMinus(e) {
      const idx = e.currentTarget.dataset.index
      const current = this.data.innerValue[idx].qty
      if (current <= 1) return
      const newValue = this.data.innerValue.map((v, i) => ({
        partSkuId: v.partSkuId,
        qty: i === idx ? v.qty - 1 : v.qty
      }))
      this.triggerEvent('change', newValue)
    },

    onRemove(e) {
      const idx = e.currentTarget.dataset.index
      const newValue = this.data.innerValue
        .filter((_, i) => i !== idx)
        .map(v => ({ partSkuId: v.partSkuId, qty: v.qty }))
      this.triggerEvent('change', newValue)
    }
  }
})
