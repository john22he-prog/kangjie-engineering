const api = require('../../utils/api')
const auth = require('../../utils/auth')

Page({
  data: {
    loading: true,
    allAssets: [],
    selectedIds: {},
    selectedCount: 0,
    submitting: false,
    planName: '日常巡检'
  },

  onLoad() {
    if (!auth.canManage()) {
      wx.showModal({
        title: '无权限',
        content: '仅主管/管理员可配置巡检计划',
        showCancel: false,
        success: () => wx.navigateBack()
      })
      return
    }
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      // 并行加载设备列表和当前巡检计划
      const [assetsResult, planResult] = await Promise.all([
        api.listAssets(),
        api.getInspectionPlan()
      ])

      let allAssets = []
      if (assetsResult.ok) {
        allAssets = assetsResult.data.list || []
      }

      const selectedIds = {}
      if (planResult.ok && planResult.data.plan) {
        const planAssets = planResult.data.assets || []
        planAssets.forEach(a => {
          selectedIds[a.assetId] = true
        })
        this.setData({ planName: planResult.data.plan.planName || '日常巡检' })
      }

      this.setData({
        allAssets,
        selectedIds,
        selectedCount: Object.keys(selectedIds).length,
        loading: false
      })
    } catch (e) {
      console.error('loadData error', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onToggleAsset(e) {
    const assetId = e.currentTarget.dataset.assetid
    const selectedIds = { ...this.data.selectedIds }

    if (selectedIds[assetId]) {
      delete selectedIds[assetId]
    } else {
      selectedIds[assetId] = true
    }

    this.setData({
      selectedIds,
      selectedCount: Object.keys(selectedIds).length
    })
  },

  onSelectAll() {
    const selectedIds = {}
    this.data.allAssets.forEach(a => {
      selectedIds[a.assetId] = true
    })
    this.setData({
      selectedIds,
      selectedCount: Object.keys(selectedIds).length
    })
  },

  onDeselectAll() {
    this.setData({ selectedIds: {}, selectedCount: 0 })
  },

  onPlanNameInput(e) {
    this.setData({ planName: e.detail.value })
  },

  async onSave() {
    const assetIds = Object.keys(this.data.selectedIds)
    if (assetIds.length === 0) {
      wx.showToast({ title: '请至少选择 1 台设备', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      const result = await api.setInspectionPlan({
        assetIds,
        planName: this.data.planName
      })

      this.setData({ submitting: false })

      if (result.ok) {
        wx.showToast({
          title: `已保存（${result.data.assetCount}台设备）`,
          icon: 'success',
          duration: 1500
        })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: result.error.message || '保存失败', icon: 'none' })
      }
    } catch (e) {
      this.setData({ submitting: false })
      console.error('save plan error', e)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    }
  }
})
