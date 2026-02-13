// 云函数：adminInventoryInbound — 配件入库（Supervisor+, PC端）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function getYearMonth(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

exports.main = async (event, context) => {
  try {
    const now = Date.now()
    const { factoryId, partSkuId, qty, unitPrice, supplier, batchNo, remark, operatorUserId } = event

    // TODO: 生产环境增加 JWT 鉴权 + Supervisor+ 角色校验

    if (!factoryId || !partSkuId || !qty || !unitPrice) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少必填字段' } }
    }
    if (qty <= 0 || unitPrice <= 0) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '数量和单价必须大于0' } }
    }

    // 查配件信息
    const { data: parts } = await db.collection('parts').where({ partSkuId }).limit(1).get()
    if (parts.length === 0) {
      return { ok: false, error: { code: 'PART_NOT_FOUND', message: '配件不存在' } }
    }
    const part = parts[0]
    const yearMonth = getYearMonth(now)

    // 写入入库记录
    const inboundId = `ib_${now}_${Math.random().toString(36).slice(2, 8)}`
    await db.collection('inventory_inbound_logs').add({
      data: {
        inboundId,
        factoryId,
        partSkuId,
        partNameSnapshot: part.partName,
        partCodeSnapshot: part.partCode,
        qty,
        unitPrice,
        totalPrice: Math.round(qty * unitPrice * 100) / 100,
        supplier: supplier || '',
        batchNo: batchNo || '',
        remark: remark || '',
        operatorUserId: operatorUserId || '',
        operatorNameSnapshot: '',  // TODO: 从JWT获取
        ts: now,
        yearMonth,
        createdAt: now
      }
    })

    // 更新库存（upsert）
    const { data: invList } = await db.collection('inventory')
      .where({ factoryId, partSkuId })
      .limit(1)
      .get()

    if (invList.length > 0) {
      const inv = invList[0]
      // 加权平均成本
      const newTotalCost = inv.currentQty * inv.avgUnitCost + qty * unitPrice
      const newTotalQty = inv.currentQty + qty
      const newAvgCost = newTotalQty > 0 ? Math.round((newTotalCost / newTotalQty) * 100) / 100 : unitPrice

      await db.collection('inventory').doc(inv._id).update({
        data: {
          currentQty: newTotalQty,
          avgUnitCost: newAvgCost,
          totalCostValue: Math.round(newTotalQty * newAvgCost * 100) / 100,
          lastInboundAt: now,
          updatedAt: now
        }
      })
    } else {
      // 创建新库存记录
      const inventoryId = `inv_${now}_${Math.random().toString(36).slice(2, 8)}`
      await db.collection('inventory').add({
        data: {
          inventoryId,
          factoryId,
          partSkuId,
          partNameSnapshot: part.partName,
          partCodeSnapshot: part.partCode,
          unitSnapshot: part.unit,
          specModelSnapshot: part.specModel || '',
          currentQty: qty,
          avgUnitCost: unitPrice,
          totalCostValue: Math.round(qty * unitPrice * 100) / 100,
          lowStockThreshold: 10,
          lastInboundAt: now,
          lastOutboundAt: null,
          updatedAt: now
        }
      })
    }

    return { ok: true, data: { inboundId } }
  } catch (err) {
    console.error('adminInventoryInbound error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '入库操作失败: ' + (err.message || String(err)) } }
  }
}
