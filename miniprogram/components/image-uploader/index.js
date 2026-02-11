// components/image-uploader/index.js
Component({
  properties: {
    minCount: {
      type: Number,
      value: 1
    },
    maxCount: {
      type: Number,
      value: 9
    },
    value: {
      type: Array,
      value: []  // fileId[] 或 tempFilePath[]
    },
    readonly: {
      type: Boolean,
      value: false
    }
  },

  data: {
    innerFiles: []  // [{ url, fileId, status: 'done'|'uploading'|'error' }]
  },

  observers: {
    'value': function(val) {
      if (!val) return
      // 外部传入的 fileId 列表同步到内部
      const innerFiles = val.map(f => ({
        url: f,
        fileId: f,
        status: 'done'
      }))
      this.setData({ innerFiles })
    }
  },

  methods: {
    onChoose() {
      const remain = this.properties.maxCount - this.data.innerFiles.length
      if (remain <= 0) return

      wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const newFiles = res.tempFiles.map(f => ({
            url: f.tempFilePath,
            fileId: '',
            status: 'uploading'
          }))
          const innerFiles = [...this.data.innerFiles, ...newFiles]
          this.setData({ innerFiles })

          // 逐个上传（Mock 阶段直接用 tempFilePath 当 fileId）
          newFiles.forEach((file, i) => {
            const idx = this.data.innerFiles.length - newFiles.length + i
            this.uploadFile(file.url, idx)
          })
        }
      })
    },

    uploadFile(tempFilePath, idx) {
      // Mock 模式：直接标记完成，用 tempFilePath 当 fileId
      setTimeout(() => {
        const key = `innerFiles[${idx}]`
        this.setData({
          [key + '.status']: 'done',
          [key + '.fileId']: tempFilePath
        })
        this.emitChange()
      }, 500)

      // 真实上传（上线后启用）：
      // wx.cloud.uploadFile({
      //   cloudPath: `replacement_images/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
      //   filePath: tempFilePath,
      //   success: res => {
      //     this.setData({
      //       [`innerFiles[${idx}].status`]: 'done',
      //       [`innerFiles[${idx}].fileId`]: res.fileID
      //     })
      //     this.emitChange()
      //   },
      //   fail: () => {
      //     this.setData({ [`innerFiles[${idx}].status`]: 'error' })
      //   }
      // })
    },

    onRemove(e) {
      const idx = e.currentTarget.dataset.index
      const innerFiles = this.data.innerFiles.filter((_, i) => i !== idx)
      this.setData({ innerFiles })
      this.emitChange()
    },

    onRetry(e) {
      const idx = e.currentTarget.dataset.index
      const file = this.data.innerFiles[idx]
      this.setData({ [`innerFiles[${idx}].status`]: 'uploading' })
      this.uploadFile(file.url, idx)
    },

    onPreview(e) {
      const idx = e.currentTarget.dataset.index
      const urls = this.data.innerFiles.map(f => f.url)
      wx.previewImage({
        current: urls[idx],
        urls
      })
    },

    emitChange() {
      const fileIds = this.data.innerFiles
        .filter(f => f.status === 'done' && f.fileId)
        .map(f => f.fileId)
      this.triggerEvent('change', fileIds)
    }
  }
})
