// utils/auth.js — 用户鉴权 / 角色判断
const { ROLES } = require('./constants')

// Mock 用户列表（开发测试用）
const MOCK_USERS = [
  { userId: 'user_001', displayName: '张工程', role: ROLES.ENGINEER, status: 'active', factoryId: '' },
  { userId: 'user_002', displayName: '李主管', role: ROLES.SUPERVISOR, status: 'active', factoryId: 'F-001' },
  { userId: 'user_003', displayName: '王工程', role: ROLES.ENGINEER, status: 'active', factoryId: '' },
  { userId: 'user_004', displayName: '管理员', role: ROLES.ADMIN, status: 'active', factoryId: '' },
  { userId: 'user_005', displayName: '赵管理', role: ROLES.MANAGEMENT, status: 'active', factoryId: '' }
]

// 当前用户（默认工程师）
let _currentUser = MOCK_USERS[0]

/**
 * 设置当前用户（登录成功后调用）
 */
function setUser(user) {
  _currentUser = user
}

/**
 * 获取当前用户信息
 */
function getUser() {
  return _currentUser || {}
}

/**
 * 获取 mock 用户列表（开发测试用）
 */
function getMockUsers() {
  return MOCK_USERS
}

/**
 * 切换到指定 mock 用户（开发测试用）
 */
function switchMockUser(userId) {
  const user = MOCK_USERS.find(u => u.userId === userId)
  if (user) {
    _currentUser = user
    return true
  }
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
 * 是否有写权限（Engineer）
 */
function canWrite() {
  return isEngineer()
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
