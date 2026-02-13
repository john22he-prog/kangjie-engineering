// 云函数：adminFactoryManage — 工厂增删改查（Admin only）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function genId() {
  return 'F-' + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 1000)).padStart(3, '0')
}

async function ensureCollection(db, name) {
  try {
    await db.createCollection(name)
    console.log('Collection created:', name)
  } catch (e) {
    // 集合已存在或无权限时忽略
    console.log('ensureCollection ' + name + ':', e.message || e.errMsg || '')
  }
}

exports.main = async (event, context) => {
  try {
    const { action, data } = event

    // TODO: 生产环境增加 JWT 鉴权 + Admin 角色校验

    switch (action) {
      case 'list': {
        const { data: factories } = await db.collection('factories')
          .orderBy('factoryCode', 'asc')
          .get()
        return { ok: true, data: { list: factories } }
      }

      case 'create': {
        const { factoryName, factoryCode, address } = data
        if (!factoryName || !factoryCode) {
          return { ok: false, error: { code: 'VALIDATION_FAILED', message: '工厂名称和编号必填' } }
        }
        // 检查编号唯一性
        const { data: existing } = await db.collection('factories').where({ factoryCode }).limit(1).get()
        if (existing.length > 0) {
          return { ok: false, error: { code: 'DUPLICATE', message: '工厂编号已存在' } }
        }
        const factory = {
          factoryId: genId(),
          factoryName,
          factoryCode,
          address: address || '',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        await ensureCollection(db, 'factories')
        await db.collection('factories').add({ data: factory })
        return { ok: true, data: { factoryId: factory.factoryId } }
      }

      case 'update': {
        const { factoryId, factoryName, factoryCode, address, status } = data
        if (!factoryId) {
          return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 factoryId' } }
        }
        const { data: factories } = await db.collection('factories').where({ factoryId }).limit(1).get()
        if (factories.length === 0) {
          return { ok: false, error: { code: 'NOT_FOUND', message: '工厂不存在' } }
        }
        const updateData = { updatedAt: Date.now() }
        if (factoryName !== undefined) updateData.factoryName = factoryName
        if (factoryCode !== undefined) updateData.factoryCode = factoryCode
        if (address !== undefined) updateData.address = address
        if (status !== undefined) updateData.status = status
        await db.collection('factories').doc(factories[0]._id).update({ data: updateData })
        return { ok: true, data: {} }
      }

      default:
        return { ok: false, error: { code: 'UNKNOWN_ACTION', message: `未知操作: ${action}` } }
    }
  } catch (err) {
    console.error('adminFactoryManage error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '工厂管理操作失败: ' + (err.message || String(err)) } }
  }
}
