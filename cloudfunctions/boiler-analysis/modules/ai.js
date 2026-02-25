const STUB_RESPONSE = { code: 0, message: 'AI功能开发中' };

async function dailyReport() {
  return STUB_RESPONSE;
}

async function diagnosis() {
  return STUB_RESPONSE;
}

async function forecast() {
  return STUB_RESPONSE;
}

async function chat() {
  return STUB_RESPONSE;
}

module.exports = { dailyReport, diagnosis, forecast, chat };
