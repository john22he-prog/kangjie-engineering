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

    // 权限校验
    const { data: users } = await db.collection('users')
      .where({ openid, status: 'active' })
      .limit(1)
      .get()
    if (users.length === 0) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '未绑定或账号已禁用' } }
    }
    const user = users[0]
    if (!['Engineer', 'Supervisor', 'Admin'].includes(user.role)) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '仅工程人员/主管/管理员可提交巡检' } }
    }

    // 入参校验
    const { assetId, images, condition, remark } = event
    if (!assetId) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少设备ID' } }
    }
    if (!Array.isArray(images) || images.length < 1) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '至少上传 1 张照片' } }
    }

    const factoryId = user.factoryId || null
    const today = getTodayStr()

    // 查找当前 active 巡检计划
    const planWhere = { status: 'active' }
    if (factoryId) planWhere.factoryId = factoryId

    const { data: plans } = await db.collection('inspection_plans')
      .where(planWhere)
      .limit(1)
      .get()

    if (plans.length === 0) {
      return { ok: false, error: { code: 'NO_PLAN', message: '当前没有有效的巡检计划' } }
    }
    const plan = plans[0]

    // 检查设备是否在巡检计划中
    const planAssets = plan.assets || []
    const targetAsset = planAssets.find(a => a.assetId === assetId)
    if (!targetAsset) {
      return { ok: false, error: { code: 'ASSET_NOT_IN_PLAN', message: '该设备不在今日巡检清单中' } }
    }

    // 检查今日是否已打卡
    const { data: existingLogs } = await db.collection('inspection_logs')
      .where({ planId: plan._id, assetId, inspectDate: today })
      .limit(1)
      .get()

    if (existingLogs.length > 0) {
      return { ok: false, error: { code: 'ALREADY_CHECKED', message: '该设备今日已完成巡检打卡' } }
    }

    // 写入打卡记录
    const now = Date.now()
    const logDoc = {
      factoryId,
      planId: plan._id,
      assetId: targetAsset.assetId,
      assetName: targetAsset.assetName,
      assetNo: targetAsset.assetNo,
      inspectDate: today,
      userId: user.userId,
      userDisplayName: user.displayName,
      images,
      condition: condition || 'normal',
      remark: remark || '',
      createdAt: now
    }

    await db.collection('inspection_logs').add({ data: logDoc })

    // 查询打卡后的完成进度
    const { total: completedCount } = await db.collection('inspection_logs')
      .where({ planId: plan._id, inspectDate: today })
      .count()

    // ========== 异步发送巡检打卡通知 ==========
    try {
      const pad = n => String(n).padStart(2, '0')
      const nowDate = new Date(now)
      const submitTime = `${nowDate.getFullYear()}-${pad(nowDate.getMonth()+1)}-${pad(nowDate.getDate())} ${pad(nowDate.getHours())}:${pad(nowDate.getMinutes())}`
      const statusText = (condition === 'normal') ? '正常' : '异常'

      await cloud.callFunction({
        name: 'sendNotification',
        data: {
          type: 'INSPECTION',
          factoryId,
          excludeOpenid: openid,
          data: {
            planName: plan.planName || targetAsset.assetName,
            assetName: targetAsset.assetName,
            status: statusText,
            inspectDate: today,
            submitTime,
            remark: remark || `进度 ${completedCount}/${planAssets.length}`,
          }
        }
      })
    } catch (notifyErr) {
      console.warn('巡检通知发送失败（不影响主流程）:', notifyErr.message || notifyErr)
    }

    return {
      ok: true,
      data: {
        completed: completedCount,
        total: planAssets.length,
        assetName: targetAsset.assetName
      }
    }
  } catch (err) {
    console.error('submitInspectionLog error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '提交巡检失败: ' + (err.message || String(err)) } }
  }
}

function getTodayStr() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
