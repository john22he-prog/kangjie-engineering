const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const COLLECTIONS = ['inspection_plans', 'users', 'assets']
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

    // 权限校验：仅 Admin / Supervisor
    const { data: users } = await db.collection('users')
      .where({ openid, status: 'active' })
      .limit(1)
      .get()
    if (users.length === 0) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '未绑定或账号已禁用' } }
    }
    const user = users[0]
    if (!['Supervisor', 'Admin'].includes(user.role)) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '仅主管/管理员可配置巡检计划' } }
    }

    const { assetIds, planName } = event
    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '请选择至少 1 台设备' } }
    }

    const factoryId = user.factoryId || null

    // 查询设备详情，构建 assets 快照
    const assets = []
    for (let i = 0; i < assetIds.length; i += 20) {
      const batch = assetIds.slice(i, i + 20)
      const { data: batchAssets } = await db.collection('assets')
        .where({ assetId: _.in(batch), status: 'active' })
        .get()
      batchAssets.forEach((a, idx) => {
        assets.push({
          assetId: a.assetId,
          assetName: a.assetName,
          assetNo: a.assetNo,
          sortOrder: i + idx
        })
      })
    }

    if (assets.length === 0) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '未找到有效设备' } }
    }

    const now = Date.now()

    // 查找是否已有 active 计划
    const planWhere = { status: 'active' }
    if (factoryId) planWhere.factoryId = factoryId

    const { data: existingPlans } = await db.collection('inspection_plans')
      .where(planWhere)
      .limit(1)
      .get()

    if (existingPlans.length > 0) {
      // 更新现有计划
      await db.collection('inspection_plans').doc(existingPlans[0]._id).update({
        data: {
          planName: planName || existingPlans[0].planName || '日常巡检',
          assets,
          updatedBy: user.userId,
          updatedAt: now
        }
      })
      return {
        ok: true,
        data: { planId: existingPlans[0]._id, assetCount: assets.length, action: 'updated' }
      }
    } else {
      // 创建新计划
      const result = await db.collection('inspection_plans').add({
        data: {
          factoryId,
          planName: planName || '日常巡检',
          assets,
          status: 'active',
          createdBy: user.userId,
          createdAt: now,
          updatedAt: now
        }
      })
      return {
        ok: true,
        data: { planId: result._id, assetCount: assets.length, action: 'created' }
      }
    }
  } catch (err) {
    console.error('setInspectionPlan error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '设置巡检计划失败: ' + (err.message || String(err)) } }
  }
}
