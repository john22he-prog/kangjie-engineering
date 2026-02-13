// utils/auth.js — 用户鉴权 / 角色判断
const { ROLES } = require('./constants')

// 当前用户
let _currentUser = null

// 尝试从本地缓存恢复用户
try {
  const cached = wx.getStorageSync('kj_user')
  if (cached && cached.userId) {
    _currentUser = cached
  }
} catch (e) {}

/**
 * 设置当前用户（登录成功后调用）
 */
function setUser(user) {
  _currentUser = user
  if (user) {
    wx.setStorageSync('kj_user', user)
  } else {
    wx.removeStorageSync('kj_user')
  }
}

/**
 * 获取当前用户信息
 */
function getUser() {
  return _currentUser || {}
}

/**
 * 是否已登录
 */
function isLoggedIn() {
  return !!(_currentUser && _currentUser.userId)
}

/**
 * 退出登录
 */
function logout() {
  _currentUser = null
  wx.removeStorageSync('kj_user')
}

/**
 * 获取 mock 用户列表（开发测试用，正式环境返回空数组）
 */
function getMockUsers() {
  return []
}

/**
 * 切换到指定 mock 用户（开发测试用，正式环境无效）
 */
function switchMockUser(userId) {
  return false
}

function getRole() {
  return (_currentUser && _currentUser.role) || ''
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

/**
 * 是否有写权限（Engineer / Supervisor / Admin）
 */
function canWrite() {
  return isEngineer() || isSupervisor() || isAdmin()
}

/**
 * 是否可以 ACK 报警（Supervisor / Management / Admin）
 */
function canAck() {
  return isSupervisor() || isManagement() || isAdmin()
}

/**
 * 是否可以管理数据（Supervisor / Management / Admin）
 */
function canManage() {
  return isSupervisor() || isManagement() || isAdmin()
}

/**
 * 是否可以查看成本看板（Supervisor / Management / Admin）
 */
function canViewCost() {
  return isSupervisor() || isManagement() || isAdmin()
}

/**
 * 是否可以切换工厂（Management / Admin）
 */
function canSwitchFactory() {
  return isManagement() || isAdmin()
}

module.exports = {
  setUser,
  getUser,
  isLoggedIn,
  logout,
  getMockUsers,
  switchMockUser,
  getRole,
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
