const mysql = require('serverless-mysql');

const db = mysql({
  config: {
    host: process.env.MYSQL_ADDRESS,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DBNAME,
    charset: 'utf8mb4',
    dateStrings: true,
    connectTimeout: 10000,
  }
});

async function query(sql, params = []) {
  try {
    const results = await db.query(sql, params);
    await db.end();
    return results;
  } catch (err) {
    await db.end();
    throw err;
  }
}

async function transaction(fn) {
  try {
    await db.query('START TRANSACTION');
    const result = await fn(db);
    await db.query('COMMIT');
    await db.end();
    return result;
  } catch (err) {
    await db.query('ROLLBACK');
    await db.end();
    throw err;
  }
}

module.exports = db;
module.exports.query = query;
module.exports.transaction = transaction;
