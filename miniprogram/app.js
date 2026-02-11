// app.js
App({
  onLaunch() {
    // 云开发初始化 — 创建云环境后替换 env
    if (wx.cloud) {
      wx.cloud.init({
        env: 'YOUR_CLOUD_ENV_ID', // 替换为你的云开发环境 ID
        traceUser: true
      })
    }

    // 全局状态
    this.globalData = {
      userInfo: null,  // { userId, displayName, role, status }
      lastAsset: null  // 最近扫过的设备
    }
  },

  globalData: {
    userInfo: null,
    lastAsset: null
  }
})
