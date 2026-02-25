function resolveFactoryScope(user, passedFactoryId) {
  if (user.role === 'operator') {
    return user.factory_id
  }
  return passedFactoryId || null
}

module.exports = { resolveFactoryScope }
