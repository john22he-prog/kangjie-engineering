const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const { migratePermissions, hasPermission, PERMISSIONS, ACTION_PERMISSION_MAP } = require('./permissions')

const AMAP_KEY = process.env.AMAP_KEY || ''

// 匹配阈值（可被入参覆盖）
const DEFAULT_SUGGEST_THRESHOLD = 0.55   // 达到此分才作为"建议匹配"
const DEFAULT_HIGH_THRESHOLD = 0.8       // 达到此分为"强烈建议"
const SAME_CITY_MAX_METERS = 50000       // 超过此距离视为不同地点，跳过比对

// 匹配维度基础权重（去除电话维度）
const BASE_WEIGHTS = { name: 0.6, coordinate: 0.25, address: 0.15 }

const COLL_HOTELS = 'business_hotels'
const COLL_BINDINGS = 'business_poi_bindings'

// ─────────────────────────── HTTP 工具 ───────────────────────────

function httpGetOnce(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(new Error('高德返回解析失败')) }
      })
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('高德请求超时'))
    })
  })
}

async function httpGet(url, { timeoutMs = 8000, retry = 2 } = {}) {
  let lastErr
  for (let i = 0; i <= retry; i++) {
    try {
      return await httpGetOnce(url, timeoutMs)
    } catch (e) {
      lastErr = e
      if (i < retry) await sleep(300 * (i + 1))
    }
  }
  throw lastErr
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 统一处理高德返回的业务状态码
function checkAmapStatus(result) {
  if (result.status === '1') return
  const info = result.info || ''
  if (/LIMIT|QUOTA|CONCURRENCY/i.test(info)) {
    throw { code: 429, message: `高德API配额/频率受限：${info}` }
  }
  if (/INVALID_USER_KEY|KEY/i.test(info)) {
    throw { code: 401, message: `高德API Key无效：${info}` }
  }
  // status:0 且非以上明确错误，多为"无结果"，交由上层判断
}

// ─────────────────────────── 高德 API ───────────────────────────

async function geocode(address, city) {
  if (!AMAP_KEY) throw { code: 500, message: '未配置 AMAP_KEY 环境变量' }
  const params = new URLSearchParams({ key: AMAP_KEY, address, output: 'JSON' })
  if (city) params.set('city', city)
  const url = `https://restapi.amap.com/v3/geocode/geo?${params.toString()}`

  const result = await httpGet(url)
  checkAmapStatus(result)
  if (!result.geocodes || result.geocodes.length === 0) return null

  const geo = result.geocodes[0]
  const [lng, lat] = geo.location.split(',')
  return {
    latitude: parseFloat(lat),
    longitude: parseFloat(lng),
    formatted_address: geo.formatted_address,
    province: geo.province,
    city: geo.city,
    district: geo.district,
    level: geo.level || ''
  }
}

async function searchPOI({ keywords, city, types, location, radius, polygon, page = 1, pageSize = 25 }) {
  if (!AMAP_KEY) throw { code: 500, message: '未配置 AMAP_KEY 环境变量' }

  const params = new URLSearchParams({
    key: AMAP_KEY,
    output: 'JSON',
    offset: String(pageSize),
    page: String(page),
    extensions: 'all'
  })
  if (keywords) params.set('keywords', keywords)
  if (types) params.set('types', types)
  if (city) params.set('city', city)

  if (polygon) {
    params.set('polygon', polygon)
  } else if (location && radius) {
    params.set('location', location)
    params.set('radius', String(radius))
    params.set('sortrule', 'distance')
  }

  const url = `https://restapi.amap.com/v3/place/text?${params.toString()}`
  const result = await httpGet(url)
  checkAmapStatus(result)

  const pois = (result.pois || []).map(poi => {
    const [lng, lat] = (poi.location || '').split(',')
    return {
      id: poi.id,
      name: poi.name,
      type: poi.type,
      typecode: poi.typecode,
      address: poi.address || '',
      tel: normalizeTel(poi.tel || ''),
      province: poi.pname || '',
      city: poi.cityname || '',
      district: poi.adname || '',
      latitude: lat ? parseFloat(lat) : null,
      longitude: lng ? parseFloat(lng) : null,
      distance: poi.distance ? parseFloat(poi.distance) : null
    }
  })

  return { pois, total: parseInt(result.count || '0', 10), page, pageSize }
}

// ─────────────────────────── 文本/地理匹配工具 ───────────────────────────

function normalizeName(name) {
  if (!name) return ''
  return String(name)
    .replace(/[\s\-_·•‧・/\\()（）【】[\]「」『』""''《》<>{}|,，.。]/g, '')
    .replace(/(大酒店|酒店|大饭店|饭店|宾馆|客栈|民宿|旅社|旅馆|公寓|inn|hotel|resort)$/i, '')
    .replace(/(连锁|国际|有限公司|分店|店)$/i, '')
    .toLowerCase()
}

function normalizeTel(tel) {
  if (!tel) return ''
  return String(tel).replace(/[\s\-—–()（）+]/g, '').replace(/;+/g, ';')
}

function levenshteinDistance(a, b) {
  if (!a || !b) return Math.max((a || '').length, (b || '').length)
  const la = a.length, lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la

  let prev = new Array(lb + 1)
  let cur = new Array(lb + 1)
  for (let j = 0; j <= lb; j++) prev[j] = j

  for (let i = 1; i <= la; i++) {
    cur[0] = i
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    const tmp = prev; prev = cur; cur = tmp
  }
  return prev[lb]
}

function extractBigrams(str) {
  if (!str || str.length < 2) return str ? [str] : []
  const tokens = []
  for (let i = 0; i < str.length - 1; i++) tokens.push(str.substring(i, i + 2))
  return [...new Set(tokens)]
}

function bigramScore(a, b) {
  const ta = extractBigrams(a), tb = extractBigrams(b)
  if (ta.length === 0 || tb.length === 0) return 0
  const setB = new Set(tb)
  let overlap = 0
  for (const t of ta) if (setB.has(t)) overlap++
  return (2 * overlap) / (ta.length + tb.length)
}

function nameSimilarity(a, b) {
  const na = normalizeName(a), nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length)
    const longer = Math.max(na.length, nb.length)
    return 0.7 + 0.3 * (shorter / longer)
  }
  const maxLen = Math.max(na.length, nb.length)
  const editRatio = 1 - levenshteinDistance(na, nb) / maxLen
  return Math.max(editRatio, bigramScore(na, nb))
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = x => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function coordinateScore(lat1, lon1, lat2, lon2) {
  const dist = haversineDistance(lat1, lon1, lat2, lon2)
  if (dist <= 50) return 1
  if (dist <= 100) return 0.9
  if (dist <= 200) return 0.75
  if (dist <= 500) return 0.5
  if (dist <= 1000) return 0.25
  return 0
}

function addressSimilarity(addrA, addrB) {
  if (!addrA || !addrB) return 0
  const a = String(addrA).replace(/[\s,，。.·、/\\]/g, '')
  const b = String(addrB).replace(/[\s,，。.·、/\\]/g, '')
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.8
  const maxLen = Math.max(a.length, b.length)
  return Math.max(1 - levenshteinDistance(a, b) / maxLen, bigramScore(a, b))
}

/**
 * 综合匹配评分（无电话维度）
 * 维度：名称(主) + 坐标距离 + 地址
 * 缺失维度（数据不全）时，将其权重按比例重新分配给其它有效维度，避免被当成 0 分惩罚。
 */
function calculateMatchScore(poi, hotel) {
  const nameScore = nameSimilarity(poi.name, hotel.name)

  const hasCoord = poi.latitude != null && poi.longitude != null &&
                   hotel.latitude != null && hotel.longitude != null
  const hasAddr = !!(poi.address && hotel.address)

  const coordScore = hasCoord
    ? coordinateScore(poi.latitude, poi.longitude, hotel.latitude, hotel.longitude)
    : 0
  const addrScore = hasAddr ? addressSimilarity(poi.address, hotel.address) : 0

  const weights = { name: BASE_WEIGHTS.name }
  weights.coordinate = hasCoord ? BASE_WEIGHTS.coordinate : 0
  weights.address = hasAddr ? BASE_WEIGHTS.address : 0

  const sum = weights.name + weights.coordinate + weights.address
  const wName = weights.name / sum
  const wCoord = weights.coordinate / sum
  const wAddr = weights.address / sum

  const total = nameScore * wName + coordScore * wCoord + addrScore * wAddr

  return {
    total: round2(total),
    name: round2(nameScore),
    coordinate: round2(coordScore),
    address: round2(addrScore),
    usedCoordinate: hasCoord,
    usedAddress: hasAddr
  }
}

function matchLevel(total, suggestThreshold, highThreshold) {
  if (total >= highThreshold) return 'high'
  if (total >= suggestThreshold) return 'medium'
  return 'none'
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// ─────────────────────────── 数据读取（分页拉全量） ───────────────────────────

async function getAllActive(collName) {
  const all = []
  const pageSize = 500
  let skip = 0
  let hasMore = true
  while (hasMore) {
    const res = await db.collection(collName)
      .where({ status: 'active' })
      .skip(skip)
      .limit(pageSize)
      .get()
      .catch(() => ({ data: [] }))
    all.push(...res.data)
    hasMore = res.data.length === pageSize
    skip += pageSize
  }
  return all
}

function getAllActiveHotels() {
  return getAllActive(COLL_HOTELS)
}

function getAllActiveBindings() {
  return getAllActive(COLL_BINDINGS)
}

// ─────────────────────────── Action: 地理编码 ───────────────────────────

async function handleGeocode(event) {
  const { address, city } = event
  if (!address) return { code: 400, message: '缺少 address 参数' }
  const result = await geocode(address, city)
  if (!result) return { code: 404, message: '无法解析该地址' }
  return { code: 0, data: result }
}

// ─────────────────────────── Action: POI 检索 ───────────────────────────

async function handleSearchPOI(event) {
  const { keywords, city, types, location, radius, polygon, page, pageSize } = event
  if (!keywords && !types) return { code: 400, message: '请提供 keywords 或 types 参数' }
  const result = await searchPOI({ keywords, city, types, location, radius, polygon, page, pageSize })
  return { code: 0, data: result }
}

// ─────────────────────────── Action: 检索 + 智能匹配（1:1 贪心分配） ───────────────────────────

async function handleSearchAndMatch(event) {
  const {
    keywords, city, types, location, radius, polygon, page, pageSize,
    suggestThreshold = DEFAULT_SUGGEST_THRESHOLD,
    highThreshold = DEFAULT_HIGH_THRESHOLD
  } = event

  if (!keywords && !types) return { code: 400, message: '请提供 keywords 或 types 参数' }

  const [poiResult, hotels, bindings] = await Promise.all([
    searchPOI({ keywords, city, types, location, radius, polygon, page, pageSize }),
    getAllActiveHotels(),
    getAllActiveBindings()
  ])

  const bindingByPoi = {}
  const boundHotelIds = new Set()
  for (const b of bindings) {
    bindingByPoi[b.poiId] = b
    boundHotelIds.add(b.hotelId)
  }
  const hotelMap = {}
  for (const h of hotels) hotelMap[h._id] = h

  const pois = poiResult.pois
  const unboundHotels = hotels.filter(h => !boundHotelIds.has(h._id))

  // 1) 收集所有达到建议阈值的候选 (poi × 未绑定hotel)
  const candidates = []
  const bestByPoi = {} // poiIndex -> {hotel, score}
  pois.forEach((poi, pIdx) => {
    if (bindingByPoi[poi.id]) return // 已绑定的 POI 不参与建议
    for (const hotel of unboundHotels) {
      if (poi.latitude != null && hotel.latitude != null &&
          haversineDistance(poi.latitude, poi.longitude, hotel.latitude, hotel.longitude) > SAME_CITY_MAX_METERS) {
        continue
      }
      const score = calculateMatchScore(poi, hotel)
      if (!bestByPoi[pIdx] || score.total > bestByPoi[pIdx].score.total) {
        bestByPoi[pIdx] = { hotel, score }
      }
      if (score.total >= suggestThreshold) {
        candidates.push({ pIdx, hotelId: hotel._id, score })
      }
    }
  })

  // 2) 贪心最优分配（保证 1:1）：按分数降序，每个 POI、每个 hotel 各用一次
  candidates.sort((a, b) => b.score.total - a.score.total)
  const assignedPoi = new Set()
  const assignedHotel = new Set()
  const assignment = {} // pIdx -> {hotelId, score}
  for (const c of candidates) {
    if (assignedPoi.has(c.pIdx) || assignedHotel.has(c.hotelId)) continue
    assignedPoi.add(c.pIdx)
    assignedHotel.add(c.hotelId)
    assignment[c.pIdx] = { hotelId: c.hotelId, score: c.score }
  }

  // 3) 组装结果
  const matchedPois = pois.map((poi, pIdx) => {
    const existing = bindingByPoi[poi.id]
    if (existing) {
      const hotel = hotelMap[existing.hotelId]
      return {
        ...poi,
        matchStatus: 'bound',
        matchLevel: 'bound',
        boundHotelId: existing.hotelId,
        boundHotelName: hotel ? hotel.name : existing.hotelName,
        bindingId: existing._id,
        matchScore: { total: 1, name: 1, coordinate: 1, address: 1 }
      }
    }

    const assigned = assignment[pIdx]
    if (assigned) {
      const hotel = hotelMap[assigned.hotelId]
      return {
        ...poi,
        matchStatus: 'suggested',
        matchLevel: matchLevel(assigned.score.total, suggestThreshold, highThreshold),
        suggestedHotelId: assigned.hotelId,
        suggestedHotelName: hotel ? hotel.name : '',
        matchScore: assigned.score
      }
    }

    // 未分配：给出最接近候选（仅供参考，可能已被占用或低于阈值）
    const best = bestByPoi[pIdx]
    return {
      ...poi,
      matchStatus: 'unmatched',
      matchLevel: 'none',
      matchScore: best ? best.score : { total: 0, name: 0, coordinate: 0, address: 0 },
      bestCandidateId: best ? best.hotel._id : null,
      bestCandidateName: best ? best.hotel.name : null,
      bestCandidateTaken: best ? (assignedHotel.has(best.hotel._id) || boundHotelIds.has(best.hotel._id)) : false
    }
  })

  const stats = {
    total: matchedPois.length,
    bound: matchedPois.filter(p => p.matchStatus === 'bound').length,
    suggested: matchedPois.filter(p => p.matchStatus === 'suggested').length,
    unmatched: matchedPois.filter(p => p.matchStatus === 'unmatched').length
  }

  // 我方客户图层：本次搜索命中（已绑/被建议）的客户 id 集合，其余即"盲区客户"
  const matchedHotelIds = new Set()
  matchedPois.forEach(p => {
    if (p.boundHotelId) matchedHotelIds.add(p.boundHotelId)
    if (p.suggestedHotelId) matchedHotelIds.add(p.suggestedHotelId)
  })
  const hotelLayer = hotels
    .filter(h => h.latitude != null && h.longitude != null)
    .map(h => ({
      hotelId: h._id,
      name: h.name,
      latitude: h.latitude,
      longitude: h.longitude,
      bound: !!h.amapPoiId,
      matchedHere: matchedHotelIds.has(h._id)
    }))
  const blindCount = hotelLayer.filter(h => !h.matchedHere && !h.bound).length

  return {
    code: 0,
    data: {
      pois: matchedPois,
      total: poiResult.total,
      page: poiResult.page,
      pageSize: poiResult.pageSize,
      stats,
      hotelCount: hotels.length,
      unboundHotelCount: unboundHotels.length,
      hotelLayer,
      blindCount
    }
  }
}

// ─────────────────────────── Action: 绑定（严格 1:1） ───────────────────────────

async function handleBindPOI(event, user) {
  const { poiId, poiName, hotelId, hotelName, poiData } = event
  if (!poiId || !hotelId) return { code: 400, message: '缺少 poiId 或 hotelId' }

  // 校验 POI 是否已被其它内部客户绑定
  const poiBound = await db.collection(COLL_BINDINGS)
    .where({ poiId, status: 'active' })
    .get()
  if (poiBound.data.length > 0 && poiBound.data[0].hotelId !== hotelId) {
    return { code: 409, message: `该外部客户已绑定到「${poiBound.data[0].hotelName || '其他客户'}」，请先解除原绑定` }
  }

  // 校验内部客户是否已绑定其它 POI
  const hotelBound = await db.collection(COLL_BINDINGS)
    .where({ hotelId, status: 'active' })
    .get()
  if (hotelBound.data.length > 0 && hotelBound.data[0].poiId !== poiId) {
    return { code: 409, message: `该内部客户已绑定到「${hotelBound.data[0].poiName || '其他POI'}」，请先解除原绑定` }
  }

  // 幂等：同一对已绑定
  if (poiBound.data.length > 0 && poiBound.data[0].hotelId === hotelId) {
    return { code: 0, data: { bindingId: poiBound.data[0]._id, alreadyBound: true } }
  }

  const bindingData = {
    poiId,
    poiName: poiName || (poiData && poiData.name) || '',
    hotelId,
    hotelName: hotelName || '',
    poiData: poiData || {},
    status: 'active',
    boundByUserId: user ? user.userId : '',
    boundByName: user ? user.displayName : '',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }
  const res = await db.collection(COLL_BINDINGS).add({ data: bindingData })

  // 回写到内部客户档案：amapPoiId + 精确坐标（实现复访精确匹配）
  const hotelUpdate = {
    amapPoiId: poiId,
    boundPoiName: bindingData.poiName,
    bindingId: res._id,
    updatedAt: db.serverDate()
  }
  if (poiData && poiData.latitude != null && poiData.longitude != null) {
    hotelUpdate.latitude = poiData.latitude
    hotelUpdate.longitude = poiData.longitude
    hotelUpdate.locateSource = 'poi'
    hotelUpdate.geoLevel = 'poi'
  }
  await db.collection(COLL_HOTELS).doc(hotelId).update({ data: hotelUpdate }).catch(() => {})

  return { code: 0, data: { bindingId: res._id, created: true } }
}

async function handleUnbindPOI(event) {
  const { poiId, bindingId, hotelId } = event
  if (!poiId && !bindingId && !hotelId) {
    return { code: 400, message: '缺少 poiId / bindingId / hotelId' }
  }

  let records = []
  if (bindingId) {
    const r = await db.collection(COLL_BINDINGS).doc(bindingId).get().catch(() => null)
    if (r && r.data) records = [r.data]
  } else {
    const where = { status: 'active' }
    if (poiId) where.poiId = poiId
    if (hotelId) where.hotelId = hotelId
    const r = await db.collection(COLL_BINDINGS).where(where).get()
    records = r.data || []
  }

  for (const rec of records) {
    await db.collection(COLL_BINDINGS).doc(rec._id).update({
      data: { status: 'deleted', updatedAt: db.serverDate() }
    })
    // 清理内部客户档案上的绑定标记
    if (rec.hotelId) {
      await db.collection(COLL_HOTELS).doc(rec.hotelId).update({
        data: {
          amapPoiId: '',
          boundPoiName: '',
          bindingId: '',
          updatedAt: db.serverDate()
        }
      }).catch(() => {})
    }
  }

  return { code: 0, message: '已解除绑定', data: { count: records.length } }
}

async function handleListBindings(event) {
  const { page = 1, pageSize = 100 } = event
  const skip = (page - 1) * pageSize

  const [countRes, listRes, hotels] = await Promise.all([
    db.collection(COLL_BINDINGS).where({ status: 'active' }).count(),
    db.collection(COLL_BINDINGS)
      .where({ status: 'active' })
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get(),
    getAllActiveHotels()
  ])

  const hotelIds = new Set(hotels.map(h => h._id))
  // 标记孤儿绑定（内部客户已被删除）
  const list = listRes.data.map(b => ({
    ...b,
    orphaned: !hotelIds.has(b.hotelId)
  }))

  return { code: 0, data: { list, total: countRes.total, page, pageSize } }
}

// ─────────────────────────── Action: 批量匹配建议 ───────────────────────────

async function handleBatchMatch(event) {
  const { suggestThreshold = DEFAULT_SUGGEST_THRESHOLD, highThreshold = DEFAULT_HIGH_THRESHOLD } = event

  const [hotels, bindings] = await Promise.all([getAllActiveHotels(), getAllActiveBindings()])
  const boundHotelIds = new Set(bindings.map(b => b.hotelId))
  const boundPoiIds = new Set(bindings.map(b => b.poiId))
  const unboundHotels = hotels.filter(h => !boundHotelIds.has(h._id))

  if (unboundHotels.length === 0) {
    return { code: 0, data: { total: 0, matched: 0, results: [], message: '所有内部客户已绑定' } }
  }

  const results = []
  const usedPoiIds = new Set() // 批内 1:1：同一 POI 不重复建议给多个客户
  for (const hotel of unboundHotels) {
    const searchName = (hotel.name || '').replace(/[()（）[\]【】]/g, ' ').trim()
    const cityHint = hotel.city || hotel.district || ''
    try {
      const poiResult = await searchPOI({
        keywords: searchName,
        city: cityHint,
        types: '100000|120000',
        pageSize: 8
      })

      let best = null
      for (const poi of poiResult.pois) {
        if (boundPoiIds.has(poi.id) || usedPoiIds.has(poi.id)) continue
        const score = calculateMatchScore(poi, hotel)
        if (!best || score.total > best.score.total) best = { poi, score }
      }

      const status = best && best.score.total >= suggestThreshold ? 'suggested' : 'unmatched'
      if (status === 'suggested') usedPoiIds.add(best.poi.id)

      results.push({
        hotelId: hotel._id,
        hotelName: hotel.name,
        hotelAddress: hotel.address,
        bestPoi: best ? {
          id: best.poi.id, name: best.poi.name, address: best.poi.address,
          latitude: best.poi.latitude, longitude: best.poi.longitude, tel: best.poi.tel
        } : null,
        matchScore: best ? best.score : null,
        matchLevel: best ? matchLevel(best.score.total, suggestThreshold, highThreshold) : 'none',
        matchStatus: status
      })

      await sleep(120) // 限速，规避高德 QPS 限制
    } catch (err) {
      results.push({
        hotelId: hotel._id, hotelName: hotel.name,
        bestPoi: null, matchScore: null, matchStatus: 'error', error: err.message
      })
    }
  }

  return {
    code: 0,
    data: {
      total: results.length,
      matched: results.filter(r => r.matchStatus === 'suggested').length,
      results
    }
  }
}

// ─────────────────────────── Action: 内部客户 CRUD ───────────────────────────

// POI 优先录入：直接用选定的高德 POI 建档（坐标精确、带 amapPoiId）
async function handleSaveHotelFromPOI(event, user) {
  const { poi, contact, remark, autoBind = true } = event
  if (!poi || !poi.name) return { code: 400, message: '缺少 POI 信息' }

  // 若该 POI 已绑定其它客户，禁止重复建档
  if (poi.id) {
    const bound = await db.collection(COLL_BINDINGS).where({ poiId: poi.id, status: 'active' }).get()
    if (bound.data.length > 0) {
      return { code: 409, message: `该POI已绑定到「${bound.data[0].hotelName || '其他客户'}」` }
    }
  }

  const hotelData = {
    name: poi.name,
    address: poi.address || '',
    formatted_address: poi.address || '',
    city: poi.city || '',
    province: poi.province || '',
    district: poi.district || '',
    phone: normalizeTel(poi.tel || ''),
    contact: contact || '',
    remark: remark || '',
    latitude: poi.latitude != null ? poi.latitude : null,
    longitude: poi.longitude != null ? poi.longitude : null,
    amapPoiId: poi.id || '',
    locateSource: 'poi',
    geoLevel: 'poi',
    status: 'active',
    createdByUserId: user ? user.userId : '',
    createdByName: user ? user.displayName : '',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }

  const res = await db.collection(COLL_HOTELS).add({ data: hotelData })

  // POI 优先录入天然形成 1:1 绑定
  if (autoBind && poi.id) {
    await db.collection(COLL_BINDINGS).add({
      data: {
        poiId: poi.id, poiName: poi.name,
        hotelId: res._id, hotelName: poi.name,
        poiData: poi, status: 'active',
        boundByUserId: user ? user.userId : '',
        boundByName: user ? user.displayName : '',
        createdAt: db.serverDate(), updatedAt: db.serverDate()
      }
    })
    await db.collection(COLL_HOTELS).doc(res._id).update({
      data: { boundPoiName: poi.name, updatedAt: db.serverDate() }
    }).catch(() => {})
  }

  return { code: 0, data: { hotelId: res._id, ...hotelData } }
}

// 手动/地址录入（地理编码兜底，记录精度等级）
async function handleSaveHotel(event) {
  const { name, address, city, phone, contact, remark } = event
  if (!name || !address) return { code: 400, message: '酒店名称和地址为必填项' }

  const geo = await geocode(address, city)
  if (!geo) return { code: 404, message: '无法解析酒店地址' }

  const coarse = geo.level && !/兴趣点|门牌号|POI/.test(geo.level)

  const hotelData = {
    name, address,
    city: geo.city || city || '',
    province: geo.province || '',
    district: geo.district || '',
    phone: normalizeTel(phone || ''),
    contact: contact || '',
    remark: remark || '',
    latitude: geo.latitude,
    longitude: geo.longitude,
    formatted_address: geo.formatted_address,
    locateSource: 'geocode',
    geoLevel: geo.level || '',
    status: 'active',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }

  const res = await db.collection(COLL_HOTELS).add({ data: hotelData })
  return {
    code: 0,
    data: { hotelId: res._id, ...hotelData },
    warning: coarse ? `地址仅解析到「${geo.level}」级别，定位可能不精确，建议改用POI搜索录入` : undefined
  }
}

async function handleUpdateHotel(event) {
  const { hotelId, name, address, city, phone, contact, remark } = event
  if (!hotelId) return { code: 400, message: '缺少 hotelId' }

  const updateData = { updatedAt: db.serverDate() }
  if (name) updateData.name = name
  if (phone !== undefined) updateData.phone = normalizeTel(phone)
  if (contact !== undefined) updateData.contact = contact
  if (remark !== undefined) updateData.remark = remark

  if (address) {
    const geo = await geocode(address, city)
    if (!geo) return { code: 404, message: '无法解析新地址' }
    updateData.address = address
    updateData.latitude = geo.latitude
    updateData.longitude = geo.longitude
    updateData.formatted_address = geo.formatted_address
    updateData.province = geo.province || ''
    updateData.city = geo.city || city || ''
    updateData.district = geo.district || ''
    updateData.locateSource = 'geocode'
    updateData.geoLevel = geo.level || ''
  }

  await db.collection(COLL_HOTELS).doc(hotelId).update({ data: updateData })
  return { code: 0, data: { hotelId, ...updateData } }
}

async function handleListHotels(event) {
  const { page = 1, pageSize = 100, status, onlyUnbound } = event
  const where = {}
  if (status) where.status = status

  const countRes = await db.collection(COLL_HOTELS).where(where).count()
  const skip = (page - 1) * pageSize
  const listRes = await db.collection(COLL_HOTELS)
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  let list = listRes.data
  if (onlyUnbound) {
    list = list.filter(h => !h.amapPoiId)
  }

  return { code: 0, data: { list, total: countRes.total, page, pageSize } }
}

async function handleDeleteHotel(event) {
  const { hotelId } = event
  if (!hotelId) return { code: 400, message: '缺少 hotelId' }
  // 删除同时解除其绑定，避免孤儿数据
  await handleUnbindPOI({ hotelId })
  await db.collection(COLL_HOTELS).doc(hotelId).update({
    data: { status: 'deleted', updatedAt: db.serverDate() }
  })
  return { code: 0, message: '已删除' }
}

// ─────────────────────────── 鉴权 ───────────────────────────

// 始终以 getWXContext 的 openid 为准，不信任前端传入
async function getCurrentUser() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return null
  const { data } = await db.collection('users').where({ openid }).limit(1).get()
  if (data.length === 0) return null
  const user = data[0]
  if (user.status === 'disabled') return { ...user, _disabled: true }
  user.permissions = migratePermissions(user)
  return user
}

// 校验当前用户是否有执行该 action 的权限
async function authorize(action) {
  const required = ACTION_PERMISSION_MAP[action] || PERMISSIONS.BUSINESS_VIEW
  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, res: { code: 401, message: '未绑定账号或无法识别身份，请联系管理员' } }
  }
  if (user._disabled) {
    return { ok: false, res: { code: 403, message: '账号已被禁用' } }
  }
  if (!hasPermission(user.permissions, required)) {
    return { ok: false, res: { code: 403, message: '无权限执行该操作（需业务部权限）' } }
  }
  return { ok: true, user }
}

// ─────────────────────────── 入口路由 ───────────────────────────

exports.main = async (event) => {
  const { action, ...payload } = event

  const handlers = {
    geocode: handleGeocode,
    searchPOI: handleSearchPOI,
    searchAndMatch: handleSearchAndMatch,
    bindPOI: handleBindPOI,
    unbindPOI: handleUnbindPOI,
    listBindings: handleListBindings,
    batchMatch: handleBatchMatch,
    saveHotelFromPOI: handleSaveHotelFromPOI,
    saveHotel: handleSaveHotel,
    updateHotel: handleUpdateHotel,
    listHotels: handleListHotels,
    deleteHotel: handleDeleteHotel
  }

  if (!action || !handlers[action]) {
    return { code: 400, message: `未知 action: ${action}，可用: ${Object.keys(handlers).join(', ')}` }
  }

  try {
    const auth = await authorize(action)
    if (!auth.ok) return auth.res
    return await handlers[action](payload, auth.user)
  } catch (err) {
    console.error(`[business-geocode] ${action} 错误:`, err)
    if (err.code && err.message) return { code: err.code, message: err.message }
    return { code: 500, message: err.message || '服务器内部错误' }
  }
}
