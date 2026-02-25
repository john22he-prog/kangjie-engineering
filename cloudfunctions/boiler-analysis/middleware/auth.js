const cloud = require('wx-server-sdk');
const db = require('../db');

const ERROR_CODES = {
  NOT_REGISTERED: 1001,
  DISABLED: 1002,
  PERMISSION_DENIED: 2001,
  SYSTEM_ERROR: 9999
};

/**
 * 鉴权中间件：校验用户身份与权限
 * @param {object} event - 云函数事件对象
 * @param {object} [options] - 选项
 * @param {string[]} [options.allowedRoles] - 允许的角色列表，不传则允许所有已激活角色
 * @returns {object} { user, factoryScope } 或抛出包含 code/message 的错误对象
 */
async function authenticate(event, options = {}) {
  // PC 端通过 pcGateway 转发时携带 _pcAuth，跳过 OPENID 鉴权
  if (event && event._pcAuth) {
    const pcUser = event._pcAuth;
    const factoryScope = pcUser.role === 'operator' ? pcUser.factory_id : null;
    return { code: 0, user: pcUser, factoryScope };
  }

  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { code: ERROR_CODES.NOT_REGISTERED, message: '无法获取用户身份' };
  }

  try {
    const rows = await db.query(
      'SELECT id, openid, role, status, factory_id, real_name FROM app_user WHERE openid = ?',
      [OPENID]
    );
    await db.end();

    if (!rows || rows.length === 0) {
      return { code: ERROR_CODES.NOT_REGISTERED, message: '用户未注册' };
    }

    const user = rows[0];

    if (user.status !== 1 && user.status !== '1') {
      return { code: ERROR_CODES.DISABLED, message: '账号已停用' };
    }

    if (options.allowedRoles && !options.allowedRoles.includes(user.role)) {
      return { code: ERROR_CODES.PERMISSION_DENIED, message: '无操作权限' };
    }

    const factoryScope = user.role === 'operator' ? user.factory_id : null;

    return { code: 0, user, factoryScope };
  } catch (err) {
    console.error('[auth] 鉴权异常:', err);
    return { code: ERROR_CODES.SYSTEM_ERROR, message: '系统错误' };
  }
}

module.exports = { authenticate, ERROR_CODES };
