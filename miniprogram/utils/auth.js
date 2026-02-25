// utils/auth.js — 用户鉴权 / 权限判断
const { ROLES } = require('./constants')
const { PERMISSIONS, migratePermissions, hasPermission: _hasPermission } = require('./permissions')

let _currentUser = null

try {
  var cached = wx.getStorageSync('kj_user')
  if (cached && cached.userId) {
    _currentUser = cached
  }
} catch (e) {}

function setUser(user) {
  _currentUser = user
  if (user) {
    if (!Array.isArray(user.permissions) || user.permissions.length === 0) {
      user.permissions = migratePermissions(user)
    }
    wx.setStorageSync('kj_user', user)
  } else {
    wx.removeStorageSync('kj_user')
  }
}

function getUser() {
  return _currentUser || {}
}

function isLoggedIn() {
  return !!(_currentUser && _currentUser.userId)
}

function logout() {
  _currentUser = null
  wx.removeStorageSync('kj_user')
}

function getMockUsers() {
  return []
}

function switchMockUser(userId) {
  return false
}

function getRole() {
  return (_currentUser && _currentUser.role) || ''
}

function getPermissions() {
  if (!_currentUser) return []
  if (Array.isArray(_currentUser.permissions) && _currentUser.permissions.length > 0) {
    return _currentUser.permissions
  }
  return migratePermissions(_currentUser)
}

function hasPermission(key) {
  return _hasPermission(getPermissions(), key)
}

function isEngineer() {
  return getRole() === ROLES.ENGINEER
}

function isViewer() {
  return getRole() === ROLES.VIEWER
}

function isSupervisor() {
  return getRole() === ROLES.SUPERVISOR
}

function isAdmin() {
  return getRole() === ROLES.ADMIN
}

function isManagement() {
  return getRole() === ROLES.MANAGEMENT
}

function canWrite() {
  return hasPermission(PERMISSIONS.RECORD_WRITE)
}

function canAck() {
  return hasPermission(PERMISSIONS.ALERT_ACK)
}

function canManage() {
  return hasPermission(PERMISSIONS.ASSET_MANAGE) || hasPermission(PERMISSIONS.INSPECTION_MANAGE) || hasPermission(PERMISSIONS.USER_MANAGE)
}

function canViewCost() {
  return hasPermission(PERMISSIONS.COST_VIEW)
}

function canSwitchFactory() {
  return hasPermission(PERMISSIONS.FACTORY_SWITCH)
}

module.exports = {
  setUser,
  getUser,
  isLoggedIn,
  logout,
  getMockUsers,
  switchMockUser,
  getRole,
  getPermissions,
  hasPermission,
  isEngineer,
  isViewer,
  isSupervisor,
  isAdmin,
  isManagement,
  canWrite,
  canAck,
  canManage,
  canViewCost,
  canSwitchFactory
}
