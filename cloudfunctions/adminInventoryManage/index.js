// 云函数：adminInventoryManage — 库存查询、汇总、出入库记录查询
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { action, data = {} } = event

    switch (action) {
      case 'listInventory': {
        const { factoryId } = data
        const where = {}
        if (factoryId) where.factoryId = factoryId
        const { data: list } = await db.collection('inventory').where(where).get()
        return { ok: true, data: { list } }
      }

      case 'listInboundLogs': {
        const { factoryId, yearMonth } = data
        const where = {}
        if (factoryId) where.factoryId = factoryId
        if (yearMonth) where.yearMonth = yearMonth
        const { data: list } = await db.collection('inventory_inbound_logs')
          .where(where)
          .orderBy('ts', 'desc')
          .limit(200)
          .get()
        return { ok: true, data: { list } }
      }

      case 'listOutboundLogs': {
        const { factoryId, yearMonth } = data
        const where = {}
        if (factoryId) where.factoryId = factoryId
        if (yearMonth) where.yearMonth = yearMonth
        const { data: list } = await db.collection('inventory_outbound_logs')
          .where(where)
          .orderBy('ts', 'desc')
          .limit(200)
          .get()
        return { ok: true, data: { list } }
      }

      case 'summary': {
        const { factoryId, yearMonth } = data
        const where = {}
        if (factoryId) where.factoryId = factoryId

        const { data: invList } = await db.collection('inventory').where(where).get()
        const totalInventoryValue = invList.reduce((sum, i) => sum + (i.totalCostValue || 0), 0)
        const totalItems = invList.reduce((sum, i) => sum + (i.currentQty || 0), 0)
        const lowStockCount = invList.filter(i => i.currentQty <= i.lowStockThreshold).length

        const ibWhere = { ...where }
        const obWhere = { ...where }
        if (yearMonth) {
          ibWhere.yearMonth = yearMonth
          obWhere.yearMonth = yearMonth
        }

        const { data: inbounds } = await db.collection('inventory_inbound_logs').where(ibWhere).get()
        const { data: outbounds } = await db.collection('inventory_outbound_logs').where(obWhere).get()
        const totalInboundValue = inbounds.reduce((sum, l) => sum + (l.totalPrice || 0), 0)
        const totalOutboundValue = outbounds.reduce((sum, l) => sum + (l.totalCost || 0), 0)

        return {
          ok: true,
          data: {
            yearMonth: yearMonth || '',
            totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
            totalItems,
            totalInboundValue: Math.round(totalInboundValue * 100) / 100,
            totalOutboundValue: Math.round(totalOutboundValue * 100) / 100,
            lowStockCount,
          }
        }
      }

      case 'updateThreshold': {
        const { inventoryId, threshold } = data
        const { data: invList } = await db.collection('inventory').where({ inventoryId }).limit(1).get()
        if (invList.length === 0) {
          return { ok: false, error: { code: 'NOT_FOUND', message: '库存记录不存在' } }
        }
        await db.collection('inventory').doc(invList[0]._id).update({
          data: { lowStockThreshold: threshold, updatedAt: Date.now() }
        })
        return { ok: true, data: {} }
      }

      case 'listInventoryAlerts': {
        const { factoryId } = data
        const where = {}
        if (factoryId) where.factoryId = factoryId
        const { data: list } = await db.collection('inventory_alerts')
          .where(where)
          .orderBy('createdAt', 'desc')
          .limit(100)
          .get()
        return { ok: true, data: { list } }
      }

      default:
        return { ok: false, error: { code: 'UNKNOWN_ACTION', message: `未知操作: ${action}` } }
    }
  } catch (err) {
    console.error('adminInventoryManage error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '库存管理操作失败: ' + (err.message || String(err)) } }
  }
}
