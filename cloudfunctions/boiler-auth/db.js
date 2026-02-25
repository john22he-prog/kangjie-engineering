const mysql = require('serverless-mysql')

const db = mysql({
  config: {
    host: process.env.MYSQL_ADDRESS,
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DBNAME,
    charset: 'utf8mb4',
    dateStrings: true,
    connectTimeout: 10000,
  },
})

async function query(sql, params = []) {
  try {
    const results = await db.query(sql, params)
    await db.end()
    return results
  } catch (err) {
    await db.end()
    throw err
  }
}

async function transaction(fn) {
  const conn = db
  try {
    await conn.query('START TRANSACTION')
    const result = await fn(conn)
    await conn.query('COMMIT')
    await conn.end()
    return result
  } catch (err) {
    await conn.query('ROLLBACK')
    await conn.end()
    throw err
  }
}

module.exports = { query, transaction, db }
