// utils/constants.js — 错误文案 / 枚举常量

// 更换类型
const REPLACE_TYPES = ['维修', '预防', '紧急']

// 角色
const ROLES = {
  ENGINEER: 'Engineer',
  VIEWER: 'Viewer',
  SUPERVISOR: 'Supervisor',
  MANAGEMENT: 'Management',
  ADMIN: 'Admin'
}

// 报警状态
const ALERT_STATUS = {
  OPEN: 'OPEN',
  ACK: 'ACK',
  CLOSED: 'CLOSED'
}

// 统一错误文案
const ERRORS = {
  TYPE_REQUIRED: '请选择更换类型',
  LOCATION_REQUIRED: '请选择部位',
  SKU_REQUIRED: '请选择至少 1 个配件',
  QTY_INVALID: '数量必须为正整数',
  IMAGE_REQUIRED: '至少上传 1 张照片',
  NO_PARTS_FOR_LOCATION: '该部位未配置可用配件，请联系管理员',
  SUBMIT_FAILED_OFFLINE: '提交失败，已保存待同步',
  SYNC_FAILED: '同步失败',
  ASSET_NOT_FOUND: '未找到该设备或设备已停用，请联系管理员',
  ACK_NOTE_REQUIRED: '请填写确认说明'
}

// 离线队列 Storage Key
const OFFLINE_QUEUE_KEY = 'KJ_OFFLINE_QUEUE'

module.exports = {
  REPLACE_TYPES,
  ROLES,
  ALERT_STATUS,
  ERRORS,
  OFFLINE_QUEUE_KEY
}
