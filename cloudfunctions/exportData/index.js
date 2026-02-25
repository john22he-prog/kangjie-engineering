// 云函数：exportData — 导出数据为 Excel 并上传到云存储
// 支持两种模式：按月导出（yearMonth="2025-02"）、按年导出（year="2025"）
const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// CloudBase 单次查询上限 1000，需要分页拉取
async function fetchAll(collection, where = {}, orderField = null, orderDir = 'desc') {
  const MAX = 1000
  let allData = []
  let offset = 0

  while (true) {
    let query = db.collection(collection).where(where).skip(offset).limit(MAX)
    if (orderField) query = query.orderBy(orderField, orderDir)
    const { data } = await query.get()
    allData = allData.concat(data)
    if (data.length < MAX) break
    offset += MAX
  }

  return allData
}

// 格式化时间戳为 YYYY-MM-DD HH:mm
function formatTs(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${Y}-${M}-${D} ${h}:${m}`
}

// 格式化时间戳为 YYYY-MM-DD
function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  return `${Y}-${M}-${D}`
}

// 生成某年的12个 yearMonth 列表 ["2025-01", ..., "2025-12"]
function getYearMonths(year) {
  const months = []
  for (let m = 1; m <= 12; m++) {
    months.push(`${year}-${String(m).padStart(2, '0')}`)
  }
  return months
}

exports.main = async (event, context) => {
  try {
    // ========== 1. 鉴权 ==========
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    const { data: userArr } = await db.collection('users')
      .where({ openid, status: 'active' })
      .limit(1)
      .get()

    if (!userArr.length) {
      return { ok: false, error: { code: 'AUTH_NOT_BOUND', message: '未绑定或无权限' } }
    }

    const user = userArr[0]
    if (!['Supervisor', 'Admin'].includes(user.role)) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '仅主管/管理员可导出数据' } }
    }

    // ========== 2. 解析导出范围 ==========
    const { exportMode, yearMonth, year } = event
    let timeFilter       // 用于 where 条件的 yearMonth 查询
    let fileLabel        // 文件名中的时间标识
    let displayLabel     // 给用户看的范围描述

    if (exportMode === 'year') {
      // 按年导出
      if (!year || !/^\d{4}$/.test(year)) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请选择有效的年份' } }
      }
      const yearMonths = getYearMonths(year)
      timeFilter = _.in(yearMonths)   // yearMonth in ["2025-01", ..., "2025-12"]
      fileLabel = year
      displayLabel = `${year}年全年`
    } else {
      // 按月导出（默认）
      if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请选择有效的月份' } }
      }
      timeFilter = yearMonth
      fileLabel = yearMonth
      displayLabel = yearMonth
    }

    // ========== 3. 查询数据 ==========

    // 3.1 更换记录
    const logs = await fetchAll('replacement_logs', { yearMonth: timeFilter }, 'ts', 'desc')

    // 3.2 月度配件汇总
    const usages = await fetchAll('monthly_part_usage', { yearMonth: timeFilter })

    // 3.3 报警记录
    const alertList = await fetchAll('alerts', { yearMonth: timeFilter }, 'createdAt', 'desc')

    // 3.4 设备台账（全量备份）
    const assetList = await fetchAll('assets', {}, 'createdAt', 'asc')

    // 3.5 配件字典（全量备份）
    const partList = await fetchAll('parts', {}, 'partCode', 'asc')

    // 3.6 阈值配置（全量备份）
    const thresholdList = await fetchAll('asset_part_thresholds', { active: true })

    // ========== 4. 构建 Excel Sheets ==========

    // 构建关联 map
    const assetMap = {}
    assetList.forEach(a => { assetMap[a.assetId] = a })
    const partMap = {}
    partList.forEach(p => { partMap[p.partSkuId] = p })
    const thresholdMap = {}
    thresholdList.forEach(t => {
      thresholdMap[`${t.assetId}_${t.partSkuId}`] = t.thresholdMonthly
    })

    // --- Sheet 1: 更换记录明细 ---
    const logHeader = [
      '日期时间', '月份', '设备名称', '设备编号', '部位',
      '更换类型', '配件名称', '配件编号', '数量',
      '填报人', '备注'
    ]
    const logRows = []
    logs.forEach(log => {
      (log.items || []).forEach(item => {
        logRows.push([
          formatTs(log.ts),
          log.yearMonth || '',
          log.assetNameSnapshot || '',
          log.assetNoSnapshot || '',
          log.locationNameSnapshot || '',
          log.type || '',
          item.partNameSnapshot || '',
          item.partCodeSnapshot || '',
          item.qty || 0,
          log.reporterNameSnapshot || '',
          log.remark || ''
        ])
      })
    })
    const sheet1 = { name: '更换记录明细', data: [logHeader, ...logRows] }

    // --- Sheet 2: 月度配件汇总 ---
    const usageHeader = [
      '月份', '设备名称', '设备编号', '配件名称', '配件编号',
      '单位', '累计数量', '月度阈值', '是否超阈值'
    ]
    const usageRows = usages.map(u => {
      const asset = assetMap[u.assetId] || {}
      const part = partMap[u.partSkuId] || {}
      const threshold = thresholdMap[`${u.assetId}_${u.partSkuId}`]
      const overThreshold = threshold != null ? (u.qtySum > threshold ? '是' : '否') : '未设阈值'
      return [
        u.yearMonth || '',
        asset.assetName || u.assetId,
        asset.assetNo || '',
        part.partName || u.partSkuId,
        part.partCode || '',
        part.unit || '',
        u.qtySum || 0,
        threshold != null ? threshold : '未设置',
        overThreshold
      ]
    })
    const sheet2 = { name: '月度配件汇总', data: [usageHeader, ...usageRows] }

    // --- Sheet 3: 报警记录 ---
    const alertHeader = [
      '报警时间', '月份', '设备名称', '配件名称',
      '阈值', '当前累计', '状态', '确认人', '确认时间', '确认说明'
    ]
    const alertRows = alertList.map(a => {
      const asset = assetMap[a.assetId] || {}
      const part = partMap[a.partSkuId] || {}
      const statusText = a.status === 'OPEN' ? '待处理' : a.status === 'ACK' ? '已确认' : a.status
      return [
        formatTs(a.createdAt),
        a.yearMonth || '',
        a.assetName || asset.assetName || a.assetId,
        a.partName || part.partName || a.partSkuId,
        a.thresholdValue || 0,
        a.currentQty || 0,
        statusText,
        a.ackByUserId || '',
        a.ackTs ? formatTs(a.ackTs) : '',
        a.ackNote || ''
      ]
    })
    const sheet3 = { name: '报警记录', data: [alertHeader, ...alertRows] }

    // --- Sheet 4: 设备台账 ---
    const assetHeader = [
      '设备ID', '设备名称', '设备编号', '车间/区域', '状态', '创建日期'
    ]
    const assetRows = assetList.map(a => [
      a.assetId || '',
      a.assetName || '',
      a.assetNo || '',
      a.workshop || a.area || '',
      a.status === 'active' ? '启用' : '停用',
      formatDate(a.createdAt)
    ])
    const sheet4 = { name: '设备台账', data: [assetHeader, ...assetRows] }

    // --- Sheet 5: 配件字典 ---
    const partHeader = [
      '配件SKU ID', '配件名称', '配件编号', '单位', '规格型号', '状态', '来源'
    ]
    const partRows = partList.map(p => [
      p.partSkuId || '',
      p.partName || '',
      p.partCode || '',
      p.unit || '',
      p.specModel || '',
      p.active ? '启用' : '停用',
      p.source || ''
    ])
    const sheet5 = { name: '配件字典', data: [partHeader, ...partRows] }

    // --- Sheet 6: 阈值配置 ---
    const thresholdHeader = [
      '设备名称', '设备编号', '配件名称', '配件编号', '月度阈值'
    ]
    const thresholdRows = thresholdList.map(t => {
      const asset = assetMap[t.assetId] || {}
      const part = partMap[t.partSkuId] || {}
      return [
        asset.assetName || t.assetId,
        asset.assetNo || '',
        part.partName || t.partSkuId,
        part.partCode || '',
        t.thresholdMonthly || 0
      ]
    })
    const sheet6 = { name: '阈值配置', data: [thresholdHeader, ...thresholdRows] }

    // ========== 5. 生成 Excel ==========
    const buffer = xlsx.build([sheet1, sheet2, sheet3, sheet4, sheet5, sheet6])

    // ========== 6. 上传到云存储 ==========
    const cloudFileName = `exports/云南康洁_${fileLabel}_${Date.now()}.xlsx`
    const uploadRes = await cloud.uploadFile({
      cloudPath: cloudFileName,
      fileContent: buffer
    })

    // ========== 7. 生成临时下载链接 ==========
    const { fileList } = await cloud.getTempFileURL({
      fileList: [uploadRes.fileID]
    })
    const tempUrl = fileList[0].tempFileURL

    const userFileName = `云南康洁_${fileLabel}.xlsx`

    return {
      ok: true,
      data: {
        fileID: uploadRes.fileID,
        tempUrl,
        fileName: userFileName,
        displayLabel,
        summary: {
          logsCount: logs.length,
          logItemsCount: logRows.length,
          usagesCount: usages.length,
          alertsCount: alertList.length,
          assetsCount: assetList.length,
          partsCount: partList.length
        }
      }
    }
  } catch (err) {
    console.error('exportData error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '导出失败：' + (err.message || '未知错误') } }
  }
}
