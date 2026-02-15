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
        const totalItems = invList.reduce((sum, i) => sum + (i.currentQty || 0), 0)
        const lowStockCount = invList.filter(i => (i.lowStockThreshold > 0 || i.threshold > 0) && i.currentQty <= (i.lowStockThreshold || i.threshold || 0)).length

        // 查配件表（用于兜底价格）
        const partsMap = {}
        try {
          const { data: parts } = await db.collection('parts').limit(1000).get()
          parts.forEach(p => { partsMap[p.partSkuId] = p })
        } catch (e) {}

        // 从入库日志回算均价（兜底）
        const ibCostMap = {}
        try {
          const ibAllWhere = { ...where }
          const { data: ibAll } = await db.collection('inventory_inbound_logs').where(ibAllWhere).limit(2000).get()
          for (const log of ibAll) {
            if (!ibCostMap[log.partSkuId]) ibCostMap[log.partSkuId] = { totalCost: 0, totalQty: 0 }
            ibCostMap[log.partSkuId].totalCost += (log.totalPrice || (log.qty || 0) * (log.unitPrice || 0))
            ibCostMap[log.partSkuId].totalQty += (log.qty || 0)
          }
        } catch (e) {}

        // 辅助函数：获取某配件最优单价
        function getBestPrice(partSkuId) {
          const inv = invList.find(i => i.partSkuId === partSkuId)
          if (inv && inv.avgUnitCost > 0) return inv.avgUnitCost
          const ibc = ibCostMap[partSkuId]
          if (ibc && ibc.totalQty > 0) return ibc.totalCost / ibc.totalQty
          const part = partsMap[partSkuId]
          if (part && part.unitPrice > 0) return part.unitPrice
          return 0
        }

        // 库存总价值：逐条计算，兜底回退
        let totalInventoryValue = 0
        for (const inv of invList) {
          let avgCost = inv.avgUnitCost || 0
          if (!avgCost) avgCost = getBestPrice(inv.partSkuId)
          const value = inv.totalCostValue || (inv.currentQty || 0) * avgCost
          totalInventoryValue += value
        }

        const ibWhere = { ...where }
        const obWhere = { ...where }
        if (yearMonth) {
          ibWhere.yearMonth = yearMonth
          obWhere.yearMonth = yearMonth
        }

        const { data: inbounds } = await db.collection('inventory_inbound_logs').where(ibWhere).get()
        const { data: outbounds } = await db.collection('inventory_outbound_logs').where(obWhere).get()
        const totalInboundValue = inbounds.reduce((sum, l) => sum + (l.totalPrice || 0), 0)

        // 出库金额：先查出库日志，若无则从更换记录统计
        let totalOutboundValue = 0
        if (outbounds.length > 0) {
          for (const ob of outbounds) {
            let cost = ob.totalCost || 0
            if (!cost) cost = (ob.qty || 0) * getBestPrice(ob.partSkuId)
            totalOutboundValue += cost
          }
        } else {
          // 无出库日志 → 从更换记录统计
          const repWhere = { ...where }
          if (yearMonth) repWhere.yearMonth = yearMonth
          repWhere.disabled = db.command.neq(true)
          try {
            const { data: repLogs } = await db.collection('replacement_logs').where(repWhere).limit(1000).get()
            for (const log of repLogs) {
              for (const item of (log.items || [])) {
                let cost = item.itemCost || ((item.qty || 0) * (item.unitCost || 0))
                if (!cost) cost = (item.qty || 0) * getBestPrice(item.partSkuId)
                totalOutboundValue += cost
              }
            }
          } catch (e) {}
        }

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
