function checkRole(user, requiredRoles) {
  if (!requiredRoles || requiredRoles.length === 0) return
  if (user.role === 'admin') return
  if (!requiredRoles.includes(user.role)) {
    throw { code: 403, message: '权限不足，需要角色：' + requiredRoles.join('/') }
  }
}

module.exports = { checkRole }
