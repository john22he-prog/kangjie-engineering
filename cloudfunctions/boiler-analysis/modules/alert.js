const db = require('../db');

/**
 * 告警列表
 */
async function list(params, user, factoryScope) {
  try {
    let { factoryId, status, page = 1, pageSize = 20 } = params;

    if (factoryScope) {
      factoryId = factoryScope;
    }

    const conditions = [];
    const values = [];

    if (factoryId) {
      conditions.push('al.factory_id = ?');
      values.push(factoryId);
    }
    if (status) {
      conditions.push('al.status = ?');
      values.push(status);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    const offset = (page - 1) * pageSize;

    const countResult = await db.query(
      `SELECT COUNT(*) AS total FROM alert_log al ${whereClause}`,
      values
    );
    const total = countResult[0].total;

    const rows = await db.query(
      `SELECT al.*, ar.name AS rule_name, ar.metric AS rule_metric,
              ar.operator AS rule_operator, ar.threshold AS rule_threshold,
              ar.severity AS rule_severity
       FROM alert_log al
       LEFT JOIN alert_rule ar ON al.rule_id = ar.id
       ${whereClause}
       ORDER BY al.triggered_at DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );
    await db.end();

    return {
      code: 0,
      data: {
        list: rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    };
  } catch (err) {
    console.error('[alert.list] error:', err);
    return { code: 9999, message: '获取告警列表失败' };
  }
}

/**
 * 解决告警（仅管理员）
 */
async function resolve(params, user, factoryScope) {
  try {
    if (user.role !== 'admin') {
      return { code: 2001, message: '仅管理员可解决告警' };
    }

    const { alertId, resolveNote } = params;
    if (!alertId) {
      return { code: 4001, message: '缺少必要参数: alertId' };
    }

    const result = await db.query(
      `UPDATE alert_log
       SET status = 'resolved',
           resolved_by = ?,
           resolved_at = NOW(),
           resolve_note = ?
       WHERE id = ?`,
      [user.id, resolveNote || null, alertId]
    );
    await db.end();

    if (result.affectedRows === 0) {
      return { code: 4004, message: '告警记录不存在' };
    }

    return { code: 0, data: { alertId, status: 'resolved' } };
  } catch (err) {
    console.error('[alert.resolve] error:', err);
    return { code: 9999, message: '解决告警失败' };
  }
}

/**
 * 确认告警（管理员或查看者）
 */
async function acknowledge(params, user, factoryScope) {
  try {
    if (!['admin', 'viewer'].includes(user.role)) {
      return { code: 2001, message: '无权确认告警' };
    }

    const { alertId } = params;
    if (!alertId) {
      return { code: 4001, message: '缺少必要参数: alertId' };
    }

    const result = await db.query(
      `UPDATE alert_log SET status = 'acknowledged' WHERE id = ?`,
      [alertId]
    );
    await db.end();

    if (result.affectedRows === 0) {
      return { code: 4004, message: '告警记录不存在' };
    }

    return { code: 0, data: { alertId, status: 'acknowledged' } };
  } catch (err) {
    console.error('[alert.acknowledge] error:', err);
    return { code: 9999, message: '确认告警失败' };
  }
}

module.exports = { list, resolve, acknowledge };
