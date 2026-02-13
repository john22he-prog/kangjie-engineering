// pages/data-manage/index.js
const api = require('../../utils/api')
const { getCurrentYearMonth } = require('../../utils/util')

// 是否使用 Mock（与 api.js 保持一致，正式上线为 false）
const USE_MOCK = false

// 模板表头定义
const TEMPLATES = {
  parts: {
    filename: '配件字典导入模板.csv',
    header: 'partSkuId,partName,partCode,unit,specModel,active',
    example: 'sku_101,传动皮带,PD-BELT-002,条,B-2400,true'
  },
  thresholds: {
    filename: '阈值配置导入模板.csv',
    header: 'assetId,partSkuId,thresholdMonthly,active',
    example: 'ZB-001,sku_001,5,true'
  },
  logs: {
    filename: '更换记录导入模板.csv',
    header: 'assetId,date,type,locationId,partSkuId,qty,remark',
    example: 'ZB-001,2026-02-10,维修,loc_001,sku_001,2,皮带磨损'
  }
}

Page({
  data: {
    uploading: '',       // 当前上传类型
    exporting: '',       // 当前导出类型
    logMode: 'month',    // 'month' | 'year'
    alertMode: 'month',  // 'month' | 'year'
    exportLogValue: '',   // 当前选择的导出日期（月或年）
    exportAlertValue: '', // 当前选择的导出日期（月或年）
    results: {}          // { parts, thresholds, logs, exportLogs, exportAlerts }
  },

  onLoad() {
    const ym = getCurrentYearMonth()       // e.g. '2026-02'
    const y = ym.substring(0, 4)           // e.g. '2026'
    this.setData({
      exportLogValue: ym,
      exportAlertValue: ym
    })
    // 内部缓存，切换月/年时保留上次选择
    this._logYear = y
    this._logMonth = ym
    this._alertYear = y
    this._alertMonth = ym
  },

  // ========== 下载模板 ==========
  onDownloadTemplate(e) {
    const type = e.currentTarget.dataset.type
    const template = TEMPLATES[type]
    if (!template) return

    const content = template.header + '\n' + template.example + '\n'
    const fs = wx.getFileSystemManager()
    const filePath = `${wx.env.USER_DATA_PATH}/${template.filename}`

    try {
      fs.writeFileSync(filePath, content, 'utf8')
      wx.shareFileMessage({
        filePath: filePath,
        fileName: template.filename,
        success: () => {
          wx.showToast({ title: '模板已发送', icon: 'success' })
        },
        fail: () => {
          wx.openDocument({
            filePath: filePath,
            fileType: 'csv',
            showMenu: true,
            success: () => {},
            fail: () => {
              wx.showToast({ title: '模板已保存，请在聊天中查看', icon: 'none' })
            }
          })
        }
      })
    } catch (err) {
      console.error('写模板文件失败', err)
      wx.showToast({ title: '生成模板失败', icon: 'none' })
    }
  },

  // ========== 上传并导入（含去重） ==========
  async onUpload(e) {
    const type = e.currentTarget.dataset.type
    if (this.data.uploading) return

    try {
      // 1. 选择文件
      const fileRes = await wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['xlsx', 'xls', 'csv']
      })

      if (!fileRes.tempFiles || fileRes.tempFiles.length === 0) return

      const file = fileRes.tempFiles[0]
      this.setData({
        uploading: type,
        [`results.${type}`]: null  // 清除之前的结果
      })

      // 2. 上传文件到云存储
      let fileID
      if (USE_MOCK) {
        // Mock 模式下跳过上传，直接调用 mock API
        fileID = 'mock_file_id'
      } else {
        wx.showLoading({ title: '上传文件中...' })
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: `imports/${type}_${Date.now()}_${file.name}`,
          filePath: file.path
        })
        fileID = uploadRes.fileID
        wx.hideLoading()
      }

      // 3. 调用云函数/Mock：解析 + 去重 + 写入
      wx.showLoading({ title: '检查去重并导入...' })
      const res = await api.importData({ fileID, importType: type })
      wx.hideLoading()

      if (!res.ok) {
        this.setData({
          uploading: '',
          [`results.${type}`]: {
            ok: false,
            message: res.error?.message || '导入失败'
          }
        })
        return
      }

      // 4. 展示去重结果
      const d = res.data
      const lines = []
      lines.push(`文件：${file.name}`)
      lines.push(`总行数：${d.total}`)
      lines.push(`新增写入：${d.inserted} 条`)
      if (d.skipped > 0) {
        lines.push(`已存在跳过：${d.skipped} 条`)
      }
      if (d.errorCount > 0) {
        lines.push(`校验失败：${d.errorCount} 条`)
        // 最多展示前5条错误
        const showErrors = (d.errors || []).slice(0, 5)
        showErrors.forEach(err => {
          lines.push(`  · ${err}`)
        })
        if (d.errorCount > 5) {
          lines.push(`  · ...还有 ${d.errorCount - 5} 条错误`)
        }
      }

      this.setData({
        uploading: '',
        [`results.${type}`]: {
          ok: true,
          inserted: d.inserted,
          skipped: d.skipped,
          errorCount: d.errorCount,
          message: lines.join('\n')
        }
      })

      // Toast
      if (d.inserted > 0 && d.errorCount === 0) {
        wx.showToast({ title: `成功导入 ${d.inserted} 条`, icon: 'success' })
      } else if (d.inserted === 0 && d.skipped > 0) {
        wx.showToast({ title: '全部已存在，无需导入', icon: 'none' })
      } else if (d.errorCount > 0) {
        wx.showToast({ title: `导入 ${d.inserted} 条，${d.errorCount} 条有错`, icon: 'none' })
      }

    } catch (err) {
      wx.hideLoading()
      if (err.errMsg && err.errMsg.indexOf('cancel') > -1) {
        this.setData({ uploading: '' })
        return
      }
      console.error('上传导入失败', err)
      this.setData({
        uploading: '',
        [`results.${type}`]: { ok: false, message: '上传失败：' + (err.message || '未知错误') }
      })
    }
  },

  // ========== 月/年切换 ==========
  onToggleLogMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === this.data.logMode) return
    const val = mode === 'month'
      ? (this._logMonth || getCurrentYearMonth())
      : (this._logYear || getCurrentYearMonth().substring(0, 4))
    this.setData({ logMode: mode, exportLogValue: val })
  },

  onToggleAlertMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === this.data.alertMode) return
    const val = mode === 'month'
      ? (this._alertMonth || getCurrentYearMonth())
      : (this._alertYear || getCurrentYearMonth().substring(0, 4))
    this.setData({ alertMode: mode, exportAlertValue: val })
  },

  // ========== 日期选择变更 ==========
  onLogValueChange(e) {
    const v = e.detail.value
    this.setData({ exportLogValue: v })
    if (this.data.logMode === 'month') {
      this._logMonth = v
    } else {
      this._logYear = v
    }
  },

  onAlertValueChange(e) {
    const v = e.detail.value
    this.setData({ exportAlertValue: v })
    if (this.data.alertMode === 'month') {
      this._alertMonth = v
    } else {
      this._alertYear = v
    }
  },

  // ========== 导出 ==========
  async onExport(e) {
    const type = e.currentTarget.dataset.type
    if (this.data.exporting) return

    const isLog = type === 'logs'
    const mode = isLog ? this.data.logMode : this.data.alertMode
    const value = isLog ? this.data.exportLogValue : this.data.exportAlertValue

    if (!value) {
      wx.showToast({ title: '请先选择时间', icon: 'none' })
      return
    }

    this.setData({ exporting: type })

    try {
      if (isLog) {
        await this.exportReplacementLogs(value, mode)
      } else {
        await this.exportAlerts(value, mode)
      }
    } catch (err) {
      console.error('导出失败', err)
      const key = isLog ? 'exportLogs' : 'exportAlerts'
      this.setData({
        exporting: '',
        [`results.${key}`]: { ok: false, message: '导出失败：' + (err.message || '未知错误') }
      })
    }
  },

  // 辅助：根据月/年模式生成需要查询的月份列表
  _getMonthList(value, mode) {
    if (mode === 'month') return [value]
    const months = []
    for (let m = 1; m <= 12; m++) {
      months.push(value + '-' + String(m).padStart(2, '0'))
    }
    return months
  },

  // 导出更换记录
  async exportReplacementLogs(value, mode) {
    const months = this._getMonthList(value, mode)
    let allList = []

    for (const ym of months) {
      const result = await api.listReplacementLogs({ yearMonth: ym, page: 1, pageSize: 1000 })
      if (result.ok && result.data.list) {
        allList = allList.concat(result.data.list)
      }
    }

    const label = mode === 'year' ? value + '年' : value
    if (allList.length === 0) {
      this.setData({
        exporting: '',
        'results.exportLogs': { ok: false, message: `${label} 暂无更换记录` }
      })
      return
    }

    const header = '日期,设备名,设备编号,更换类型,部位,配件明细,总数量,填报人,备注'
    const rows = allList.map(log => {
      const date = new Date(log.ts).toLocaleDateString()
      const items = (log.items || []).map(i => `${i.partNameSnapshot}x${i.qty}`).join(';')
      const totalQty = (log.items || []).reduce((s, i) => s + i.qty, 0)
      return `${date},${log.assetNameSnapshot},${log.assetNoSnapshot},${log.type},${log.locationNameSnapshot},"${items}",${totalQty},${log.reporterNameSnapshot},${log.remark || ''}`
    })
    const csv = '\uFEFF' + header + '\n' + rows.join('\n')

    const suffix = mode === 'year' ? value + '年' : value
    this.saveAndShareFile(`更换记录_${suffix}.csv`, csv, 'exportLogs')
  },

  // 导出报警记录
  async exportAlerts(value, mode) {
    const months = this._getMonthList(value, mode)
    let allList = []

    for (const ym of months) {
      const result = await api.listAlerts({ yearMonth: ym, page: 1, pageSize: 1000 })
      if (result.ok && result.data.list) {
        allList = allList.concat(result.data.list)
      }
    }

    const label = mode === 'year' ? value + '年' : value
    if (allList.length === 0) {
      this.setData({
        exporting: '',
        'results.exportAlerts': { ok: false, message: `${label} 暂无报警记录` }
      })
      return
    }

    const header = '设备,配件,月份,当前累计,阈值,状态,确认说明'
    const rows = allList.map(a => {
      return `${a.assetName || a.assetId},${a.partName || a.partSkuId},${a.yearMonth},${a.currentQty},${a.thresholdValue},${a.status},${a.ackNote || ''}`
    })
    const csv = '\uFEFF' + header + '\n' + rows.join('\n')

    const suffix = mode === 'year' ? value + '年' : value
    this.saveAndShareFile(`报警记录_${suffix}.csv`, csv, 'exportAlerts')
  },

  // 保存并分享文件
  saveAndShareFile(filename, content, resultKey) {
    const fs = wx.getFileSystemManager()
    const filePath = `${wx.env.USER_DATA_PATH}/${filename}`

    try {
      fs.writeFileSync(filePath, content, 'utf8')
      wx.shareFileMessage({
        filePath: filePath,
        fileName: filename,
        success: () => {
          this.setData({
            exporting: '',
            [`results.${resultKey}`]: { ok: true, message: `${filename} 已导出并发送` }
          })
        },
        fail: () => {
          wx.openDocument({
            filePath: filePath,
            fileType: 'csv',
            showMenu: true
          })
          this.setData({
            exporting: '',
            [`results.${resultKey}`]: { ok: true, message: `${filename} 已生成，请从文件中查看` }
          })
        }
      })
    } catch (err) {
      this.setData({
        exporting: '',
        [`results.${resultKey}`]: { ok: false, message: '文件生成失败' }
      })
    }
  }
})
