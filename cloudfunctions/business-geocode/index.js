const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const AMAP_KEY = process.env.AMAP_KEY || ''

// ─── HTTP 工具 ───

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

// ─── 高德 API 封装 ───

async function geocode(address, city) {
  if (!AMAP_KEY) {
    throw { code: 500, message: '未配置 AMAP_KEY 环境变量' }
  }
  const encodedAddr = encodeURIComponent(address)
  const encodedCity = city ? encodeURIComponent(city) : ''
  let url = `https://restapi.amap.com/v3/geocode/geo?key=${AMAP_KEY}&address=${encodedAddr}&output=JSON`
  if (encodedCity) url += `&city=${encodedCity}`

  const result = await httpGet(url)
  if (result.status !== '1' || !result.geocodes || result.geocodes.length === 0) {
    return null
  }

  const geo = result.geocodes[0]
  const [lng, lat] = geo.location.split(',')
  return {
    latitude: parseFloat(lat),
    longitude: parseFloat(lng),
    formatted_address: geo.formatted_address,
    province: geo.province,
    city: geo.city,
    district: geo.district,
    level: geo.level
  }
}

async function searchPOI({ keywords, city, types, location, radius, polygon, page = 1, pageSize = 20 }) {
  if (!AMAP_KEY) {
    throw { code: 500, message: '未配置 AMAP_KEY 环境变量' }
  }

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

  if (result.status !== '1') {
    return { pois: [], total: 0 }
  }

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

  return {
    pois,
    total: parseInt(result.count || '0', 10),
    page,
    pageSize
  }
}

// ─── 文本匹配工具函数 ───

function normalizeName(name) {
  if (!name) return ''
  return name
    .replace(/[\s\-_·•·‧・\/\\()（）【】\[\]「」『』""''《》<>{}|]/g, '')
    .replace(/酒店$|宾馆$|客栈$|民宿$|旅社$|旅馆$|公寓$|inn$|hotel$/i, '')
    .toLowerCase()
}

function normalizeTel(tel) {
  if (!tel) return ''
  return tel.replace(/[\s\-—–()（）+]/g, '').replace(/;+/g, ';')
}

function extractPhoneNumbers(tel) {
  if (!tel) return []
  const normalized = normalizeTel(tel)
  const phones = normalized.split(/[;,，、\/]/).filter(Boolean)
  return phones.map(p => {
    if (p.length >= 11) {
      const mobile = p.match(/1[3-9]\d{9}/)
      if (mobile) return mobile[0]
    }
    return p
  }).filter(Boolean)
}

function levenshteinDistance(a, b) {
  if (!a || !b) return Math.max((a || '').length, (b || '').length)
  const la = a.length, lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la

  const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0))
  for (let i = 0; i <= la; i++) dp[i][0] = i
  for (let j = 0; j <= lb; j++) dp[0][j] = j

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }
  return dp[la][lb]
}

function nameSimilarity(a, b) {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length)
    const longer = Math.max(na.length, nb.length)
    return 0.7 + 0.3 * (shorter / longer)
  }

  const maxLen = Math.max(na.length, nb.length)
  const dist = levenshteinDistance(na, nb)
  const ratio = 1 - dist / maxLen

  const tokensA = extractTokens(na)
  const tokensB = extractTokens(nb)
  const tokenScore = tokenOverlapScore(tokensA, tokensB)

  return Math.max(ratio, tokenScore)
}

function extractTokens(str) {
  if (!str) return []
  const tokens = []
  for (let i = 0; i < str.length - 1; i++) {
    tokens.push(str.substring(i, i + 2))
  }
  return [...new Set(tokens)]
}

function tokenOverlapScore(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0
  const setB = new Set(tokensB)
  let overlap = 0
  for (const t of tokensA) {
    if (setB.has(t)) overlap++
  }
  return (2 * overlap) / (tokensA.length + tokensB.length)
}

function phoneMatch(telA, telB) {
  const phonesA = extractPhoneNumbers(telA)
  const phonesB = extractPhoneNumbers(telB)
  if (phonesA.length === 0 || phonesB.length === 0) return 0

  for (const pa of phonesA) {
    for (const pb of phonesB) {
      if (pa === pb) return 1
      if (pa.length >= 7 && pb.length >= 7) {
        if (pa.endsWith(pb.slice(-7)) || pb.endsWith(pa.slice(-7))) return 0.8
      }
    }
  }
  return 0
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
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0
  const dist = haversineDistance(lat1, lon1, lat2, lon2)
  if (dist <= 50) return 1
  if (dist <= 100) return 0.9
  if (dist <= 200) return 0.7
  if (dist <= 500) return 0.4
  if (dist <= 1000) return 0.2
  return 0
}

function addressSimilarity(addrA, addrB) {
  if (!addrA || !addrB) return 0
  const a = addrA.replace(/[\s,，。.·、\/\\]/g, '')
  const b = addrB.replace(/[\s,，。.·、\/\\]/g, '')
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.8

  const maxLen = Math.max(a.length, b.length)
  const dist = levenshteinDistance(a, b)
  return 1 - dist / maxLen
}

/**
 * 综合匹配评分
 * 返回 0~1 的分数，附带各维度得分明细
 *
 * 权重分配：
 * - 电话完全匹配 → 强信号，直接加权
 * - 名称相似度 → 核心指标
 * - 坐标距离 → 辅助确认
 * - 地址相似 → 辅助确认
 */
function calculateMatchScore(poi, hotel) {
  const nameScore = nameSimilarity(poi.name, hotel.name)
  const phoneScore = phoneMatch(poi.tel, hotel.phone)
  const coordScore = coordinateScore(poi.latitude, poi.longitude, hotel.latitude, hotel.longitude)
  const addrScore = addressSimilarity(poi.address, hotel.address)

  let totalScore
  if (phoneScore >= 0.8) {
    totalScore = 0.35 * nameScore + 0.35 * phoneScore + 0.15 * coordScore + 0.15 * addrScore
  } else {
    totalScore = 0.45 * nameScore + 0.10 * phoneScore + 0.25 * coordScore + 0.20 * addrScore
  }

  return {
    total: Math.round(totalScore * 100) / 100,
    name: Math.round(nameScore * 100) / 100,
    phone: Math.round(phoneScore * 100) / 100,
    coordinate: Math.round(coordScore * 100) / 100,
    address: Math.round(addrScore * 100) / 100
  }
}

// ─── Action Handlers ───

async function handleGeocode(event) {
  const { address, city } = event
  if (!address) return { code: 400, message: '缺少 address 参数' }
  const result = await geocode(address, city)
  if (!result) return { code: 404, message: '无法解析该地址' }
  return { code: 0, data: result }
}

async function handleBatchGeocode(event) {
  const { addresses } = event
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return { code: 400, message: '缺少 addresses 数组参数' }
  }
  if (addresses.length > 50) {
    return { code: 400, message: '单次批量最多50条' }
  }

  const results = []
  for (const item of addresses) {
    const addr = typeof item === 'string' ? item : item.address
    const city = typeof item === 'string' ? '' : (item.city || '')
    try {
      const geo = await geocode(addr, city)
      results.push({ address: addr, success: !!geo, data: geo })
    } catch (e) {
      results.push({ address: addr, success: false, error: e.message })
    }
  }
  return { code: 0, data: results }
}

async function handleSearchPOI(event) {
  const { keywords, city, types, location, radius, polygon, page, pageSize } = event
  if (!keywords && !types) {
    return { code: 400, message: '请提供 keywords 或 types 参数' }
  }
  const result = await searchPOI({ keywords, city, types, location, radius, polygon, page, pageSize })
  return { code: 0, data: result }
}

async function handleSearchAndMatch(event) {
  const { keywords, city, types, location, radius, polygon, page, pageSize, matchThreshold = 0.35 } = event

  if (!keywords && !types) {
    return { code: 400, message: '请提供 keywords 或 types 参数' }
  }

  const [poiResult, hotelsResult] = await Promise.all([
    searchPOI({ keywords, city, types, location, radius, polygon, page, pageSize }),
    db.collection('business_hotels').where({ status: 'active' }).limit(1000).get()
  ])

  const hotels = hotelsResult.data || []
  const bindingsResult = await db.collection('business_poi_bindings')
    .where({ status: 'active' })
    .limit(1000)
    .get()
    .catch(() => ({ data: [] }))
  const bindings = bindingsResult.data || []

  const bindingMap = {}
  for (const b of bindings) {
    bindingMap[b.poiId] = b
  }

  const matchedPois = poiResult.pois.map(poi => {
    const existing = bindingMap[poi.id]
    if (existing) {
      const hotel = hotels.find(h => h._id === existing.hotelId)
      return {
        ...poi,
        matchStatus: 'bound',
        boundHotelId: existing.hotelId,
        boundHotelName: hotel ? hotel.name : existing.hotelName,
        bindingId: existing._id,
        matchScore: { total: 1, name: 1, phone: 1, coordinate: 1, address: 1 }
      }
    }

    let bestMatch = null
    let bestScore = null

    for (const hotel of hotels) {
      const score = calculateMatchScore(poi, hotel)
      if (!bestScore || score.total > bestScore.total) {
        bestScore = score
        bestMatch = hotel
      }
    }

    if (bestScore && bestScore.total >= matchThreshold) {
      return {
        ...poi,
        matchStatus: 'suggested',
        suggestedHotelId: bestMatch._id,
        suggestedHotelName: bestMatch.name,
        matchScore: bestScore
      }
    }

    return {
      ...poi,
      matchStatus: 'unmatched',
      matchScore: bestScore || { total: 0, name: 0, phone: 0, coordinate: 0, address: 0 },
      bestCandidateId: bestMatch ? bestMatch._id : null,
      bestCandidateName: bestMatch ? bestMatch.name : null
    }
  })

  const stats = {
    total: matchedPois.length,
    bound: matchedPois.filter(p => p.matchStatus === 'bound').length,
    suggested: matchedPois.filter(p => p.matchStatus === 'suggested').length,
    unmatched: matchedPois.filter(p => p.matchStatus === 'unmatched').length
  }

  return {
    code: 0,
    data: {
      pois: matchedPois,
      total: poiResult.total,
      page: poiResult.page,
      pageSize: poiResult.pageSize,
      stats
    }
  }
}

async function handleBindPOI(event) {
  const { poiId, poiName, hotelId, hotelName, poiData } = event
  if (!poiId || !hotelId) {
    return { code: 400, message: '缺少 poiId 或 hotelId' }
  }

  const existing = await db.collection('business_poi_bindings')
    .where({ poiId, status: 'active' })
    .get()

  if (existing.data && existing.data.length > 0) {
    await db.collection('business_poi_bindings').doc(existing.data[0]._id).update({
      data: {
        hotelId,
        hotelName: hotelName || '',
        updatedAt: db.serverDate()
      }
    })
    return { code: 0, data: { bindingId: existing.data[0]._id, updated: true } }
  }

  const bindingData = {
    poiId,
    poiName: poiName || '',
    hotelId,
    hotelName: hotelName || '',
    poiData: poiData || {},
    status: 'active',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }

  const res = await db.collection('business_poi_bindings').add({ data: bindingData })

  if (poiData && poiData.latitude && poiData.longitude) {
    const hotel = await db.collection('business_hotels').doc(hotelId).get().catch(() => null)
    if (hotel && hotel.data && !hotel.data.latitude) {
      await db.collection('business_hotels').doc(hotelId).update({
        data: {
          latitude: poiData.latitude,
          longitude: poiData.longitude,
          poiName: poiData.name || '',
          updatedAt: db.serverDate()
        }
      })
    }
  }

  return { code: 0, data: { bindingId: res._id, created: true } }
}

async function handleUnbindPOI(event) {
  const { poiId, bindingId } = event
  if (!poiId && !bindingId) {
    return { code: 400, message: '缺少 poiId 或 bindingId' }
  }

  if (bindingId) {
    await db.collection('business_poi_bindings').doc(bindingId).update({
      data: { status: 'deleted', updatedAt: db.serverDate() }
    })
  } else {
    const records = await db.collection('business_poi_bindings')
      .where({ poiId, status: 'active' })
      .get()
    for (const r of (records.data || [])) {
      await db.collection('business_poi_bindings').doc(r._id).update({
        data: { status: 'deleted', updatedAt: db.serverDate() }
      })
    }
  }

  return { code: 0, message: '已解除绑定' }
}

async function handleListBindings(event) {
  const { page = 1, pageSize = 100 } = event
  const skip = (page - 1) * pageSize
  const countRes = await db.collection('business_poi_bindings')
    .where({ status: 'active' })
    .count()

  const listRes = await db.collection('business_poi_bindings')
    .where({ status: 'active' })
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  return {
    code: 0,
    data: {
      list: listRes.data,
      total: countRes.total,
      page,
      pageSize
    }
  }
}

async function handleBatchMatch(event) {
  const { matchThreshold = 0.35 } = event

  const hotelsResult = await db.collection('business_hotels')
    .where({ status: 'active' })
    .limit(1000)
    .get()
  const hotels = hotelsResult.data || []

  if (hotels.length === 0) {
    return { code: 0, data: { matched: 0, total: 0, results: [] } }
  }

  const bindingsResult = await db.collection('business_poi_bindings')
    .where({ status: 'active' })
    .limit(1000)
    .get()
    .catch(() => ({ data: [] }))

  const boundHotelIds = new Set((bindingsResult.data || []).map(b => b.hotelId))
  const unboundHotels = hotels.filter(h => !boundHotelIds.has(h._id))

  if (unboundHotels.length === 0) {
    return { code: 0, data: { matched: 0, total: 0, results: [], message: '所有酒店已绑定' } }
  }

  const results = []
  for (const hotel of unboundHotels) {
    const searchName = hotel.name.replace(/[\(\)（）\[\]【】]/g, ' ').trim()
    const cityHint = hotel.city || hotel.district || ''

    try {
      const poiResult = await searchPOI({
        keywords: searchName,
        city: cityHint,
        types: '100000|120000',
        pageSize: 5
      })

      let bestPoi = null
      let bestScore = null

      for (const poi of poiResult.pois) {
        const score = calculateMatchScore(poi, hotel)
        if (!bestScore || score.total > bestScore.total) {
          bestScore = score
          bestPoi = poi
        }
      }

      results.push({
        hotelId: hotel._id,
        hotelName: hotel.name,
        hotelAddress: hotel.address,
        bestPoi: bestPoi ? {
          id: bestPoi.id,
          name: bestPoi.name,
          address: bestPoi.address,
          tel: bestPoi.tel
        } : null,
        matchScore: bestScore,
        matchStatus: bestScore && bestScore.total >= matchThreshold ? 'suggested' : 'unmatched'
      })
    } catch (err) {
      results.push({
        hotelId: hotel._id,
        hotelName: hotel.name,
        bestPoi: null,
        matchScore: null,
        matchStatus: 'error',
        error: err.message
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

// ─── Hotel CRUD (保持原有) ───

async function handleSaveHotel(event) {
  const { name, address, city, phone, contact, remark } = event
  if (!name || !address) {
    return { code: 400, message: '酒店名称和地址为必填项' }
  }

  const geo = await geocode(address, city)
  if (!geo) {
    return { code: 404, message: '无法解析酒店地址' }
  }

  const hotelData = {
    name,
    address,
    city: geo.city || city || '',
    province: geo.province || '',
    district: geo.district || '',
    phone: phone || '',
    contact: contact || '',
    remark: remark || '',
    latitude: geo.latitude,
    longitude: geo.longitude,
    formatted_address: geo.formatted_address,
    status: 'active',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }

  const res = await db.collection('business_hotels').add({ data: hotelData })
  return { code: 0, data: { hotelId: res._id, ...hotelData } }
}

async function handleUpdateHotel(event) {
  const { hotelId, name, address, city, phone, contact, remark } = event
  if (!hotelId) return { code: 400, message: '缺少 hotelId' }

  const updateData = { updatedAt: db.serverDate() }
  if (name) updateData.name = name
  if (phone !== undefined) updateData.phone = phone
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
  }

  await db.collection('business_hotels').doc(hotelId).update({ data: updateData })
  return { code: 0, data: { hotelId, ...updateData } }
}

async function handleListHotels(event) {
  const { page = 1, pageSize = 100, status } = event
  const where = {}
  if (status) where.status = status

  const countRes = await db.collection('business_hotels').where(where).count()
  const skip = (page - 1) * pageSize
  const listRes = await db.collection('business_hotels')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  return { code: 0, data: { list: listRes.data, total: countRes.total, page, pageSize } }
}

async function handleDeleteHotel(event) {
  const { hotelId } = event
  if (!hotelId) return { code: 400, message: '缺少 hotelId' }
  await db.collection('business_hotels').doc(hotelId).update({
    data: { status: 'deleted', updatedAt: db.serverDate() }
  })
  return { code: 0, message: '已删除' }
}

// ─── 入口路由 ───

exports.main = async (event, context) => {
  const { action, ...payload } = event

  const handlers = {
    geocode: handleGeocode,
    batchGeocode: handleBatchGeocode,
    searchPOI: handleSearchPOI,
    searchAndMatch: handleSearchAndMatch,
    bindPOI: handleBindPOI,
    unbindPOI: handleUnbindPOI,
    listBindings: handleListBindings,
    batchMatch: handleBatchMatch,
    saveHotel: handleSaveHotel,
    updateHotel: handleUpdateHotel,
    listHotels: handleListHotels,
    deleteHotel: handleDeleteHotel
  }

  if (!action || !handlers[action]) {
    return { code: 400, message: `未知 action: ${action}，可用: ${Object.keys(handlers).join(', ')}` }
  }

  try {
    return await handlers[action](payload)
  } catch (err) {
    console.error(`[business-geocode] ${action} 错误:`, err)
    if (err.code && err.message) return { code: err.code, message: err.message }
    return { code: 500, message: err.message || '服务器内部错误' }
  }
}
