const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { authenticate } = require('./middleware/auth')
const factoryModule = require('./modules/factory')
const boilerModule = require('./modules/boiler')
const customerModule = require('./modules/customer')
const recordModule = require('./modules/record')
const { query } = require('./db')
const fs = require('fs')
const path = require('path')

const MODULES = {
  factory: factoryModule,
  boiler: boilerModule,
  customer: customerModule,
  record: recordModule,
}

let _schemaReady = false

async function ensureSchema() {
  if (_schemaReady) return
  try {
    await query('SELECT 1 FROM daily_record LIMIT 1')
    _schemaReady = true
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || (err.message && err.message.includes("doesn't exist"))) {
      console.log('[boiler-core] Tables missing, running schema init...')
      const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
      const statements = sql
        .split(';')
        .map(s => s.replace(/--[^\n]*/g, '').trim())
        .filter(s => s.length > 0)
      for (const stmt of statements) {
        try {
          await query(stmt)
        } catch (e) {
          console.warn('[boiler-core] Schema stmt warning:', e.message)
        }
      }
      _schemaReady = true
      console.log('[boiler-core] Schema init complete')
    } else {
      throw err
    }
  }
}

exports.main = async (event, context) => {
  const { module: moduleName, action, ...payload } = event

  // 特殊 action: testDb — 最小化连接测试
  if (moduleName === 'system' && action === 'testDb') {
    const envInfo = {
      MYSQL_ADDRESS: process.env.MYSQL_ADDRESS || '(未设置)',
      MYSQL_PORT: process.env.MYSQL_PORT || '(未设置)',
      MYSQL_USERNAME: process.env.MYSQL_USERNAME || '(未设置)',
      MYSQL_PASSWORD: process.env.MYSQL_PASSWORD ? '****已设置' : '(未设置)',
      MYSQL_DBNAME: process.env.MYSQL_DBNAME || '(未设置)',
    }
    try {
      const rows = await query('SELECT 1 AS ok')
      return { code: 0, message: 'MySQL connected', envInfo, result: rows }
    } catch (err) {
      return { code: 500, message: 'MySQL connection failed', envInfo, error: err.message, errCode: err.code }
    }
  }

  // 特殊 action: initSchema — 强制建表，无需认证
  if (moduleName === 'system' && action === 'initSchema') {
    try {
      _schemaReady = false
      const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
      const statements = sql
        .split(';')
        .map(s => s.replace(/--[^\n]*/g, '').trim())
        .filter(s => s.length > 0)
      const results = []
      for (const stmt of statements) {
        try {
          await query(stmt)
          results.push({ ok: true, sql: stmt.substring(0, 80) })
        } catch (e) {
          results.push({ ok: false, sql: stmt.substring(0, 80), error: e.message })
        }
      }
      _schemaReady = true
      return { code: 0, message: 'Schema initialized', total: results.length, results }
    } catch (err) {
      return { code: 500, message: err.message }
    }
  }

  if (!moduleName || !action) {
    return { code: 400, message: '缺少 module 或 action 参数' }
  }

  const handler = MODULES[moduleName]
  if (!handler) {
    return { code: 400, message: `未知模块: ${moduleName}` }
  }

  try {
    await ensureSchema()
    const user = await authenticate(cloud, event)
    const result = await handler.handle(action, payload, user)
    return result
  } catch (err) {
    console.error(`[boiler-core] ${moduleName}.${action} 错误:`, err)
    if (err.code && err.message) {
      return { code: err.code, message: err.message }
    }
    return { code: 500, message: err.message || '服务器内部错误' }
  }
}
