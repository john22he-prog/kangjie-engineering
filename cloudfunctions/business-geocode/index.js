const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const AMAP_KEY = process.env.AMAP_KEY || ''

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

async function geocode(address, city) {
  if (!AMAP_KEY) {
    throw { code: 500, message: '未配置 AMAP_KEY 环境变量，请在云函数环境变量中设置高德 Web 服务 API Key' }
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

async function handleGeocode(event) {
  const { address, city } = event
  if (!address) {
    return { code: 400, message: '缺少 address 参数' }
  }
  const result = await geocode(address, city)
  if (!result) {
    return { code: 404, message: '无法解析该地址，请检查地址是否正确' }
  }
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

async function handleSaveHotel(event) {
  const { name, address, city, phone, contact, remark } = event
  if (!name || !address) {
    return { code: 400, message: '酒店名称和地址为必填项' }
  }

  const geo = await geocode(address, city)
  if (!geo) {
    return { code: 404, message: '无法解析酒店地址，请检查地址是否正确或补充城市信息' }
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
  return { code: 0, data: { hotelId: res._id, ...hotelData, latitude: geo.latitude, longitude: geo.longitude } }
}

async function handleUpdateHotel(event) {
  const { hotelId, name, address, city, phone, contact, remark } = event
  if (!hotelId) {
    return { code: 400, message: '缺少 hotelId' }
  }

  const updateData = { updatedAt: db.serverDate() }
  if (name) updateData.name = name
  if (phone !== undefined) updateData.phone = phone
  if (contact !== undefined) updateData.contact = contact
  if (remark !== undefined) updateData.remark = remark

  if (address) {
    const geo = await geocode(address, city)
    if (!geo) {
      return { code: 404, message: '无法解析新地址' }
    }
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
  const total = countRes.total

  const skip = (page - 1) * pageSize
  const listRes = await db.collection('business_hotels')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  return { code: 0, data: { list: listRes.data, total, page, pageSize } }
}

async function handleDeleteHotel(event) {
  const { hotelId } = event
  if (!hotelId) return { code: 400, message: '缺少 hotelId' }
  await db.collection('business_hotels').doc(hotelId).update({
    data: { status: 'deleted', updatedAt: db.serverDate() }
  })
  return { code: 0, message: '已删除' }
}

exports.main = async (event, context) => {
  const { action, ...payload } = event

  const handlers = {
    geocode: handleGeocode,
    batchGeocode: handleBatchGeocode,
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
