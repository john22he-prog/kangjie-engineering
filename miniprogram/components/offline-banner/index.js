// components/offline-banner/index.js
Component({
  properties: {
    count: {
      type: Number,
      value: 0
    },
    syncing: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onSyncTap() {
      this.triggerEvent('sync')
    }
  }
})
