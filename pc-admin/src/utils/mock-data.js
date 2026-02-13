/**
 * Mock 数据 —— 与小程序端 mock.js 数据保持一致
 * 生产环境接入 CloudBase 后可移除
 */
import dayjs from 'dayjs'

// ===== 用户 =====
// Supervisor 绑定 factoryId：主管看自己工厂全厂报告（含该工厂所有车间）
export const mockUsers = [
  { userId: 'u001', username: 'admin', displayName: '张管理', role: 'Admin', status: 'active', openid: 'mock_openid_admin', passwordHash: 'admin123', canPcLogin: true, factoryId: '', updatedAt: Date.now() },
  { userId: 'u002', username: 'supervisor', displayName: '李主管', role: 'Supervisor', status: 'active', openid: 'mock_openid_super', passwordHash: 'super123', canPcLogin: true, factoryId: 'F-001', updatedAt: Date.now() },
  { userId: 'u003', username: 'engineer1', displayName: '王工程师', role: 'Engineer', status: 'active', openid: 'mock_openid_eng1', passwordHash: '', canPcLogin: false, factoryId: '', updatedAt: Date.now() },
  { userId: 'u004', username: 'engineer2', displayName: '赵技术员', role: 'Engineer', status: 'active', openid: 'mock_openid_eng2', passwordHash: '', canPcLogin: false, factoryId: '', updatedAt: Date.now() },
  { userId: 'u005', username: 'viewer1', displayName: '孙查看员', role: 'Viewer', status: 'active', openid: '', passwordHash: '', canPcLogin: false, factoryId: '', updatedAt: Date.now() },
  { userId: 'u006', username: 'disabled_user', displayName: '周离职', role: 'Engineer', status: 'disabled', openid: '', passwordHash: '', canPcLogin: false, factoryId: '', updatedAt: Date.now() },
  { userId: 'u007', username: 'management', displayName: '赵管理层', role: 'Management', status: 'active', openid: 'mock_openid_mgmt', passwordHash: 'mgmt123', canPcLogin: true, factoryId: '', updatedAt: Date.now() },
]

// ===== 设备 =====
export const mockAssets = [
  { assetId: 'ZB-001', factoryId: 'F-001', assetName: '注塑机A-01', assetNo: 'EQ-2024-001', deviceTypeId: 'injection', workshop: 'A车间', status: 'active', createdAt: dayjs('2024-01-10').valueOf(), updatedAt: Date.now() },
  { assetId: 'ZB-002', factoryId: 'F-001', assetName: '注塑机A-02', assetNo: 'EQ-2024-002', deviceTypeId: 'injection', workshop: 'A车间', status: 'active', createdAt: dayjs('2024-01-15').valueOf(), updatedAt: Date.now() },
  { assetId: 'ZB-003', factoryId: 'F-001', assetName: '冲压机B-01', assetNo: 'EQ-2024-003', deviceTypeId: 'press', workshop: 'B车间', status: 'active', createdAt: dayjs('2024-03-01').valueOf(), updatedAt: Date.now() },
  { assetId: 'ZB-004', factoryId: 'F-001', assetName: '包装线C-01', assetNo: 'EQ-2024-004', deviceTypeId: 'packing', workshop: 'C车间', status: 'active', createdAt: dayjs('2024-06-20').valueOf(), updatedAt: Date.now() },
  { assetId: 'ZB-005', factoryId: 'F-001', assetName: '旧设备X', assetNo: 'EQ-2023-099', deviceTypeId: 'other', workshop: 'A车间', status: 'inactive', createdAt: dayjs('2023-05-01').valueOf(), updatedAt: Date.now() },
  { assetId: 'ZB-SZ01', factoryId: 'F-005', assetName: '洗衣龙1号', assetNo: 'EQ-SZ-001', deviceTypeId: 'washer', workshop: '洗涤车间', status: 'active', createdAt: dayjs('2024-08-01').valueOf(), updatedAt: Date.now() },
  { assetId: 'ZB-SZ02', factoryId: 'F-005', assetName: '烘干机1号', assetNo: 'EQ-SZ-002', deviceTypeId: 'dryer', workshop: '烘干车间', status: 'active', createdAt: dayjs('2024-08-01').valueOf(), updatedAt: Date.now() },
  { assetId: 'ZB-HZ01', factoryId: 'F-006', assetName: '烫平机1号', assetNo: 'EQ-HZ-001', deviceTypeId: 'ironer', workshop: '烫平车间', status: 'active', createdAt: dayjs('2024-09-01').valueOf(), updatedAt: Date.now() },
  { assetId: 'ZB-HZ02', factoryId: 'F-006', assetName: '折叠机1号', assetNo: 'EQ-HZ-002', deviceTypeId: 'folder', workshop: '折叠车间', status: 'active', createdAt: dayjs('2024-09-01').valueOf(), updatedAt: Date.now() },
]

// ===== 配件字典 =====
export const mockParts = [
  { partSkuId: 'SKU-001', partName: '液压油封', partCode: 'HYD-SEAL-01', unit: '个', specModel: 'φ50×30', active: true, source: 'manual', updatedAt: Date.now() },
  { partSkuId: 'SKU-002', partName: '导轨滑块', partCode: 'GUIDE-BLK-01', unit: '个', specModel: 'HGH25CA', active: true, source: 'manual', updatedAt: Date.now() },
  { partSkuId: 'SKU-003', partName: '加热圈', partCode: 'HEAT-RING-01', unit: '个', specModel: 'φ80×50', active: true, source: 'Excel', updatedAt: Date.now() },
  { partSkuId: 'SKU-004', partName: '滤芯', partCode: 'FILTER-01', unit: '个', specModel: '10μm', active: true, source: 'manual', updatedAt: Date.now() },
  { partSkuId: 'SKU-005', partName: '传送带', partCode: 'BELT-01', unit: '米', specModel: 'PVC-2000mm', active: true, source: 'ERP', updatedAt: Date.now() },
  { partSkuId: 'SKU-006', partName: '轴承', partCode: 'BEAR-6205', unit: '个', specModel: '6205-2RS', active: true, source: 'manual', updatedAt: Date.now() },
  { partSkuId: 'SKU-007', partName: '密封垫片', partCode: 'GASKET-01', unit: '片', specModel: 'φ40', active: true, source: 'manual', updatedAt: Date.now() },
  { partSkuId: 'SKU-008', partName: '电磁阀', partCode: 'SOL-VALVE-01', unit: '个', specModel: 'DC24V', active: false, source: 'manual', updatedAt: Date.now() },
]

// ===== 设备部位 =====
export const mockLocations = [
  { locationId: 'loc-001', assetId: 'ZB-001', locationName: '合模单元', sortOrder: 1, active: true, updatedAt: Date.now() },
  { locationId: 'loc-002', assetId: 'ZB-001', locationName: '射出单元', sortOrder: 2, active: true, updatedAt: Date.now() },
  { locationId: 'loc-003', assetId: 'ZB-001', locationName: '液压系统', sortOrder: 3, active: true, updatedAt: Date.now() },
  { locationId: 'loc-004', assetId: 'ZB-001', locationName: '电控系统', sortOrder: 4, active: true, updatedAt: Date.now() },
  { locationId: 'loc-005', assetId: 'ZB-002', locationName: '合模单元', sortOrder: 1, active: true, updatedAt: Date.now() },
  { locationId: 'loc-006', assetId: 'ZB-002', locationName: '射出单元', sortOrder: 2, active: true, updatedAt: Date.now() },
  { locationId: 'loc-007', assetId: 'ZB-003', locationName: '冲压模具', sortOrder: 1, active: true, updatedAt: Date.now() },
  { locationId: 'loc-008', assetId: 'ZB-003', locationName: '传动系统', sortOrder: 2, active: true, updatedAt: Date.now() },
  { locationId: 'loc-009', assetId: 'ZB-004', locationName: '传送带组件', sortOrder: 1, active: true, updatedAt: Date.now() },
  { locationId: 'loc-010', assetId: 'ZB-004', locationName: '封口单元', sortOrder: 2, active: true, updatedAt: Date.now() },
]

// ===== 部位→配件映射 =====
export const mockLocationPartMap = [
  { mapId: 'map-001', assetId: 'ZB-001', locationId: 'loc-001', partSkuId: 'SKU-001', active: true },
  { mapId: 'map-002', assetId: 'ZB-001', locationId: 'loc-001', partSkuId: 'SKU-002', active: true },
  { mapId: 'map-003', assetId: 'ZB-001', locationId: 'loc-002', partSkuId: 'SKU-003', active: true },
  { mapId: 'map-004', assetId: 'ZB-001', locationId: 'loc-002', partSkuId: 'SKU-007', active: true },
  { mapId: 'map-005', assetId: 'ZB-001', locationId: 'loc-003', partSkuId: 'SKU-001', active: true },
  { mapId: 'map-006', assetId: 'ZB-001', locationId: 'loc-003', partSkuId: 'SKU-004', active: true },
  { mapId: 'map-007', assetId: 'ZB-002', locationId: 'loc-005', partSkuId: 'SKU-001', active: true },
  { mapId: 'map-008', assetId: 'ZB-002', locationId: 'loc-005', partSkuId: 'SKU-002', active: true },
  { mapId: 'map-009', assetId: 'ZB-002', locationId: 'loc-006', partSkuId: 'SKU-003', active: true },
  { mapId: 'map-010', assetId: 'ZB-003', locationId: 'loc-007', partSkuId: 'SKU-006', active: true },
  { mapId: 'map-011', assetId: 'ZB-003', locationId: 'loc-008', partSkuId: 'SKU-005', active: true },
  { mapId: 'map-012', assetId: 'ZB-004', locationId: 'loc-009', partSkuId: 'SKU-005', active: true },
  { mapId: 'map-013', assetId: 'ZB-004', locationId: 'loc-010', partSkuId: 'SKU-007', active: true },
]

// ===== 阈值 =====
export const mockThresholds = [
  { thresholdId: 'th-001', assetId: 'ZB-001', partSkuId: 'SKU-001', thresholdMonthly: 10, active: true, updatedAt: Date.now() },
  { thresholdId: 'th-002', assetId: 'ZB-001', partSkuId: 'SKU-002', thresholdMonthly: 5, active: true, updatedAt: Date.now() },
  { thresholdId: 'th-003', assetId: 'ZB-001', partSkuId: 'SKU-003', thresholdMonthly: 8, active: true, updatedAt: Date.now() },
  { thresholdId: 'th-004', assetId: 'ZB-002', partSkuId: 'SKU-001', thresholdMonthly: 10, active: true, updatedAt: Date.now() },
  { thresholdId: 'th-005', assetId: 'ZB-003', partSkuId: 'SKU-006', thresholdMonthly: 6, active: true, updatedAt: Date.now() },
  { thresholdId: 'th-006', assetId: 'ZB-004', partSkuId: 'SKU-005', thresholdMonthly: 20, active: true, updatedAt: Date.now() },
]

// ===== 更换记录 =====
const now = Date.now()
const currentYM = dayjs().format('YYYY-MM')
const lastYM = dayjs().subtract(1, 'month').format('YYYY-MM')

export const mockReplacementLogs = [
  {
    logId: 'log-001', factoryId: 'F-001', assetId: 'ZB-001', assetNameSnapshot: '注塑机A-01', assetNoSnapshot: 'EQ-2024-001',
    reporterUserIdSnapshot: 'u003', reporterNameSnapshot: '王工程师',
    ts: now - 86400000 * 2, yearMonth: currentYM, type: '维修',
    locationIdSnapshot: 'loc-001', locationNameSnapshot: '合模单元',
    items: [{ partSkuId: 'SKU-001', partNameSnapshot: '液压油封', partCodeSnapshot: 'HYD-SEAL-01', qty: 3 }],
    remark: '发现油封老化漏油', images: ['mock://img1.jpg'], clientOfflineId: 'uuid-001', createdAt: now - 86400000 * 2,
  },
  {
    logId: 'log-002', factoryId: 'F-001', assetId: 'ZB-001', assetNameSnapshot: '注塑机A-01', assetNoSnapshot: 'EQ-2024-001',
    reporterUserIdSnapshot: 'u004', reporterNameSnapshot: '赵技术员',
    ts: now - 86400000 * 1, yearMonth: currentYM, type: '预防',
    locationIdSnapshot: 'loc-002', locationNameSnapshot: '射出单元',
    items: [
      { partSkuId: 'SKU-003', partNameSnapshot: '加热圈', partCodeSnapshot: 'HEAT-RING-01', qty: 2 },
      { partSkuId: 'SKU-007', partNameSnapshot: '密封垫片', partCodeSnapshot: 'GASKET-01', qty: 4 },
    ],
    remark: '定期保养更换', images: ['mock://img2.jpg', 'mock://img3.jpg'], clientOfflineId: 'uuid-002', createdAt: now - 86400000 * 1,
  },
  {
    logId: 'log-003', factoryId: 'F-001', assetId: 'ZB-001', assetNameSnapshot: '注塑机A-01', assetNoSnapshot: 'EQ-2024-001',
    reporterUserIdSnapshot: 'u003', reporterNameSnapshot: '王工程师',
    ts: now - 86400000 * 5, yearMonth: currentYM, type: '紧急',
    locationIdSnapshot: 'loc-003', locationNameSnapshot: '液压系统',
    items: [{ partSkuId: 'SKU-001', partNameSnapshot: '液压油封', partCodeSnapshot: 'HYD-SEAL-01', qty: 5 }],
    remark: '液压系统突发泄漏', images: ['mock://img4.jpg'], clientOfflineId: 'uuid-003', createdAt: now - 86400000 * 5,
  },
  {
    logId: 'log-004', factoryId: 'F-001', assetId: 'ZB-002', assetNameSnapshot: '注塑机A-02', assetNoSnapshot: 'EQ-2024-002',
    reporterUserIdSnapshot: 'u004', reporterNameSnapshot: '赵技术员',
    ts: now - 86400000 * 3, yearMonth: currentYM, type: '维修',
    locationIdSnapshot: 'loc-005', locationNameSnapshot: '合模单元',
    items: [{ partSkuId: 'SKU-002', partNameSnapshot: '导轨滑块', partCodeSnapshot: 'GUIDE-BLK-01', qty: 2 }],
    remark: '滑块磨损更换', images: ['mock://img5.jpg'], clientOfflineId: 'uuid-004', createdAt: now - 86400000 * 3,
  },
  {
    logId: 'log-005', factoryId: 'F-001', assetId: 'ZB-003', assetNameSnapshot: '冲压机B-01', assetNoSnapshot: 'EQ-2024-003',
    reporterUserIdSnapshot: 'u003', reporterNameSnapshot: '王工程师',
    ts: now - 86400000 * 7, yearMonth: currentYM, type: '维修',
    locationIdSnapshot: 'loc-007', locationNameSnapshot: '冲压模具',
    items: [{ partSkuId: 'SKU-006', partNameSnapshot: '轴承', partCodeSnapshot: 'BEAR-6205', qty: 4 }],
    remark: '轴承异响更换', images: ['mock://img6.jpg'], clientOfflineId: 'uuid-005', createdAt: now - 86400000 * 7,
  },
  {
    logId: 'log-006', factoryId: 'F-001', assetId: 'ZB-004', assetNameSnapshot: '包装线C-01', assetNoSnapshot: 'EQ-2024-004',
    reporterUserIdSnapshot: 'u004', reporterNameSnapshot: '赵技术员',
    ts: now - 86400000 * 10, yearMonth: currentYM, type: '预防',
    locationIdSnapshot: 'loc-009', locationNameSnapshot: '传送带组件',
    items: [{ partSkuId: 'SKU-005', partNameSnapshot: '传送带', partCodeSnapshot: 'BELT-01', qty: 15 }],
    remark: '传送带磨损预防性更换', images: ['mock://img7.jpg'], clientOfflineId: 'uuid-006', createdAt: now - 86400000 * 10,
  },
  {
    logId: 'log-007', factoryId: 'F-001', assetId: 'ZB-001', assetNameSnapshot: '注塑机A-01', assetNoSnapshot: 'EQ-2024-001',
    reporterUserIdSnapshot: 'u003', reporterNameSnapshot: '王工程师',
    ts: dayjs().subtract(1, 'month').valueOf(), yearMonth: lastYM, type: '维修',
    locationIdSnapshot: 'loc-001', locationNameSnapshot: '合模单元',
    items: [{ partSkuId: 'SKU-001', partNameSnapshot: '液压油封', partCodeSnapshot: 'HYD-SEAL-01', qty: 6 }],
    remark: '上月维修记录', images: ['mock://img8.jpg'], clientOfflineId: 'uuid-007', createdAt: dayjs().subtract(1, 'month').valueOf(),
  },
  { logId: 'log-sz01', factoryId: 'F-005', assetId: 'ZB-SZ01', assetNameSnapshot: '洗衣龙1号', assetNoSnapshot: 'EQ-SZ-001', reporterUserIdSnapshot: 'u003', reporterNameSnapshot: '王工程师', ts: now - 86400000 * 1, yearMonth: currentYM, type: '维修', locationIdSnapshot: 'loc-sz1', locationNameSnapshot: '主传动', items: [{ partSkuId: 'SKU-001', partNameSnapshot: '液压油封', partCodeSnapshot: 'HYD-SEAL-01', qty: 2 }], remark: '深圳工厂洗衣龙油封更换', images: ['mock://sz1.jpg'], clientOfflineId: 'uuid-sz01', createdAt: now - 86400000 * 1 },
  { logId: 'log-sz02', factoryId: 'F-005', assetId: 'ZB-SZ02', assetNameSnapshot: '烘干机1号', assetNoSnapshot: 'EQ-SZ-002', reporterUserIdSnapshot: 'u004', reporterNameSnapshot: '赵技术员', ts: now - 86400000 * 4, yearMonth: currentYM, type: '预防', locationIdSnapshot: 'loc-sz2', locationNameSnapshot: '加热系统', items: [{ partSkuId: 'SKU-003', partNameSnapshot: '加热圈', partCodeSnapshot: 'HEAT-RING-01', qty: 3 }], remark: '深圳烘干机定期保养', images: ['mock://sz2.jpg'], clientOfflineId: 'uuid-sz02', createdAt: now - 86400000 * 4 },
  { logId: 'log-hz01', factoryId: 'F-006', assetId: 'ZB-HZ01', assetNameSnapshot: '烫平机1号', assetNoSnapshot: 'EQ-HZ-001', reporterUserIdSnapshot: 'u003', reporterNameSnapshot: '王工程师', ts: now - 86400000 * 2, yearMonth: currentYM, type: '维修', locationIdSnapshot: 'loc-hz1', locationNameSnapshot: '滚筒', items: [{ partSkuId: 'SKU-006', partNameSnapshot: '轴承', partCodeSnapshot: 'BEAR-6205', qty: 4 }], remark: '杭州烫平机轴承更换', images: ['mock://hz1.jpg'], clientOfflineId: 'uuid-hz01', createdAt: now - 86400000 * 2 },
  { logId: 'log-hz02', factoryId: 'F-006', assetId: 'ZB-HZ02', assetNameSnapshot: '折叠机1号', assetNoSnapshot: 'EQ-HZ-002', reporterUserIdSnapshot: 'u004', reporterNameSnapshot: '赵技术员', ts: now - 86400000 * 5, yearMonth: currentYM, type: '预防', locationIdSnapshot: 'loc-hz2', locationNameSnapshot: '传动带', items: [{ partSkuId: 'SKU-005', partNameSnapshot: '传送带', partCodeSnapshot: 'BELT-01', qty: 8 }], remark: '杭州折叠机传送带保养', images: ['mock://hz2.jpg'], clientOfflineId: 'uuid-hz02', createdAt: now - 86400000 * 5 },
]

// ===== 月度用量汇总 =====
export const mockMonthlyUsage = [
  { assetId: 'ZB-001', partSkuId: 'SKU-001', yearMonth: currentYM, qtySum: 8, lastUpdatedAt: now },
  { assetId: 'ZB-001', partSkuId: 'SKU-003', yearMonth: currentYM, qtySum: 2, lastUpdatedAt: now },
  { assetId: 'ZB-001', partSkuId: 'SKU-007', yearMonth: currentYM, qtySum: 4, lastUpdatedAt: now },
  { assetId: 'ZB-002', partSkuId: 'SKU-002', yearMonth: currentYM, qtySum: 2, lastUpdatedAt: now },
  { assetId: 'ZB-003', partSkuId: 'SKU-006', yearMonth: currentYM, qtySum: 4, lastUpdatedAt: now },
  { assetId: 'ZB-004', partSkuId: 'SKU-005', yearMonth: currentYM, qtySum: 15, lastUpdatedAt: now },
  { assetId: 'ZB-001', partSkuId: 'SKU-001', yearMonth: lastYM, qtySum: 6, lastUpdatedAt: now },
]

// ===== 报警 =====
// 规则：当 qtySum > thresholdMonthly 时生成 OPEN 报警
export const mockAlerts = [
  {
    alertId: 'alert-001', factoryId: 'F-001', assetId: 'ZB-001', partSkuId: 'SKU-001',
    yearMonth: currentYM, thresholdValue: 10, currentQty: 13,
    status: 'OPEN', ackByUserId: null, ackTs: null, ackNote: null,
    createdAt: now - 86400000,
  },
  {
    alertId: 'alert-002', factoryId: 'F-001', assetId: 'ZB-003', partSkuId: 'SKU-006',
    yearMonth: currentYM, thresholdValue: 6, currentQty: 9,
    status: 'OPEN', ackByUserId: null, ackTs: null, ackNote: null,
    createdAt: now - 86400000 * 3,
  },
  {
    alertId: 'alert-003', factoryId: 'F-001', assetId: 'ZB-001', partSkuId: 'SKU-001',
    yearMonth: lastYM, thresholdValue: 10, currentQty: 12,
    status: 'ACK', ackByUserId: 'u002', ackTs: dayjs().subtract(15, 'day').valueOf(), ackNote: '已安排月度检查，使用量在可控范围内',
    createdAt: dayjs().subtract(1, 'month').valueOf(),
  },
  {
    alertId: 'alert-sz01', factoryId: 'F-005', assetId: 'ZB-SZ01', partSkuId: 'SKU-001',
    yearMonth: currentYM, thresholdValue: 5, currentQty: 6,
    status: 'OPEN', ackByUserId: null, ackTs: null, ackNote: null,
    createdAt: now - 86400000 * 2,
  },
  {
    alertId: 'alert-hz01', factoryId: 'F-006', assetId: 'ZB-HZ01', partSkuId: 'SKU-006',
    yearMonth: currentYM, thresholdValue: 4, currentQty: 5,
    status: 'OPEN', ackByUserId: null, ackTs: null, ackNote: null,
    createdAt: now - 86400000 * 1,
  },
]

// ===== 工厂 =====
export const mockFactories = [
  { factoryId: 'F-001', factoryName: '上海工厂', factoryCode: 'SH', address: '上海市浦东新区XX路100号', status: 'active', createdAt: dayjs('2024-01-01').valueOf(), updatedAt: Date.now() },
  { factoryId: 'F-002', factoryName: '北京工厂', factoryCode: 'BJ', address: '北京市朝阳区XX路200号', status: 'active', createdAt: dayjs('2024-03-01').valueOf(), updatedAt: Date.now() },
  { factoryId: 'F-003', factoryName: '广州工厂', factoryCode: 'GZ', address: '广州市天河区XX路300号', status: 'active', createdAt: dayjs('2024-06-01').valueOf(), updatedAt: Date.now() },
  { factoryId: 'F-004', factoryName: '成都工厂', factoryCode: 'CD', address: '成都市高新区XX路400号', status: 'active', createdAt: dayjs('2025-01-01').valueOf(), updatedAt: Date.now() },
  { factoryId: 'F-005', factoryName: '测试工厂-深圳', factoryCode: 'SZ', address: '深圳市南山区科技园XX路500号', status: 'active', createdAt: dayjs('2024-08-01').valueOf(), updatedAt: Date.now() },
  { factoryId: 'F-006', factoryName: '测试工厂-杭州', factoryCode: 'HZ', address: '杭州市余杭区五常大道XX号', status: 'active', createdAt: dayjs('2024-09-01').valueOf(), updatedAt: Date.now() },
]

// ===== 库存 =====
export const mockInventory = [
  { inventoryId: 'INV-001', factoryId: 'F-001', partSkuId: 'SKU-001', partNameSnapshot: '液压油封', partCodeSnapshot: 'HYD-SEAL-01', unitSnapshot: '个', specModelSnapshot: 'φ50×30', currentQty: 45, avgUnitCost: 35.00, totalCostValue: 1575.00, lowStockThreshold: 10, lastInboundAt: Date.now() - 86400000 * 5, lastOutboundAt: Date.now() - 86400000, updatedAt: Date.now() },
  { inventoryId: 'INV-002', factoryId: 'F-001', partSkuId: 'SKU-002', partNameSnapshot: '导轨滑块', partCodeSnapshot: 'GUIDE-BLK-01', unitSnapshot: '个', specModelSnapshot: 'HGH25CA', currentQty: 20, avgUnitCost: 120.00, totalCostValue: 2400.00, lowStockThreshold: 5, lastInboundAt: Date.now() - 86400000 * 10, lastOutboundAt: Date.now() - 86400000 * 2, updatedAt: Date.now() },
  { inventoryId: 'INV-003', factoryId: 'F-001', partSkuId: 'SKU-003', partNameSnapshot: '加热圈', partCodeSnapshot: 'HEAT-RING-01', unitSnapshot: '个', specModelSnapshot: 'φ80×50', currentQty: 8, avgUnitCost: 85.00, totalCostValue: 680.00, lowStockThreshold: 10, lastInboundAt: Date.now() - 86400000 * 15, lastOutboundAt: Date.now() - 86400000 * 3, updatedAt: Date.now() },
  { inventoryId: 'INV-004', factoryId: 'F-001', partSkuId: 'SKU-004', partNameSnapshot: '滤芯', partCodeSnapshot: 'FILTER-01', unitSnapshot: '个', specModelSnapshot: '10μm', currentQty: 30, avgUnitCost: 45.00, totalCostValue: 1350.00, lowStockThreshold: 8, lastInboundAt: Date.now() - 86400000 * 7, lastOutboundAt: Date.now() - 86400000, updatedAt: Date.now() },
  { inventoryId: 'INV-005', factoryId: 'F-001', partSkuId: 'SKU-006', partNameSnapshot: '轴承', partCodeSnapshot: 'BEAR-6205', unitSnapshot: '个', specModelSnapshot: '6205-2RS', currentQty: 3, avgUnitCost: 25.00, totalCostValue: 75.00, lowStockThreshold: 10, lastInboundAt: Date.now() - 86400000 * 20, lastOutboundAt: Date.now() - 86400000, updatedAt: Date.now() },
  { inventoryId: 'INV-SZ01', factoryId: 'F-005', partSkuId: 'SKU-001', partNameSnapshot: '液压油封', partCodeSnapshot: 'HYD-SEAL-01', unitSnapshot: '个', specModelSnapshot: 'φ50×30', currentQty: 25, avgUnitCost: 38.00, totalCostValue: 950.00, lowStockThreshold: 10, lastInboundAt: Date.now() - 86400000 * 3, lastOutboundAt: Date.now() - 86400000, updatedAt: Date.now() },
  { inventoryId: 'INV-SZ02', factoryId: 'F-005', partSkuId: 'SKU-003', partNameSnapshot: '加热圈', partCodeSnapshot: 'HEAT-RING-01', unitSnapshot: '个', specModelSnapshot: 'φ80×50', currentQty: 12, avgUnitCost: 90.00, totalCostValue: 1080.00, lowStockThreshold: 5, lastInboundAt: Date.now() - 86400000 * 7, lastOutboundAt: Date.now() - 86400000 * 4, updatedAt: Date.now() },
  { inventoryId: 'INV-HZ01', factoryId: 'F-006', partSkuId: 'SKU-006', partNameSnapshot: '轴承', partCodeSnapshot: 'BEAR-6205', unitSnapshot: '个', specModelSnapshot: '6205-2RS', currentQty: 40, avgUnitCost: 28.00, totalCostValue: 1120.00, lowStockThreshold: 8, lastInboundAt: Date.now() - 86400000 * 5, lastOutboundAt: Date.now() - 86400000 * 2, updatedAt: Date.now() },
  { inventoryId: 'INV-HZ02', factoryId: 'F-006', partSkuId: 'SKU-002', partNameSnapshot: '导轨滑块', partCodeSnapshot: 'GUIDE-BLK-01', unitSnapshot: '个', specModelSnapshot: 'HGH25CA', currentQty: 15, avgUnitCost: 115.00, totalCostValue: 1725.00, lowStockThreshold: 5, lastInboundAt: Date.now() - 86400000 * 10, lastOutboundAt: Date.now() - 86400000 * 5, updatedAt: Date.now() },
]

export const mockInboundLogs = [
  { inboundId: 'IB-001', factoryId: 'F-001', partSkuId: 'SKU-001', partNameSnapshot: '液压油封', partCodeSnapshot: 'HYD-SEAL-01', qty: 50, unitPrice: 35.00, totalPrice: 1750.00, supplier: '供应商A', batchNo: 'B20260201', remark: '常规采购', operatorUserId: 'u002', operatorNameSnapshot: '李主管', ts: Date.now() - 86400000 * 5, yearMonth: dayjs().format('YYYY-MM'), createdAt: Date.now() - 86400000 * 5 },
  { inboundId: 'IB-002', factoryId: 'F-001', partSkuId: 'SKU-002', partNameSnapshot: '导轨滑块', partCodeSnapshot: 'GUIDE-BLK-01', qty: 20, unitPrice: 120.00, totalPrice: 2400.00, supplier: '供应商B', batchNo: 'B20260205', remark: '', operatorUserId: 'u002', operatorNameSnapshot: '李主管', ts: Date.now() - 86400000 * 10, yearMonth: dayjs().format('YYYY-MM'), createdAt: Date.now() - 86400000 * 10 },
  { inboundId: 'IB-SZ01', factoryId: 'F-005', partSkuId: 'SKU-001', partNameSnapshot: '液压油封', partCodeSnapshot: 'HYD-SEAL-01', qty: 30, unitPrice: 38.00, totalPrice: 1140.00, supplier: '深圳供应商', batchNo: 'B-SZ-001', remark: '测试工厂深圳入库', operatorUserId: 'u002', operatorNameSnapshot: '李主管', ts: Date.now() - 86400000 * 7, yearMonth: dayjs().format('YYYY-MM'), createdAt: Date.now() - 86400000 * 7 },
  { inboundId: 'IB-HZ01', factoryId: 'F-006', partSkuId: 'SKU-006', partNameSnapshot: '轴承', partCodeSnapshot: 'BEAR-6205', qty: 26, unitPrice: 28.00, totalPrice: 728.00, supplier: '杭州供应商', batchNo: 'B-HZ-001', remark: '测试工厂杭州入库', operatorUserId: 'u002', operatorNameSnapshot: '李主管', ts: Date.now() - 86400000 * 5, yearMonth: dayjs().format('YYYY-MM'), createdAt: Date.now() - 86400000 * 5 },
]

export const mockOutboundLogs = [
  { outboundId: 'OB-001', factoryId: 'F-001', partSkuId: 'SKU-001', partNameSnapshot: '液压油封', partCodeSnapshot: 'HYD-SEAL-01', qty: 3, unitCostAtTime: 35.00, totalCost: 105.00, replacementLogId: 'log-001', assetId: 'ZB-001', assetNameSnapshot: '注塑机A-01', reporterNameSnapshot: '王工程师', ts: Date.now() - 86400000, yearMonth: dayjs().format('YYYY-MM'), createdAt: Date.now() - 86400000 },
  { outboundId: 'OB-002', factoryId: 'F-001', partSkuId: 'SKU-006', partNameSnapshot: '轴承', partCodeSnapshot: 'BEAR-6205', qty: 2, unitCostAtTime: 25.00, totalCost: 50.00, replacementLogId: 'log-002', assetId: 'ZB-003', assetNameSnapshot: '冲压机B-01', reporterNameSnapshot: '赵技术员', ts: Date.now() - 86400000 * 2, yearMonth: dayjs().format('YYYY-MM'), createdAt: Date.now() - 86400000 * 2 },
  { outboundId: 'OB-SZ01', factoryId: 'F-005', partSkuId: 'SKU-001', partNameSnapshot: '液压油封', partCodeSnapshot: 'HYD-SEAL-01', qty: 2, unitCostAtTime: 35.00, totalCost: 70.00, replacementLogId: 'log-sz01', assetId: 'ZB-SZ01', assetNameSnapshot: '洗衣龙1号', reporterNameSnapshot: '王工程师', ts: Date.now() - 86400000, yearMonth: dayjs().format('YYYY-MM'), createdAt: Date.now() - 86400000 },
  { outboundId: 'OB-HZ01', factoryId: 'F-006', partSkuId: 'SKU-006', partNameSnapshot: '轴承', partCodeSnapshot: 'BEAR-6205', qty: 4, unitCostAtTime: 25.00, totalCost: 100.00, replacementLogId: 'log-hz01', assetId: 'ZB-HZ01', assetNameSnapshot: '烫平机1号', reporterNameSnapshot: '王工程师', ts: Date.now() - 86400000 * 2, yearMonth: dayjs().format('YYYY-MM'), createdAt: Date.now() - 86400000 * 2 },
]

export const mockInventoryAlerts = [
  { alertId: 'IA-001', factoryId: 'F-001', partSkuId: 'SKU-006', partNameSnapshot: '轴承', currentQty: 3, threshold: 10, status: 'OPEN', ackByUserId: null, ackTs: null, ackNote: null, createdAt: Date.now() - 86400000 },
  { alertId: 'IA-002', factoryId: 'F-001', partSkuId: 'SKU-003', partNameSnapshot: '加热圈', currentQty: 8, threshold: 10, status: 'OPEN', ackByUserId: null, ackTs: null, ackNote: null, createdAt: Date.now() - 86400000 * 3 },
  { alertId: 'IA-SZ01', factoryId: 'F-005', partSkuId: 'SKU-001', partNameSnapshot: '液压油封', currentQty: 5, threshold: 10, status: 'OPEN', ackByUserId: null, ackTs: null, ackNote: null, createdAt: Date.now() - 86400000 },
  { alertId: 'IA-HZ01', factoryId: 'F-006', partSkuId: 'SKU-006', partNameSnapshot: '轴承', currentQty: 6, threshold: 10, status: 'OPEN', ackByUserId: null, ackTs: null, ackNote: null, createdAt: Date.now() - 86400000 * 2 },
]

// 辅助：根据 ID 查找名称
export function getAssetName(assetId) {
  return mockAssets.find(a => a.assetId === assetId)?.assetName || assetId
}

export function getPartName(partSkuId) {
  return mockParts.find(p => p.partSkuId === partSkuId)?.partName || partSkuId
}

export function getPartCode(partSkuId) {
  return mockParts.find(p => p.partSkuId === partSkuId)?.partCode || ''
}

export function getUserName(userId) {
  return mockUsers.find(u => u.userId === userId)?.displayName || userId
}
