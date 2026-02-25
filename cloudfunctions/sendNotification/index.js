const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ============================================================
//  模板 ID 配置
// ============================================================
const TMPL = {
  REPLACEMENT:     'B20NDBx_LwjWVbTLTXI0J4YMT9m6B1wa3XBllHc9Dts',
  INSPECTION:      '5uUWq_iIWyrMYXoY8W7bQ120Uc5ns2nFxrkhOaRTl0k',
  THRESHOLD_ALERT: '2MWKeleoiWrX-HOftZ0V7QwRIynlsDDkJQF5vbYaMeM',
  LOW_INVENTORY:   'isCQiLS5ms-Vrbi5OlVbFjJsNTDRFYDJjgb8Tvz0z2g',
  BOILER_DAILY:    '7AMlN_cyGnOGXwwthRhEVkW7UR8qHqAqkNrEOdLZuk4',
}

// ============================================================
//  字段映射
//  ⚠️  首次部署前，请到微信公众平台 → 订阅消息 → 我的模板 → 详情
//      确认每个模板的字段 key（如 thing1、character_string2 等），
//      并更新下方 buildData 中的 key 使其与平台一致。
// ============================================================

function buildReplacementData(d) {
  return {
    templateId: TMPL.REPLACEMENT,
    page: '/pages/record/index',
    data: {
      character_string2: { value: cut(d.logId, 32) },       // 报修单号
      thing1:            { value: cut(d.description, 20) },  // 温馨提示
      thing3:            { value: cut(d.reporterName, 20) }, // 报修人员
      thing4:            { value: cut(d.assetName, 20) },    // 报修设备
      time5:             { value: d.time },                  // 报修时间
    }
  }
}

function buildInspectionData(d) {
  return {
    templateId: TMPL.INSPECTION,
    page: '/pages/inspection/index',
    data: {
      thing6:   { value: cut(d.planName || d.assetName, 20) }, // 项目名称
      phrase8:  { value: cut(d.status, 5) },                   // 巡检状态
      time7:    { value: d.inspectDate },                      // 巡检日期
      time2:    { value: d.submitTime },                       // 提交时间
      thing5:   { value: cut(d.remark || '无', 20) },          // 备注
    }
  }
}

function buildThresholdAlertData(d) {
  return {
    templateId: TMPL.THRESHOLD_ALERT,
    page: '/pages/alerts/index',
    data: {
      thing1:  { value: cut(d.factoryName, 20) },  // 企业
      thing2:  { value: cut(d.target, 20) },        // 站点
      number7: { value: d.currentValue },           // 当前值
      number8: { value: d.threshold },              // 限制值
      time3:   { value: d.time },                   // 时间
    }
  }
}

function buildLowInventoryData(d) {
  return {
    templateId: TMPL.LOW_INVENTORY,
    page: '/pages/alerts/index',
    data: {
      number8: { value: d.currentQty },                       // 剩余数量
      thing7:  { value: cut(d.partName, 20) },                // 物品名称
      thing1:  { value: cut(d.alertType || '低库存预警', 20) }, // 预警类型
      time4:   { value: d.time },                             // 时间
      thing5:  { value: cut(d.factoryName || '', 20) },       // 备注
    }
  }
}

function buildBoilerDailyData(d) {
  return {
    templateId: TMPL.BOILER_DAILY,
    page: '/packages/boiler/pages/home/index',
    data: {
      thing13:  { value: cut(d.factoryName, 20) },  // 网点名称
      time1:    { value: d.recordDate },             // 更新日期
      time10:   { value: d.submitTime },             // 报告时间
      thing5:   { value: cut(d.summary, 20) },       // 温馨提醒
      number12: { value: d.boilerCount },            // 操作总数
    }
  }
}

const BUILDERS = {
  REPLACEMENT:     buildReplacementData,
  INSPECTION:      buildInspectionData,
  THRESHOLD_ALERT: buildThresholdAlertData,
  LOW_INVENTORY:   buildLowInventoryData,
  BOILER_DAILY:    buildBoilerDailyData,
  FAULT_REPORT:    buildReplacementData,  // 复用维修通知模板
}

// ============================================================
//  通知类型 → 所需权限
// ============================================================
const TYPE_TO_PERM = {
  REPLACEMENT:     'notify:replacement',
  INSPECTION:      'notify:inspection',
  THRESHOLD_ALERT: 'notify:threshold',
  LOW_INVENTORY:   'notify:inventory',
  FAULT_REPORT:    'notify:fault',
  BOILER_DAILY:    'notify:boiler_daily',
}

const FALLBACK_ROLE_PERMS = {
  Admin:         Object.values(TYPE_TO_PERM),
  Management:    Object.values(TYPE_TO_PERM),
  Supervisor:    ['notify:replacement', 'notify:inspection', 'notify:threshold', 'notify:inventory', 'notify:fault'],
  BoilerOperator:['notify:boiler_daily'],
  Engineer:      ['notify:fault'],
  Viewer:        [],
}

// ============================================================
//  收件人查询（基于权限）
// ============================================================

async function getAllActiveUsers() {
  const allUsers = []
  const batchSize = 100
  let offset = 0
  while (true) {
    const { data } = await db.collection('users').where({
      status: 'active',
      openid: _.exists(true),
    }).skip(offset).limit(batchSize).get()
    allUsers.push(...data)
    if (data.length < batchSize) break
    offset += batchSize
  }
  return allUsers
}

async function getRecipients(type, factoryId) {
  const requiredPerm = TYPE_TO_PERM[type]
  if (!requiredPerm) return []

  const users = await getAllActiveUsers()

  const recipients = []
  for (const u of users) {
    if (!u.openid) continue

    const perms = Array.isArray(u.permissions) && u.permissions.length > 0
      ? u.permissions
      : (FALLBACK_ROLE_PERMS[u.role] || [])

    if (!perms.includes(requiredPerm) && !perms.includes('system:admin')) continue

    if (factoryId) {
      const ids = u.factoryIds || []
      const singleId = u.factoryId || null
      const hasRestriction = ids.length > 0 || singleId
      if (hasRestriction) {
        const all = new Set(ids)
        if (singleId) all.add(singleId)
        if (!all.has(factoryId)) continue
      }
    }

    recipients.push(u.openid)
  }

  return recipients
}

// ============================================================
//  主入口
// ============================================================

exports.main = async (event) => {
  const { type, data, factoryId, extraOpenids, excludeOpenid } = event

  if (!type || !BUILDERS[type]) {
    return { ok: false, error: 'INVALID_TYPE' }
  }

  try {
    const builder = BUILDERS[type]
    const message = builder(data)

    // 查询工程部用户
    const recipients = await getRecipients(type, factoryId)

    // 追加锅炉房等外部 openid
    if (Array.isArray(extraOpenids)) {
      extraOpenids.forEach(id => { if (id) recipients.push(id) })
    }

    // 去重并排除提交者自身
    const uniqueRecipients = [...new Set(recipients)]
      .filter(id => id !== excludeOpenid)

    if (uniqueRecipients.length === 0) {
      return { ok: true, sent: 0, total: 0, reason: 'NO_RECIPIENTS' }
    }

    let sent = 0
    const BATCH = 10
    for (let i = 0; i < uniqueRecipients.length; i += BATCH) {
      const batch = uniqueRecipients.slice(i, i + BATCH)
      const results = await Promise.allSettled(
        batch.map(openid =>
          cloud.openapi.subscribeMessage.send({
            touser: openid,
            templateId: message.templateId,
            page: message.page,
            data: message.data,
          })
        )
      )
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          sent++
        } else {
          const err = r.reason || {}
          if (err.errCode !== 43101) {
            console.warn(`通知发送失败 [${batch[idx]}]:`, err.errCode, err.errMsg)
          }
        }
      })
    }

    return { ok: true, sent, total: uniqueRecipients.length }
  } catch (err) {
    console.error('sendNotification error:', err)
    return { ok: false, error: err.message }
  }
}

// ============================================================
//  工具
// ============================================================

function cut(str, max) {
  if (!str) return ''
  str = String(str)
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function formatNow() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
