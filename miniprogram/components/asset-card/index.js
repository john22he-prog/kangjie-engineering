// components/asset-card/index.js
Component({
  properties: {
    asset: {
      type: Object,
      value: null
    },
    clickable: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onTap() {
      if (this.properties.clickable) {
        this.triggerEvent('tap', this.properties.asset)
      }
    }
  }
})
