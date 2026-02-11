// 云函数：importData — 导入数据（Excel/CSV），去重检查后只写入新记录
// 支持三种导入类型：parts（配件字典）、thresholds（阈值）、logs（更换记录）
const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ========== 工具函数 ==========

// 分页拉取全量数据
async function fetchAll(collection, where = {}) {
  const MAX = 1000
  let allData = []
  let offset = 0
  while (true) {
    const { data } = await db.collection(collection).where(where).skip(offset).limit(MAX).get()
    allData = allData.concat(data)
    if (data.length < MAX) break
    offset += MAX
  }
  return allData
}

// 将 Excel 表头行 + 数据行解析为对象数组
function sheetToObjects(sheetData) {
  if (!sheetData || sheetData.length < 2) return []
  const headers = sheetData[0].map(h => String(h || '').trim())
  const rows = []
  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i]
    if (!row || row.every(cell => cell === null || cell === undefined || cell === '')) continue
    const obj = {}
    headers.forEach((h, idx) => {
      obj[h] = row[idx] !== undefined && row[idx] !== null ? row[idx] : ''
    })
    rows.push({ _row: i + 1, ...obj })  // _row 记录原始行号（从1开始）
  }
  return rows
}

// 解析日期字符串为时间戳（支持 YYYY-MM-DD 或 YYYY/MM/DD）
function parseDate(str) {
  if (!str) return null
  const s = String(str).trim()
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d.getTime()
}

// 获取 yearMonth from timestamp
function getYearMonth(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ========== 导入处理器 ==========

/**
 * 导入配件字典
 * 去重规则：按 partSkuId 检查，已存在则跳过
 * 必填字段：partSkuId, partName, partCode, unit
 */
async function importParts(rows) {
  const result = { total: rows.length, inserted: 0, skipped: 0, errors: [] }

  if (rows.length === 0) return result

  // 1. 拉取数据库中所有已有的 partSkuId
  const existingParts = await fetchAll('parts', {})
  const existingIds = new Set(existingParts.map(p => p.partSkuId))
  const existingCodes = new Set(existingParts.map(p => p.partCode))

  // 2. 逐行校验 + 去重
  const toInsert = []
  const batchSkuIds = new Set()  // 批次内去重

  for (const row of rows) {
    const partSkuId = String(row.partSkuId || row['配件SKU ID'] || row['配件ID'] || '').trim()
    const partName = String(row.partName || row['配件名称'] || '').trim()
    const partCode = String(row.partCode || row['配件编号'] || '').trim()
    const unit = String(row.unit || row['单位'] || '').trim()
    const specModel = String(row.specModel || row['规格型号'] || '').trim()
    const activeRaw = row.active !== undefined ? row.active : (row['状态'] || '')
    const active = activeRaw === false || activeRaw === 'false' || activeRaw === '停用' ? false : true
    const source = String(row.source || row['来源'] || 'Excel').trim()

    // 必填校验
    if (!partSkuId) {
      result.errors.push(`第${row._row}行：缺少配件ID`)
      continue
    }
    if (!partName) {
      result.errors.push(`第${row._row}行：缺少配件名称`)
      continue
    }
    if (!partCode) {
      result.errors.push(`第${row._row}行：缺少配件编号`)
      continue
    }
    if (!unit) {
      result.errors.push(`第${row._row}行：缺少单位`)
      continue
    }

    // 去重：数据库已有
    if (existingIds.has(partSkuId)) {
      result.skipped++
      continue
    }

    // 去重：批次内重复
    if (batchSkuIds.has(partSkuId)) {
      result.skipped++
      continue
    }

    // partCode 冲突检查
    if (existingCodes.has(partCode)) {
      result.errors.push(`第${row._row}行：配件编号 "${partCode}" 已被其他配件使用`)
      continue
    }

    batchSkuIds.add(partSkuId)
    toInsert.push({
      partSkuId,
      partName,
      partCode,
      unit,
      specModel,
      active,
      source,
      updatedAt: Date.now()
    })
  }

  // 3. 批量写入
  for (const doc of toInsert) {
    try {
      await db.collection('parts').add({ data: doc })
      result.inserted++
    } catch (err) {
      result.errors.push(`写入 ${doc.partSkuId} 失败：${err.message}`)
    }
  }

  return result
}

/**
 * 导入阈值配置
 * 去重规则：按 (assetId, partSkuId) 检查，已存在则跳过
 * 必填字段：assetId, partSkuId, thresholdMonthly
 */
async function importThresholds(rows) {
  const result = { total: rows.length, inserted: 0, skipped: 0, errors: [] }

  if (rows.length === 0) return result

  // 1. 拉取已有阈值
  const existingThresholds = await fetchAll('asset_part_thresholds', {})
  const existingKeys = new Set(existingThresholds.map(t => `${t.assetId}_${t.partSkuId}`))

  // 2. 校验现有设备和配件
  const existingAssets = await fetchAll('assets', {})
  const assetIds = new Set(existingAssets.map(a => a.assetId))
  const existingParts = await fetchAll('parts', {})
  const partIds = new Set(existingParts.map(p => p.partSkuId))

  const toInsert = []
  const batchKeys = new Set()

  for (const row of rows) {
    const assetId = String(row.assetId || row['设备ID'] || '').trim()
    const partSkuId = String(row.partSkuId || row['配件ID'] || row['配件SKU ID'] || '').trim()
    const thresholdRaw = row.thresholdMonthly || row['月度阈值'] || ''
    const thresholdMonthly = parseInt(thresholdRaw, 10)
    const activeRaw = row.active !== undefined ? row.active : (row['状态'] || '')
    const active = activeRaw === false || activeRaw === 'false' || activeRaw === '停用' ? false : true

    // 必填校验
    if (!assetId) {
      result.errors.push(`第${row._row}行：缺少设备ID`)
      continue
    }
    if (!partSkuId) {
      result.errors.push(`第${row._row}行：缺少配件ID`)
      continue
    }
    if (isNaN(thresholdMonthly) || thresholdMonthly <= 0) {
      result.errors.push(`第${row._row}行：月度阈值必须为正整数`)
      continue
    }

    // 关联校验
    if (!assetIds.has(assetId)) {
      result.errors.push(`第${row._row}行：设备 "${assetId}" 不存在`)
      continue
    }
    if (!partIds.has(partSkuId)) {
      result.errors.push(`第${row._row}行：配件 "${partSkuId}" 不存在`)
      continue
    }

    const key = `${assetId}_${partSkuId}`

    // 去重：数据库已有
    if (existingKeys.has(key)) {
      result.skipped++
      continue
    }

    // 去重：批次内重复
    if (batchKeys.has(key)) {
      result.skipped++
      continue
    }

    batchKeys.add(key)
    toInsert.push({
      assetId,
      partSkuId,
      thresholdMonthly,
      active,
      updatedAt: Date.now()
    })
  }

  // 3. 批量写入
  for (const doc of toInsert) {
    try {
      await db.collection('asset_part_thresholds').add({ data: doc })
      result.inserted++
    } catch (err) {
      result.errors.push(`写入 ${doc.assetId}+${doc.partSkuId} 失败：${err.message}`)
    }
  }

  return result
}

/**
 * 导入更换记录
 * 去重规则：按 (assetId, 日期YYYY-MM-DD, locationId, partSkuId) 组合检查
 *           若完全匹配则认为是同一条记录，跳过
 * 必填字段：assetId, date, type, locationId, partSkuId, qty
 */
async function importLogs(rows) {
  const result = { total: rows.length, inserted: 0, skipped: 0, errors: [] }

  if (rows.length === 0) return result

  // 1. 拉取关联表
  const existingAssets = await fetchAll('assets', {})
  const assetMap = {}
  existingAssets.forEach(a => { assetMap[a.assetId] = a })

  const existingLocations = await fetchAll('asset_locations', {})
  const locationMap = {}
  existingLocations.forEach(l => { locationMap[l.locationId] = l })

  const existingParts = await fetchAll('parts', {})
  const partMap = {}
  existingParts.forEach(p => { partMap[p.partSkuId] = p })

  // 2. 拉取已有记录，构建去重 key
  //    key = assetId + 日期(YYYY-MM-DD) + locationId + partSkuId + qty
  const existingLogs = await fetchAll('replacement_logs', {})
  const existingLogKeys = new Set()
  existingLogs.forEach(log => {
    const dateStr = log.ts ? new Date(log.ts).toISOString().split('T')[0] : ''
    const locId = log.locationIdSnapshot || ''
    ;(log.items || []).forEach(item => {
      const key = `${log.assetId}|${dateStr}|${locId}|${item.partSkuId}|${item.qty}`
      existingLogKeys.add(key)
    })
  })

  // 3. 逐行处理
  //    每行是一个"设备+日期+部位+配件+数量"组合
  //    相同 (assetId, date, type, locationId) 的多行会合并为一条 log 的多个 items
  const logGroups = {}  // key: assetId|date|type|locationId → items[]
  const batchKeys = new Set()

  for (const row of rows) {
    const assetId = String(row.assetId || row['设备ID'] || '').trim()
    const dateStr = String(row.date || row['日期'] || row['日期时间'] || '').trim()
    const type = String(row.type || row['更换类型'] || '').trim()
    const locationId = String(row.locationId || row['部位ID'] || '').trim()
    const partSkuId = String(row.partSkuId || row['配件ID'] || row['配件SKU ID'] || '').trim()
    const qtyRaw = row.qty || row['数量'] || ''
    const qty = parseInt(qtyRaw, 10)
    const remark = String(row.remark || row['备注'] || '').trim()

    // 必填校验
    if (!assetId) { result.errors.push(`第${row._row}行：缺少设备ID`); continue }
    if (!dateStr) { result.errors.push(`第${row._row}行：缺少日期`); continue }
    if (!type) { result.errors.push(`第${row._row}行：缺少更换类型`); continue }
    if (!['维修', '预防', '紧急'].includes(type)) {
      result.errors.push(`第${row._row}行：更换类型必须为"维修"、"预防"或"紧急"`)
      continue
    }
    if (!locationId) { result.errors.push(`第${row._row}行：缺少部位ID`); continue }
    if (!partSkuId) { result.errors.push(`第${row._row}行：缺少配件ID`); continue }
    if (isNaN(qty) || qty <= 0) { result.errors.push(`第${row._row}行：数量必须为正整数`); continue }

    // 关联校验
    if (!assetMap[assetId]) { result.errors.push(`第${row._row}行：设备 "${assetId}" 不存在`); continue }
    if (!locationMap[locationId]) { result.errors.push(`第${row._row}行：部位 "${locationId}" 不存在`); continue }
    if (!partMap[partSkuId]) { result.errors.push(`第${row._row}行：配件 "${partSkuId}" 不存在`); continue }

    const ts = parseDate(dateStr)
    if (!ts) { result.errors.push(`第${row._row}行：日期格式无效 "${dateStr}"`); continue }

    const datePart = new Date(ts).toISOString().split('T')[0]

    // 去重检查：数据库中是否已有相同记录
    const dupKey = `${assetId}|${datePart}|${locationId}|${partSkuId}|${qty}`
    if (existingLogKeys.has(dupKey)) {
      result.skipped++
      continue
    }

    // 批次内去重
    if (batchKeys.has(dupKey)) {
      result.skipped++
      continue
    }
    batchKeys.add(dupKey)

    // 按 (assetId, date, type, locationId) 分组合并
    const groupKey = `${assetId}|${datePart}|${type}|${locationId}`
    if (!logGroups[groupKey]) {
      logGroups[groupKey] = {
        assetId, ts, type, locationId, remark, items: []
      }
    }
    const part = partMap[partSkuId]
    logGroups[groupKey].items.push({
      partSkuId,
      partNameSnapshot: part ? part.partName : partSkuId,
      partCodeSnapshot: part ? part.partCode : '',
      qty
    })
  }

  // 4. 写入数据库
  const now = Date.now()
  for (const groupKey in logGroups) {
    const group = logGroups[groupKey]
    const asset = assetMap[group.assetId] || {}
    const location = locationMap[group.locationId] || {}
    const yearMonth = getYearMonth(group.ts)

    // 生成唯一的 clientOfflineId 用于幂等
    const clientOfflineId = `import_${groupKey}_${now}`

    const logDoc = {
      assetId: group.assetId,
      assetNameSnapshot: asset.assetName || group.assetId,
      assetNoSnapshot: asset.assetNo || '',
      reporterUserIdSnapshot: 'IMPORT',
      reporterNameSnapshot: 'Excel导入',
      ts: group.ts,
      yearMonth,
      type: group.type,
      locationIdSnapshot: group.locationId,
      locationNameSnapshot: location.locationName || group.locationId,
      items: group.items,
      remark: group.remark,
      images: [],
      clientOfflineId,
      createdAt: now
    }

    try {
      // 幂等检查（防止重复调用）
      const { data: existing } = await db.collection('replacement_logs')
        .where({ clientOfflineId })
        .limit(1)
        .get()

      if (existing.length > 0) {
        result.skipped += group.items.length
        continue
      }

      await db.collection('replacement_logs').add({ data: logDoc })
      result.inserted += group.items.length

      // 更新月度汇总
      for (const item of group.items) {
        const usageWhere = {
          assetId: group.assetId,
          partSkuId: item.partSkuId,
          yearMonth
        }
        const { data: usageArr } = await db.collection('monthly_part_usage')
          .where(usageWhere)
          .limit(1)
          .get()

        if (usageArr.length > 0) {
          await db.collection('monthly_part_usage').doc(usageArr[0]._id).update({
            data: {
              qtySum: _.inc(item.qty),
              lastUpdatedAt: now
            }
          })
        } else {
          await db.collection('monthly_part_usage').add({
            data: {
              ...usageWhere,
              qtySum: item.qty,
              lastUpdatedAt: now
            }
          })
        }
      }
    } catch (err) {
      result.errors.push(`写入记录 ${groupKey} 失败：${err.message}`)
    }
  }

  return result
}

// ========== 主入口 ==========

exports.main = async (event, context) => {
  try {
    // 1. 鉴权
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
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '仅主管/管理员可导入数据' } }
    }

    // 2. 参数校验
    const { fileID, importType } = event
    if (!fileID) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少文件' } }
    }
    if (!['parts', 'thresholds', 'logs'].includes(importType)) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '无效的导入类型' } }
    }

    // 3. 下载文件
    const fileRes = await cloud.downloadFile({ fileID })
    const buffer = fileRes.fileContent

    // 4. 解析 Excel/CSV
    let rows = []
    try {
      const sheets = xlsx.parse(buffer)
      if (sheets.length === 0 || !sheets[0].data || sheets[0].data.length < 2) {
        return { ok: false, error: { code: 'PARSE_ERROR', message: '文件为空或格式不正确，请确保至少有表头行和数据行' } }
      }
      rows = sheetToObjects(sheets[0].data)
    } catch (parseErr) {
      return { ok: false, error: { code: 'PARSE_ERROR', message: '文件解析失败：' + parseErr.message } }
    }

    if (rows.length === 0) {
      return { ok: false, error: { code: 'EMPTY_DATA', message: '文件中没有有效数据行' } }
    }

    // 5. 按类型处理
    let importResult
    const typeNames = { parts: '配件字典', thresholds: '阈值配置', logs: '更换记录' }

    if (importType === 'parts') {
      importResult = await importParts(rows)
    } else if (importType === 'thresholds') {
      importResult = await importThresholds(rows)
    } else {
      importResult = await importLogs(rows)
    }

    // 6. 构建返回结果
    return {
      ok: true,
      data: {
        importType,
        typeName: typeNames[importType],
        total: importResult.total,
        inserted: importResult.inserted,
        skipped: importResult.skipped,
        errorCount: importResult.errors.length,
        errors: importResult.errors.slice(0, 20)  // 最多返回20条错误，避免过大
      }
    }
  } catch (err) {
    console.error('importData error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '导入失败：' + (err.message || '未知错误') } }
  }
}
