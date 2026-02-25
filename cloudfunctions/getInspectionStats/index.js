const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const COLLECTIONS = ['inspection_plans', 'inspection_logs', 'users']
let _ensured = false
async function ensureCollections() {
  if (_ensured) return
  for (const name of COLLECTIONS) {
    try { await db.createCollection(name) } catch (e) {}
  }
  _ensured = true
}

function getTodayStr() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getDateStr(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

exports.main = async (event, context) => {
  await ensureCollections()
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) return { ok: false, error: { code: 'AUTH_FAILED', message: '无法获取用户身份' } }

    const { data: users } = await db.collection('users').where({ openid, status: 'active' }).limit(1).get()
    if (users.length === 0) return { ok: false, error: { code: 'PERMISSION_DENIED', message: '未绑定或账号已禁用' } }

    const user = users[0]
    const factoryId = user.factoryId || null

    const planWhere = { status: 'active' }
    if (factoryId) planWhere.factoryId = factoryId
    const { data: plans } = await db.collection('inspection_plans').where(planWhere).limit(1).get()

    if (plans.length === 0) return { ok: true, data: { hasPlan: false } }

    const plan = plans[0]
    const planAssets = plan.assets || []
    const planTotal = planAssets.length
    const planId = plan._id

    const today = new Date()
    const pad = n => String(n).padStart(2, '0')

    const days30ago = new Date(today)
    days30ago.setDate(days30ago.getDate() - 29)
    const startDate30 = getDateStr(days30ago)

    const logWhere = { planId }
    if (factoryId) logWhere.factoryId = factoryId
    logWhere.inspectDate = _.gte(startDate30)

    let allLogs = []
    let skip = 0
    while (true) {
      const { data: batch } = await db.collection('inspection_logs')
        .where(logWhere).skip(skip).limit(1000).get()
      allLogs = allLogs.concat(batch)
      if (batch.length < 1000) break
      skip += 1000
    }

    const byDate = {}
    const byUser = {}
    allLogs.forEach(log => {
      const dt = log.inspectDate
      if (!byDate[dt]) byDate[dt] = new Set()
      byDate[dt].add(log.assetId)
      const uKey = log.userDisplayName || log.userId || 'unknown'
      byUser[uKey] = (byUser[uKey] || 0) + 1
    })

    const todayStr = getTodayStr()

    // Week rate
    const weekStart = new Date(today)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
    let weekDone = 0, weekTotal = 0
    for (let i = 0; i < 7; i++) {
      const wd = new Date(weekStart)
      wd.setDate(wd.getDate() + i)
      const wds = getDateStr(wd)
      if (wds > todayStr) break
      weekTotal += planTotal
      weekDone += byDate[wds] ? Math.min(byDate[wds].size, planTotal) : 0
    }
    const weekRate = weekTotal > 0 ? Math.round(weekDone / weekTotal * 100) : 0

    // Month count
    const monthKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`
    let monthCount = 0
    Object.keys(byDate).forEach(dt => {
      if (dt.startsWith(monthKey)) monthCount += byDate[dt].size
    })

    // Streak
    let streak = 0
    for (let i = 0; i < 30; i++) {
      const sd = new Date(today)
      sd.setDate(sd.getDate() - i)
      const sds = getDateStr(sd)
      if (i === 0 && !byDate[sds]) { streak = 0; break }
      if (byDate[sds] && byDate[sds].size >= planTotal) streak++
      else if (i > 0) break
    }

    // 7-day calendar
    const week = []
    const dayNames = ['日', '一', '二', '三', '四', '五', '六']
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const ds = getDateStr(d)
      const done = byDate[ds] ? Math.min(byDate[ds].size, planTotal) : 0
      let level = 0
      if (planTotal > 0) {
        const r = done / planTotal
        if (r >= 1) level = 3
        else if (r >= 0.5) level = 2
        else if (r > 0) level = 1
      }
      week.push({
        date: ds,
        day: d.getDate(),
        dayName: dayNames[d.getDay()],
        done,
        total: planTotal,
        level,
        isToday: ds === todayStr
      })
    }

    // 30-day calendar
    const month = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const ds = getDateStr(d)
      const done = byDate[ds] ? Math.min(byDate[ds].size, planTotal) : 0
      let level = 0
      if (planTotal > 0) {
        const r = done / planTotal
        if (r >= 1) level = 3
        else if (r >= 0.5) level = 2
        else if (r > 0) level = 1
      }
      month.push({ date: ds, day: d.getDate(), done, total: planTotal, level })
    }

    // User ranking (top 10)
    const userRanking = Object.entries(byUser)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const maxUserCount = userRanking.length > 0 ? userRanking[0].count : 1

    return {
      ok: true,
      data: {
        hasPlan: true,
        weekRate,
        monthCount,
        streak,
        week,
        month,
        userRanking: userRanking.map(u => ({
          ...u,
          pct: Math.round(u.count / maxUserCount * 100)
        }))
      }
    }
  } catch (err) {
    console.error('getInspectionStats error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '获取统计失败' } }
  }
}
