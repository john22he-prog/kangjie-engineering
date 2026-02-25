const { query } = require('../db')
const { checkRole } = require('../middleware/role')
const { resolveFactoryScope } = require('../middleware/dataScope')

async function handle(action, event, user) {
  switch (action) {
    case 'list':
      return list(event, user)
    case 'detail':
      return detail(event, user)
    case 'create':
      return create(event, user)
    case 'update':
      return update(event, user)
    default:
      throw { code: 400, message: `boiler 模块不支持 action: ${action}` }
  }
}

async function list(event, user) {
  const factoryId = resolveFactoryScope(user, event.factoryId)
  if (!factoryId) throw { code: 400, message: '缺少 factoryId' }

  const rows = await query(
    'SELECT * FROM boiler WHERE factory_id = ? AND status = 1 ORDER BY sort_order ASC',
    [factoryId]
  )
  return { code: 0, data: rows }
}

async function detail(event, user) {
  if (!event.id) throw { code: 400, message: '缺少参数 id' }

  const rows = await query('SELECT * FROM boiler WHERE id = ? AND status = 1 LIMIT 1', [event.id])
  if (rows.length === 0) throw { code: 404, message: '锅炉不存在' }

  return { code: 0, data: rows[0] }
}

async function create(event, user) {
  checkRole(user, ['admin'])

  const { factory_id, name, model, rated_capacity, fuel_type, sort_order, remark } = event
  if (!factory_id || !name) throw { code: 400, message: '工厂ID和锅炉名称不能为空' }

  const result = await query(
    `INSERT INTO boiler (factory_id, name, model, rated_capacity, fuel_type, sort_order, remark, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
    [factory_id, name, model || '', rated_capacity || 0, fuel_type || '', sort_order || 0, remark || '', user.id]
  )

  return { code: 0, data: { id: result.insertId } }
}

async function update(event, user) {
  checkRole(user, ['admin'])

  const { id, ...fields } = event
  if (!id) throw { code: 400, message: '缺少参数 id' }

  const allowedFields = ['name', 'model', 'rated_capacity', 'fuel_type', 'sort_order', 'remark', 'status']
  const sets = []
  const params = []
  for (const key of allowedFields) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`)
      params.push(fields[key])
    }
  }

  if (sets.length === 0) throw { code: 400, message: '没有可更新的字段' }

  sets.push('updated_at = NOW()')
  params.push(id)

  await query(`UPDATE boiler SET ${sets.join(', ')} WHERE id = ?`, params)
  return { code: 0, data: { id } }
}

module.exports = { handle }
