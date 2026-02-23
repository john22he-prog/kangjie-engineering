const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const COLLECTIONS = ['inspection_plans', 'inspection_logs', 'users']
let _ensured = false
async function ensureCollections() {
  if (_ensured) return
  for (const name of COLLECTIONS) {
    try { await db.createCollection(name) } catch (e) {}
  }
  _ensured = true
}

exports.main = async (event, context) => {
  await ensureCollections()
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) {
      return { ok: false, error: { code: 'AUTH_FAILED', message: '无法获取用户身份' } }
    }

    const { data: users } = await db.collection('users')
      .where({ openid, status: 'active' })
      .limit(1)
      .get()
    if (users.length === 0) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '未绑定或账号已禁用' } }
    }
    const user = users[0]
    const factoryId = user.factoryId || null

    // 查询当前工厂的 active 巡检计划
    const planWhere = { status: 'active' }
    if (factoryId) planWhere.factoryId = factoryId

    const { data: plans } = await db.collection('inspection_plans')
      .where(planWhere)
      .limit(1)
      .get()

    if (plans.length === 0) {
      return {
        ok: true,
        data: {
          plan: null,
          assets: [],
          completed: 0,
          total: 0,
          inspectDate: getTodayStr()
        }
      }
    }

    const plan = plans[0]
    const planAssets = plan.assets || []
    const today = getTodayStr()

    // 查询今日已完成的打卡记录
    const logWhere = { planId: plan._id, inspectDate: today }
    if (factoryId) logWhere.factoryId = factoryId

    const { data: logs } = await db.collection('inspection_logs')
      .where(logWhere)
      .limit(1000)
      .get()

    const logMap = {}
    logs.forEach(log => {
      logMap[log.assetId] = {
        userId: log.userId,
        userDisplayName: log.userDisplayName,
        images: log.images,
        remark: log.remark,
        createdAt: log.createdAt
      }
    })

    const assetList = planAssets.map(a => ({
      assetId: a.assetId,
      assetName: a.assetName,
      assetNo: a.assetNo,
      sortOrder: a.sortOrder || 0,
      done: !!logMap[a.assetId],
      log: logMap[a.assetId] || null
    }))

    assetList.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      return (a.sortOrder || 0) - (b.sortOrder || 0)
    })

    return {
      ok: true,
      data: {
        plan: { _id: plan._id, planName: plan.planName, factoryId: plan.factoryId },
        assets: assetList,
        completed: logs.length,
        total: planAssets.length,
        inspectDate: today
      }
    }
  } catch (err) {
    console.error('getInspectionPlan error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '获取巡检计划失败: ' + (err.message || String(err)) } }
  }
}

function getTodayStr() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
