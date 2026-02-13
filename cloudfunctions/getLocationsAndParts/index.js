// 云函数：getLocationsAndParts — 获取部位与配件映射
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { assetId } = event
    if (!assetId) {
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '缺少 assetId' } }
    }

    // 查设备是否存在
    const { data: assets } = await db.collection('assets').where({ assetId }).limit(1).get()
    if (assets.length === 0) {
      return { ok: false, error: { code: 'ASSET_NOT_FOUND', message: '设备不存在' } }
    }

    // 查部位（容错：集合不存在时返回空数组）
    let locations = []
    try {
      const res = await db.collection('asset_locations')
        .where({ assetId, active: true })
        .orderBy('sortOrder', 'asc')
        .get()
      locations = res.data || []
    } catch (e) {
      console.warn('getLocationsAndParts asset_locations:', e)
    }

    // 查映射（容错：集合不存在时返回空数组）
    let mappings = []
    try {
      const res = await db.collection('location_part_map')
        .where({ assetId, active: true })
        .get()
      mappings = res.data || []
    } catch (e) {
      console.warn('getLocationsAndParts location_part_map:', e)
    }

    // 查相关配件（容错：集合不存在时返回空对象）
    const partSkuIds = [...new Set(mappings.map(m => m.partSkuId))]
    let partsMap = {}
    if (partSkuIds.length > 0) {
      try {
        for (let i = 0; i < partSkuIds.length; i += 20) {
          const batch = partSkuIds.slice(i, i + 20)
          const { data: batchParts } = await db.collection('parts')
            .where({ partSkuId: db.command.in(batch), active: true })
            .get()
          ;(batchParts || []).forEach(p => { partsMap[p.partSkuId] = p })
        }
      } catch (e) {
        console.warn('getLocationsAndParts parts:', e)
      }
    }

    // 组装 map: { locationId: parts[] }
    const map = {}
    locations.forEach(loc => {
      const locMappings = mappings.filter(m => m.locationId === loc.locationId)
      map[loc.locationId] = locMappings
        .map(m => partsMap[m.partSkuId])
        .filter(Boolean)
    })

    return {
      ok: true,
      data: { locations, map }
    }
  } catch (err) {
    console.error('getLocationsAndParts error:', err)
    return { ok: false, error: { code: 'SERVER_ERROR', message: '获取部位配件失败: ' + (err.message || String(err)) } }
  }
}
