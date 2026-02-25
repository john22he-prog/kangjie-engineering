Component({
  properties: {
    active: {
      type: Number,
      value: 0
    }
  },

  methods: {
    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (index === this.data.active) return

      const paths = [
        '/packages/boiler/pages/home/index',
        '/packages/boiler/pages/entry/index',
        '/packages/boiler/pages/me/index'
      ]

      wx.redirectTo({ url: paths[index] })
    }
  }
})
