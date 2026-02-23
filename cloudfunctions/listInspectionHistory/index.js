const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
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

    const { startDate, endDate, page = 1, pageSize = 30 } = event

    // 获取当前 active 巡检计划（用于总数）
    const planWhere = { status: 'active' }
    if (factoryId) planWhere.factoryId = factoryId
    const { data: plans } = await db.collection('inspection_plans')
      .where(planWhere)
      .limit(1)
      .get()

    const planTotal = plans.length > 0 ? (plans[0].assets || []).length : 0
    const planId = plans.length > 0 ? plans[0]._id : null

    // 构建查询条件
    const logWhere = {}
    if (factoryId) logWhere.factoryId = factoryId
    if (planId) logWhere.planId = planId

    if (startDate && endDate) {
      logWhere.inspectDate = _.gte(startDate).and(_.lte(endDate))
    } else if (startDate) {
      logWhere.inspectDate = _.gte(startDate)
    } else if (endDate) {
      logWhere.inspectDate = _.lte(endDate)
    }

    // 查询所有符合条件的打卡记录
    const { data: logs } = await db.collection('inspection_logs')
      .where(logWhere)
      .orderBy('inspectDate', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get()

    // 按日期分组
    const dateMap = {}
    logs.forEach(log => {
      if (!dateMap[log.inspectDate]) {
        dateMap[log.inspectDate] = []
      }
      dateMap[log.inspectDate].push({
        assetId: log.assetId,
        assetName: log.assetName,
        assetNo: log.assetNo,
        userId: log.userId,
        userDisplayName: log.userDisplayName,
        images: log.images,
        remark: log.remark,
        createdAt: log.createdAt
      })
    })

    // 转换为列表并分页
    const allDates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a))
    const total = allDates.length
    const pagedDates = allDates.slice((page - 1) * pageSize, page * pageSize)

    const list = pagedDates.map(date => ({
      inspectDate: date,
      completed: dateMap[date].length,
      total: planTotal,
      logs: dateMap[date]
    }))

    return {
      ok: true,
      data: { list, total, planTotal }
    }
  } catch (err) {
    console.error('listInspectionHistory error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '查询巡检历史失败: ' + (err.message || String(err)) } }
  }
}
