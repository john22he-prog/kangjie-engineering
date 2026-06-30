// PC端权限定义 — 与 miniprogram/utils/permissions.js 保持同步

export const PERMISSIONS = {
  MODULE_ENGINEERING: 'module:engineering',
  MODULE_BOILER: 'module:boiler',
  MODULE_COMPANY: 'module:company',
  MODULE_BUSINESS: 'module:business',

  BUSINESS_VIEW: 'business:view',
  BUSINESS_MANAGE: 'business:manage',

  RECORD_WRITE: 'record:write',
  RECORD_DELETE: 'record:delete',
  INSPECTION_WRITE: 'inspection:write',
  INSPECTION_MANAGE: 'inspection:manage',

  BOILER_WRITE: 'boiler:write',
  BOILER_MANAGE: 'boiler:manage',

  ALERT_VIEW: 'alert:view',
  ALERT_ACK: 'alert:ack',

  DASHBOARD_VIEW: 'dashboard:view',
  COST_VIEW: 'cost:view',
  EXPORT_DATA: 'export:data',
  DATA_IMPORT: 'data:import',
  AI_USE: 'ai:use',

  ASSET_MANAGE: 'asset:manage',
  PART_MANAGE: 'part:manage',
  INVENTORY_MANAGE: 'inventory:manage',
  THRESHOLD_MANAGE: 'threshold:manage',

  // 消息通知
  NOTIFY_REPLACEMENT: 'notify:replacement',
  NOTIFY_INSPECTION: 'notify:inspection',
  NOTIFY_THRESHOLD: 'notify:threshold',
  NOTIFY_INVENTORY: 'notify:inventory',
  NOTIFY_FAULT: 'notify:fault',
  NOTIFY_BOILER_DAILY: 'notify:boiler_daily',

  FACTORY_MANAGE: 'factory:manage',
  FACTORY_SWITCH: 'factory:switch',
  PC_LOGIN: 'pc:login',
  USER_MANAGE: 'user:manage',
  SYSTEM_ADMIN: 'system:admin',
}

export const PERMISSION_GROUPS = [
  {
    label: '模块访问',
    items: [
      { key: PERMISSIONS.MODULE_ENGINEERING, label: '工程部' },
      { key: PERMISSIONS.MODULE_BOILER, label: '锅炉房' },
      { key: PERMISSIONS.MODULE_COMPANY, label: '公司总览' },
      { key: PERMISSIONS.MODULE_BUSINESS, label: '业务部' },
    ],
  },
  {
    label: '业务部操作',
    items: [
      { key: PERMISSIONS.BUSINESS_VIEW, label: '查看酒店/片区匹配' },
      { key: PERMISSIONS.BUSINESS_MANAGE, label: '酒店建档/POI绑定管理' },
    ],
  },
  {
    label: '工程部操作',
    items: [
      { key: PERMISSIONS.RECORD_WRITE, label: '提交更换记录' },
      { key: PERMISSIONS.RECORD_DELETE, label: '删除/修改记录' },
      { key: PERMISSIONS.INSPECTION_WRITE, label: '提交巡检记录' },
      { key: PERMISSIONS.INSPECTION_MANAGE, label: '配置巡检计划' },
    ],
  },
  {
    label: '锅炉房操作',
    items: [
      { key: PERMISSIONS.BOILER_WRITE, label: '录入运行数据' },
      { key: PERMISSIONS.BOILER_MANAGE, label: '设备配置管理' },
    ],
  },
  {
    label: '报警',
    items: [
      { key: PERMISSIONS.ALERT_VIEW, label: '查看报警' },
      { key: PERMISSIONS.ALERT_ACK, label: '确认/处理报警' },
    ],
  },
  {
    label: '数据与看板',
    items: [
      { key: PERMISSIONS.DASHBOARD_VIEW, label: '查看数据看板' },
      { key: PERMISSIONS.COST_VIEW, label: '查看成本数据' },
      { key: PERMISSIONS.EXPORT_DATA, label: '导出数据' },
      { key: PERMISSIONS.DATA_IMPORT, label: '导入数据' },
      { key: PERMISSIONS.AI_USE, label: '数据分析报告' },
    ],
  },
  {
    label: '设备与库存管理',
    items: [
      { key: PERMISSIONS.ASSET_MANAGE, label: '管理设备' },
      { key: PERMISSIONS.PART_MANAGE, label: '管理配件' },
      { key: PERMISSIONS.INVENTORY_MANAGE, label: '库存管理' },
      { key: PERMISSIONS.THRESHOLD_MANAGE, label: '管理阈值' },
    ],
  },
  {
    label: '消息通知',
    items: [
      { key: PERMISSIONS.NOTIFY_REPLACEMENT, label: '更换记录通知' },
      { key: PERMISSIONS.NOTIFY_INSPECTION, label: '巡检记录通知' },
      { key: PERMISSIONS.NOTIFY_THRESHOLD, label: '阈值报警通知' },
      { key: PERMISSIONS.NOTIFY_INVENTORY, label: '低库存预警通知' },
      { key: PERMISSIONS.NOTIFY_FAULT, label: '故障申报通知' },
      { key: PERMISSIONS.NOTIFY_BOILER_DAILY, label: '锅炉房日报通知' },
    ],
  },
  {
    label: '系统管理',
    items: [
      { key: PERMISSIONS.FACTORY_MANAGE, label: '管理工厂' },
      { key: PERMISSIONS.FACTORY_SWITCH, label: '切换工厂' },
      { key: PERMISSIONS.PC_LOGIN, label: 'PC端登录' },
      { key: PERMISSIONS.USER_MANAGE, label: '用户管理' },
      { key: PERMISSIONS.SYSTEM_ADMIN, label: '系统管理员（最高权限）' },
    ],
  },
]

export const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS)

export const ROLE_TEMPLATES = {
  Admin: ALL_PERMISSION_KEYS.slice(),
  Management: [
    PERMISSIONS.MODULE_ENGINEERING,
    PERMISSIONS.MODULE_BOILER,
    PERMISSIONS.MODULE_COMPANY,
    PERMISSIONS.MODULE_BUSINESS,
    PERMISSIONS.BUSINESS_VIEW,
    PERMISSIONS.ALERT_VIEW,
    PERMISSIONS.ALERT_ACK,
    PERMISSIONS.COST_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.AI_USE,
    PERMISSIONS.EXPORT_DATA,
    PERMISSIONS.FACTORY_SWITCH,
    PERMISSIONS.PC_LOGIN,
    PERMISSIONS.NOTIFY_REPLACEMENT,
    PERMISSIONS.NOTIFY_INSPECTION,
    PERMISSIONS.NOTIFY_THRESHOLD,
    PERMISSIONS.NOTIFY_INVENTORY,
    PERMISSIONS.NOTIFY_FAULT,
    PERMISSIONS.NOTIFY_BOILER_DAILY,
  ],
  Supervisor: [
    PERMISSIONS.MODULE_ENGINEERING,
    PERMISSIONS.ALERT_VIEW,
    PERMISSIONS.ALERT_ACK,
    PERMISSIONS.INSPECTION_MANAGE,
    PERMISSIONS.COST_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.AI_USE,
    PERMISSIONS.PC_LOGIN,
    PERMISSIONS.NOTIFY_REPLACEMENT,
    PERMISSIONS.NOTIFY_INSPECTION,
    PERMISSIONS.NOTIFY_THRESHOLD,
    PERMISSIONS.NOTIFY_INVENTORY,
    PERMISSIONS.NOTIFY_FAULT,
  ],
  BoilerOperator: [
    PERMISSIONS.MODULE_BOILER,
    PERMISSIONS.BOILER_WRITE,
    PERMISSIONS.ALERT_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.NOTIFY_BOILER_DAILY,
  ],
  Engineer: [
    PERMISSIONS.MODULE_ENGINEERING,
    PERMISSIONS.RECORD_WRITE,
    PERMISSIONS.ALERT_VIEW,
    PERMISSIONS.INSPECTION_WRITE,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.NOTIFY_FAULT,
  ],
  Viewer: [
    PERMISSIONS.MODULE_ENGINEERING,
    PERMISSIONS.ALERT_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.AI_USE,
    PERMISSIONS.PC_LOGIN,
  ],
  Business: [
    PERMISSIONS.MODULE_COMPANY,
    PERMISSIONS.MODULE_BUSINESS,
    PERMISSIONS.BUSINESS_VIEW,
    PERMISSIONS.BUSINESS_MANAGE,
  ],
  BusinessViewer: [
    PERMISSIONS.MODULE_BUSINESS,
    PERMISSIONS.BUSINESS_VIEW,
  ],
}

export function getPermissionsForRole(role) {
  return (ROLE_TEMPLATES[role] || []).slice()
}

export function hasPermission(permissions, key) {
  if (!Array.isArray(permissions)) return false
  if (permissions.includes(PERMISSIONS.SYSTEM_ADMIN)) return true
  return permissions.includes(key)
}

export function migratePermissions(user) {
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions
  }
  const perms = getPermissionsForRole(user.role || 'Viewer')
  if (user.canPcLogin && !perms.includes(PERMISSIONS.PC_LOGIN)) {
    perms.push(PERMISSIONS.PC_LOGIN)
  }
  return perms
}
