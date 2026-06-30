// 业务部 API 调用封装
function callFunction(action, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'business-geocode',
      data: { action, ...data },
      success: (res) => {
        const result = res.result
        if (result.code === 0) resolve(result.data)
        else reject(new Error(result.message || '请求失败'))
      },
      fail: (err) => reject(err)
    })
  })
}

function geocode(address, city) {
  return callFunction('geocode', { address, city })
}

function batchGeocode(addresses) {
  return callFunction('batchGeocode', { addresses })
}

function searchPOI(params) {
  return callFunction('searchPOI', params)
}

function searchAndMatch(params) {
  return callFunction('searchAndMatch', params)
}

function bindPOI(data) {
  return callFunction('bindPOI', data)
}

function unbindPOI(data) {
  return callFunction('unbindPOI', data)
}

function listBindings(params = {}) {
  return callFunction('listBindings', params)
}

function batchMatch(params = {}) {
  return callFunction('batchMatch', params)
}

function saveHotel(data) {
  return callFunction('saveHotel', data)
}

function updateHotel(data) {
  return callFunction('updateHotel', data)
}

function listHotels(params = {}) {
  return callFunction('listHotels', params)
}

function deleteHotel(hotelId) {
  return callFunction('deleteHotel', { hotelId })
}

module.exports = {
  geocode,
  batchGeocode,
  searchPOI,
  searchAndMatch,
  bindPOI,
  unbindPOI,
  listBindings,
  batchMatch,
  saveHotel,
  updateHotel,
  listHotels,
  deleteHotel
}
