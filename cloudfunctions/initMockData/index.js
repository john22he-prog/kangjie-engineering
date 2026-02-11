// 云函数：initMockData — 一键灌入种子数据（仅开发阶段使用）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const results = { inserted: {}, errors: [] }

    // ===== 1. 设备 =====
    const assets = [
      { assetId: 'ZB-001', assetName: '隧道式洗衣龙1号', assetNo: 'XYL-2024-001', workshop: 'A车间', status: 'active', createdAt: Date.now(), updatedAt: Date.now() },
      { assetId: 'ZB-002', assetName: '隧道式洗衣龙2号', assetNo: 'XYL-2024-002', workshop: 'A车间', status: 'active', createdAt: Date.now(), updatedAt: Date.now() },
      { assetId: 'ZB-003', assetName: '烘干机1号', assetNo: 'HG-2024-001', workshop: 'B车间', status: 'active', createdAt: Date.now(), updatedAt: Date.now() }
    ]
    results.inserted.assets = await batchInsert('assets', assets)

    // ===== 2. 部位 =====
    const locations = [
      { locationId: 'loc_001', assetId: 'ZB-001', locationName: '主传动系统', sortOrder: 1, active: true, updatedAt: Date.now() },
      { locationId: 'loc_002', assetId: 'ZB-001', locationName: '进料段', sortOrder: 2, active: true, updatedAt: Date.now() },
      { locationId: 'loc_003', assetId: 'ZB-001', locationName: '排水系统', sortOrder: 3, active: true, updatedAt: Date.now() },
      { locationId: 'loc_004', assetId: 'ZB-002', locationName: '主传动系统', sortOrder: 1, active: true, updatedAt: Date.now() },
      { locationId: 'loc_005', assetId: 'ZB-002', locationName: '加热系统', sortOrder: 2, active: true, updatedAt: Date.now() },
      { locationId: 'loc_006', assetId: 'ZB-003', locationName: '滚筒组件', sortOrder: 1, active: true, updatedAt: Date.now() },
      { locationId: 'loc_007', assetId: 'ZB-003', locationName: '排风系统', sortOrder: 2, active: true, updatedAt: Date.now() }
    ]
    results.inserted.locations = await batchInsert('asset_locations', locations)

    // ===== 3. 配件 =====
    const parts = [
      { partSkuId: 'sku_001', partName: '传动皮带', partCode: 'PD-BELT-001', unit: '条', specModel: 'B-2200', active: true, source: 'manual', updatedAt: Date.now() },
      { partSkuId: 'sku_002', partName: '主轴承', partCode: 'BRG-MAIN-001', unit: '个', specModel: '6310-2RS', active: true, source: 'manual', updatedAt: Date.now() },
      { partSkuId: 'sku_003', partName: '密封垫圈', partCode: 'SEAL-001', unit: '个', specModel: 'DN50', active: true, source: 'manual', updatedAt: Date.now() },
      { partSkuId: 'sku_004', partName: '进料螺旋叶片', partCode: 'FEED-BLADE-001', unit: '片', specModel: 'Φ400', active: true, source: 'manual', updatedAt: Date.now() },
      { partSkuId: 'sku_005', partName: '排水阀', partCode: 'VALVE-DRAIN-001', unit: '个', specModel: 'DN80', active: true, source: 'manual', updatedAt: Date.now() },
      { partSkuId: 'sku_006', partName: '加热管', partCode: 'HEATER-001', unit: '根', specModel: '3KW', active: true, source: 'manual', updatedAt: Date.now() },
      { partSkuId: 'sku_007', partName: '过滤网', partCode: 'FILTER-001', unit: '张', specModel: '200目', active: true, source: 'manual', updatedAt: Date.now() },
      { partSkuId: 'sku_008', partName: '滚筒轴承', partCode: 'BRG-DRUM-001', unit: '个', specModel: '6312', active: true, source: 'manual', updatedAt: Date.now() },
      { partSkuId: 'sku_009', partName: '排风扇叶', partCode: 'FAN-BLADE-001', unit: '片', specModel: 'Φ600', active: true, source: 'manual', updatedAt: Date.now() },
      { partSkuId: 'sku_010', partName: '温控传感器', partCode: 'TEMP-SENSOR-001', unit: '个', specModel: 'PT100', active: true, source: 'manual', updatedAt: Date.now() }
    ]
    results.inserted.parts = await batchInsert('parts', parts)

    // ===== 4. 部位→配件映射 =====
    const maps = [
      { mapId: 'map_001', assetId: 'ZB-001', locationId: 'loc_001', partSkuId: 'sku_001', active: true },
      { mapId: 'map_002', assetId: 'ZB-001', locationId: 'loc_001', partSkuId: 'sku_002', active: true },
      { mapId: 'map_003', assetId: 'ZB-001', locationId: 'loc_001', partSkuId: 'sku_003', active: true },
      { mapId: 'map_004', assetId: 'ZB-001', locationId: 'loc_002', partSkuId: 'sku_004', active: true },
      { mapId: 'map_005', assetId: 'ZB-001', locationId: 'loc_002', partSkuId: 'sku_007', active: true },
      { mapId: 'map_006', assetId: 'ZB-001', locationId: 'loc_003', partSkuId: 'sku_005', active: true },
      { mapId: 'map_007', assetId: 'ZB-001', locationId: 'loc_003', partSkuId: 'sku_003', active: true },
      { mapId: 'map_008', assetId: 'ZB-002', locationId: 'loc_004', partSkuId: 'sku_001', active: true },
      { mapId: 'map_009', assetId: 'ZB-002', locationId: 'loc_004', partSkuId: 'sku_002', active: true },
      { mapId: 'map_010', assetId: 'ZB-002', locationId: 'loc_005', partSkuId: 'sku_006', active: true },
      { mapId: 'map_011', assetId: 'ZB-002', locationId: 'loc_005', partSkuId: 'sku_010', active: true },
      { mapId: 'map_012', assetId: 'ZB-003', locationId: 'loc_006', partSkuId: 'sku_008', active: true },
      { mapId: 'map_013', assetId: 'ZB-003', locationId: 'loc_006', partSkuId: 'sku_003', active: true },
      { mapId: 'map_014', assetId: 'ZB-003', locationId: 'loc_007', partSkuId: 'sku_009', active: true },
      { mapId: 'map_015', assetId: 'ZB-003', locationId: 'loc_007', partSkuId: 'sku_010', active: true }
    ]
    results.inserted.maps = await batchInsert('location_part_map', maps)

    // ===== 5. 阈值 =====
    const thresholds = [
      { assetId: 'ZB-001', partSkuId: 'sku_001', thresholdMonthly: 5, active: true, updatedAt: Date.now() },
      { assetId: 'ZB-001', partSkuId: 'sku_002', thresholdMonthly: 3, active: true, updatedAt: Date.now() },
      { assetId: 'ZB-001', partSkuId: 'sku_005', thresholdMonthly: 4, active: true, updatedAt: Date.now() },
      { assetId: 'ZB-002', partSkuId: 'sku_001', thresholdMonthly: 5, active: true, updatedAt: Date.now() },
      { assetId: 'ZB-003', partSkuId: 'sku_008', thresholdMonthly: 2, active: true, updatedAt: Date.now() }
    ]
    results.inserted.thresholds = await batchInsert('asset_part_thresholds', thresholds)

    // ===== 6. 用户（注意：openid 需要后续绑定真实值） =====
    const users = [
      { userId: 'user_001', username: 'zhangsan', displayName: '张工程', role: 'Engineer', status: 'active', openid: '', updatedAt: Date.now() },
      { userId: 'user_002', username: 'lisi', displayName: '李主管', role: 'Supervisor', status: 'active', openid: '', updatedAt: Date.now() },
      { userId: 'user_003', username: 'wangwu', displayName: '王工程', role: 'Engineer', status: 'active', openid: '', updatedAt: Date.now() },
      { userId: 'user_004', username: 'admin', displayName: '管理员', role: 'Admin', status: 'active', openid: '', updatedAt: Date.now() }
    ]
    results.inserted.users = await batchInsert('users', users)

    return { ok: true, data: results }
  } catch (err) {
    console.error('initMockData error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: err.message } }
  }
}

/**
 * 批量插入（逐条插入，返回成功数）
 */
async function batchInsert(collection, docs) {
  let count = 0
  for (const doc of docs) {
    try {
      await db.collection(collection).add({ data: doc })
      count++
    } catch (e) {
      console.error(`插入 ${collection} 失败:`, e.message)
    }
  }
  return count
}
