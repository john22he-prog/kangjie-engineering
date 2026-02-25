const cloud = require('wx-server-sdk')
const dayjs = require('dayjs')
const { query, transaction } = require('../db')
const { checkRole } = require('../middleware/role')
const { resolveFactoryScope } = require('../middleware/dataScope')

async function handle(action, event, user) {
  switch (action) {
    case 'create':
      return create(event, user)
    case 'list':
      return list(event, user)
    case 'detail':
      return detail(event, user)
    default:
      throw { code: 400, message: `record 模块不支持 action: ${action}` }
  }
}

// ====== 创建每日记录 ======
async function create(event, user) {
  const factoryId = resolveFactoryScope(user, event.factory_id)
  if (!factoryId) throw { code: 400, message: '缺少 factory_id' }

  const { record_date, boiler_data, customer_data, total_water, total_fuel_consumed, fuel_intake } = event
  if (!record_date) throw { code: 400, message: '缺少 record_date' }

  // 日期合规校验：operator 只能填今天或昨天，截止次日 12:00
  if (user.role === 'operator') {
    validateRecordDate(record_date)
  }

  // 唯一性校验：factory_id + record_date
  const existing = await query(
    'SELECT id FROM daily_record WHERE factory_id = ? AND record_date = ? LIMIT 1',
    [factoryId, record_date]
  )
  if (existing.length > 0) {
    throw { code: 409, message: `${record_date} 的记录已存在，不可重复提交` }
  }

  if (!Array.isArray(boiler_data) || boiler_data.length === 0) {
    throw { code: 400, message: '锅炉数据不能为空' }
  }

  const result = await transaction(async (conn) => {
    // 插入主记录
    const mainResult = await conn.query(
      `INSERT INTO daily_record
        (factory_id, record_date, total_water, total_fuel_consumed, fuel_intake, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [factoryId, record_date, total_water || 0, total_fuel_consumed || 0, fuel_intake || 0, user.id]
    )
    const recordId = mainResult.insertId

    // 插入锅炉数据
    for (const b of boiler_data) {
      const runningHours = calcRunningHours(b.start_time, b.end_time)
      await conn.query(
        `INSERT INTO boiler_data
          (daily_record_id, boiler_id, start_time, end_time, running_hours,
           steam_production, electricity, steam_pressure, steam_temperature, exhaust_temperature, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recordId, b.boiler_id, b.start_time || null, b.end_time || null, runningHours,
          b.steam_production || 0, b.electricity || 0,
          b.steam_pressure || null, b.steam_temperature || null, b.exhaust_temperature || null,
          b.remark || ''
        ]
      )
    }

    // 插入客户用汽数据
    if (Array.isArray(customer_data)) {
      for (const c of customer_data) {
        await conn.query(
          `INSERT INTO customer_steam_data
            (daily_record_id, customer_id, steam_usage, remark)
           VALUES (?, ?, ?, ?)`,
          [recordId, c.customer_id, c.steam_usage || 0, c.remark || '']
        )
      }
    }

    // 计算衍生指标
    await calcDerivedMetrics(conn, recordId, factoryId, record_date)

    return { id: recordId }
  })

  // ========== 异步发送日报提交通知 ==========
  try {
    // 查询锅炉房 viewer/admin 的 openid
    const boilerUsers = await query(
      'SELECT openid FROM app_user WHERE role IN (?, ?) AND status = 1 AND openid IS NOT NULL',
      ['viewer', 'admin']
    )
    const extraOpenids = boilerUsers.map(u => u.openid).filter(Boolean)

    // 查询工厂名称
    const factoryRows = await query('SELECT name FROM factory WHERE id = ? LIMIT 1', [factoryId])
    const factoryName = factoryRows.length > 0 ? factoryRows[0].name : `工厂${factoryId}`

    const submitTime = dayjs().format('YYYY-MM-DD HH:mm')

    await cloud.callFunction({
      name: 'sendNotification',
      data: {
        type: 'BOILER_DAILY',
        factoryId: String(factoryId),
        excludeOpenid: user.openid,
        extraOpenids,
        data: {
          factoryName,
          recordDate: record_date,
          submitTime,
          summary: `${user.real_name || '操作员'}提交`,
          boilerCount: boiler_data.length,
        }
      }
    })
  } catch (notifyErr) {
    console.warn('日报通知发送失败（不影响主流程）:', notifyErr.message || notifyErr)
  }

  return { code: 0, data: result }
}

// ====== 日期合规校验 ======
function validateRecordDate(recordDate) {
  const now = dayjs()
  const target = dayjs(recordDate, 'YYYY-MM-DD')

  if (!target.isValid()) {
    throw { code: 400, message: '日期格式无效，请使用 YYYY-MM-DD' }
  }

  const today = dayjs().startOf('day')
  const yesterday = today.subtract(1, 'day')

  if (target.isBefore(yesterday) || target.isAfter(today)) {
    throw { code: 400, message: '只能录入今天或昨天的数据' }
  }

  // 昨天的记录截止次日（即今天）12:00
  if (target.isSame(yesterday, 'day')) {
    const deadline = today.hour(12)
    if (now.isAfter(deadline)) {
      throw { code: 400, message: '昨日数据已过录入截止时间（次日12:00）' }
    }
  }
}

// ====== 运行时长计算（支持 HH:mm 和 YYYY-MM-DD HH:mm 两种格式） ======
function calcRunningHours(startTime, endTime) {
  if (!startTime || !endTime) return 0

  // 优先用 dayjs 解析完整日期时间格式
  const startDayjs = dayjs(startTime)
  const endDayjs = dayjs(endTime)

  if (startDayjs.isValid() && endDayjs.isValid() && String(startTime).includes('-')) {
    const diffMinutes = endDayjs.diff(startDayjs, 'minute')
    return parseFloat((diffMinutes / 60).toFixed(2))
  }

  // 回退：纯 HH:mm 格式
  const parseMinutes = (t) => {
    const timePart = String(t).includes(' ') ? String(t).split(' ').pop() : String(t)
    const parts = timePart.split(':')
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
  }

  let startMin = parseMinutes(startTime)
  let endMin = parseMinutes(endTime)

  if (endMin < startMin) {
    endMin += 24 * 60
  }

  return parseFloat(((endMin - startMin) / 60).toFixed(2))
}

// ====== 衍生指标计算 ======
async function calcDerivedMetrics(conn, recordId, factoryId, recordDate) {
  const boilerRows = await conn.query(
    'SELECT steam_production, electricity FROM boiler_data WHERE daily_record_id = ?',
    [recordId]
  )

  const customerRows = await conn.query(
    'SELECT steam_usage FROM customer_steam_data WHERE daily_record_id = ?',
    [recordId]
  )

  const mainRecord = await conn.query(
    'SELECT total_water, total_fuel_consumed, fuel_intake FROM daily_record WHERE id = ?',
    [recordId]
  )
  const rec = mainRecord[0]

  const totalSteamProduction = boilerRows.reduce((s, r) => s + parseFloat(r.steam_production || 0), 0)
  const totalSteamUsage = customerRows.reduce((s, r) => s + parseFloat(r.steam_usage || 0), 0)
  const totalElectricity = boilerRows.reduce((s, r) => s + parseFloat(r.electricity || 0), 0)
  const totalWater = parseFloat(rec.total_water || 0)
  const totalFuelConsumed = parseFloat(rec.total_fuel_consumed || 0)
  const fuelIntake = parseFloat(rec.fuel_intake || 0)

  const electricityPerSteam = totalSteamProduction > 0
    ? parseFloat((totalElectricity / totalSteamProduction).toFixed(4)) : 0
  const fuelPerSteam = totalSteamProduction > 0
    ? parseFloat((totalFuelConsumed / totalSteamProduction).toFixed(4)) : 0
  const waterPerSteam = totalSteamProduction > 0
    ? parseFloat((totalWater / totalSteamProduction).toFixed(4)) : 0
  const steamLossRate = totalSteamProduction > 0
    ? parseFloat(((totalSteamProduction - totalSteamUsage) / totalSteamProduction * 100).toFixed(2)) : 0

  // 从 price_config 获取单价
  const priceRows = await conn.query(
    `SELECT fuel_price, electricity_price, water_price FROM price_config
     WHERE factory_id = ? AND effective_date <= ? ORDER BY effective_date DESC LIMIT 1`,
    [factoryId, recordDate]
  )
  const prices = priceRows.length > 0 ? priceRows[0] : { fuel_price: 0, electricity_price: 0, water_price: 0 }

  const fuelCost = parseFloat((totalFuelConsumed * parseFloat(prices.fuel_price || 0)).toFixed(2))
  const electricityCost = parseFloat((totalElectricity * parseFloat(prices.electricity_price || 0)).toFixed(2))
  const waterCost = parseFloat((totalWater * parseFloat(prices.water_price || 0)).toFixed(2))
  const totalCost = parseFloat((fuelCost + electricityCost + waterCost).toFixed(2))

  // 燃料库存估算：前一天的库存 - 今日消耗 + 今日进货
  const fuelStock = await calcFuelStock(conn, factoryId, recordDate, totalFuelConsumed, fuelIntake)

  // 燃料可用天数：库存 / 近7日日均消耗
  const fuelStockDays = await calcFuelStockDays(conn, factoryId, recordDate, fuelStock)

  const costPerSteam = totalSteamProduction > 0
    ? parseFloat((totalCost / totalSteamProduction).toFixed(2)) : 0

  await conn.query(
    `INSERT INTO daily_derived_metrics
      (daily_record_id, factory_id, record_date,
       total_steam_production, total_steam_usage, total_electricity,
       electricity_per_steam, fuel_per_steam, water_per_steam, steam_loss_rate,
       fuel_cost, electricity_cost, water_cost, total_cost, cost_per_steam,
       fuel_stock_estimate, fuel_stock_days,
       created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      recordId, factoryId, recordDate,
      totalSteamProduction, totalSteamUsage, totalElectricity,
      electricityPerSteam, fuelPerSteam, waterPerSteam, steamLossRate,
      fuelCost, electricityCost, waterCost, totalCost, costPerSteam,
      fuelStock, fuelStockDays,
    ]
  )
}

async function calcFuelStock(conn, factoryId, recordDate, todayConsumed, todayIntake) {
  const prevDate = dayjs(recordDate).subtract(1, 'day').format('YYYY-MM-DD')

  // 尝试获取前一天的库存
  const prevRows = await conn.query(
    `SELECT fuel_stock_estimate FROM daily_derived_metrics
     WHERE factory_id = ? AND record_date = ? LIMIT 1`,
    [factoryId, prevDate]
  )

  let prevStock
  if (prevRows.length > 0) {
    prevStock = parseFloat(prevRows[0].fuel_stock_estimate || 0)
  } else {
    // 没有前一天记录，取工厂初始库存
    const factoryRows = await conn.query(
      'SELECT initial_fuel_stock FROM factory WHERE id = ? LIMIT 1',
      [factoryId]
    )
    prevStock = factoryRows.length > 0 ? parseFloat(factoryRows[0].initial_fuel_stock || 0) : 0
  }

  return parseFloat((prevStock - todayConsumed + todayIntake).toFixed(2))
}

async function calcFuelStockDays(conn, factoryId, recordDate, currentStock) {
  const startDate = dayjs(recordDate).subtract(7, 'day').format('YYYY-MM-DD')

  const rows = await conn.query(
    `SELECT total_fuel_consumed FROM daily_record
     WHERE factory_id = ? AND record_date > ? AND record_date <= ?`,
    [factoryId, startDate, recordDate]
  )

  if (rows.length === 0) return 0

  const totalConsumed = rows.reduce((s, r) => s + parseFloat(r.total_fuel_consumed || 0), 0)
  const avgDaily = totalConsumed / rows.length

  if (avgDaily <= 0) return 999

  return parseFloat((currentStock / avgDaily).toFixed(1))
}

// ====== 记录列表（分页 + 日期范围） ======
async function list(event, user) {
  const factoryId = resolveFactoryScope(user, event.factoryId)
  if (!factoryId) throw { code: 400, message: '缺少 factoryId' }

  const page = parseInt(event.page || 1, 10)
  const pageSize = parseInt(event.pageSize || 20, 10)
  const offset = (page - 1) * pageSize

  let whereSql = 'WHERE r.factory_id = ?'
  const params = [factoryId]

  if (event.startDate) {
    whereSql += ' AND r.record_date >= ?'
    params.push(event.startDate)
  }
  if (event.endDate) {
    whereSql += ' AND r.record_date <= ?'
    params.push(event.endDate)
  }

  const countResult = await query(
    `SELECT COUNT(*) AS total FROM daily_record r ${whereSql}`,
    params
  )
  const total = countResult[0].total

  const listParams = [...params, pageSize, offset]
  const rows = await query(
    `SELECT r.*, d.total_steam_production, d.total_cost, d.fuel_stock_estimate, d.fuel_stock_days
     FROM daily_record r
     LEFT JOIN daily_derived_metrics d ON d.daily_record_id = r.id
     ${whereSql}
     ORDER BY r.record_date DESC
     LIMIT ? OFFSET ?`,
    listParams
  )

  return {
    code: 0,
    data: {
      list: rows,
      total,
      page,
      pageSize,
    },
  }
}

// ====== 记录详情 ======
async function detail(event, user) {
  if (!event.id) throw { code: 400, message: '缺少参数 id' }

  const records = await query('SELECT * FROM daily_record WHERE id = ? LIMIT 1', [event.id])
  if (records.length === 0) throw { code: 404, message: '记录不存在' }

  const record = records[0]

  const [boilerData, customerData, metrics] = await Promise.all([
    query(
      `SELECT bd.*, b.name AS boiler_name
       FROM boiler_data bd
       LEFT JOIN boiler b ON b.id = bd.boiler_id
       WHERE bd.daily_record_id = ?
       ORDER BY b.sort_order ASC`,
      [event.id]
    ),
    query(
      `SELECT cs.*, sc.name AS customer_name
       FROM customer_steam_data cs
       LEFT JOIN steam_customer sc ON sc.id = cs.customer_id
       WHERE cs.daily_record_id = ?
       ORDER BY sc.sort_order ASC`,
      [event.id]
    ),
    query(
      'SELECT * FROM daily_derived_metrics WHERE daily_record_id = ? LIMIT 1',
      [event.id]
    ),
  ])

  return {
    code: 0,
    data: {
      ...record,
      boiler_data: boilerData,
      customer_steam_data: customerData,
      daily_derived_metrics: metrics.length > 0 ? metrics[0] : null,
    },
  }
}

module.exports = { handle }
