const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const { authenticate } = require('./middleware/auth');
const statistics = require('./modules/statistics');
const alert = require('./modules/alert');
const ai = require('./modules/ai');

const MODULE_MAP = {
  statistics: {
    overview: statistics.overview,
    trend: statistics.trend,
    compare: statistics.compare,
    customerStats: statistics.customerStats
  },
  alert: {
    list: alert.list,
    resolve: alert.resolve,
    acknowledge: alert.acknowledge
  },
  ai: {
    dailyReport: ai.dailyReport,
    diagnosis: ai.diagnosis,
    forecast: ai.forecast,
    chat: ai.chat
  }
};

exports.main = async (event, context) => {
  const { module: mod, action, ...params } = event;

  if (!mod || !action) {
    return { code: 4000, message: '缺少 module 或 action 参数' };
  }

  const moduleActions = MODULE_MAP[mod];
  if (!moduleActions) {
    return { code: 4000, message: `未知模块: ${mod}` };
  }

  const handler = moduleActions[action];
  if (!handler) {
    return { code: 4000, message: `未知操作: ${mod}.${action}` };
  }

  const authResult = await authenticate(event);
  if (authResult.code !== 0) {
    return authResult;
  }

  const { user, factoryScope } = authResult;

  try {
    return await handler(params, user, factoryScope);
  } catch (err) {
    console.error(`[${mod}.${action}] 未捕获异常:`, err);
    return { code: 9999, message: '系统错误' };
  }
};
