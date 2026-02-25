import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/utils/api'
import { PERMISSIONS, migratePermissions, hasPermission as _hasPermission } from '@/utils/permissions'

function parseJwtPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    if (pad) b64 += '===='.slice(0, 4 - pad)
    const json = atob(b64)
    return JSON.parse(json)
  } catch {
    return null
  }
}

function isTokenExpired(tokenStr) {
  if (!tokenStr) return true
  const payload = parseJwtPayload(tokenStr)
  if (!payload || !payload.exp) return false
  return payload.exp < Math.floor(Date.now() / 1000)
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(JSON.parse(localStorage.getItem('kj_user') || 'null'))
  const token = ref(localStorage.getItem('kj_token') || '')

  if (token.value && isTokenExpired(token.value)) {
    console.warn('Token 已过期，自动退出登录')
    user.value = null
    token.value = ''
    localStorage.removeItem('kj_user')
    localStorage.removeItem('kj_token')
  }

  // 兼容：确保 user 有 permissions 字段
  if (user.value && (!Array.isArray(user.value.permissions) || user.value.permissions.length === 0)) {
    user.value.permissions = migratePermissions(user.value)
    localStorage.setItem('kj_user', JSON.stringify(user.value))
  }

  const isLoggedIn = computed(() => !!user.value && !!token.value)

  function hasPermission(key) {
    if (!user.value) return false
    return _hasPermission(user.value.permissions || [], key)
  }

  // 保留旧计算属性以兼容，内部改用 permissions
  const isAdmin = computed(() => hasPermission(PERMISSIONS.SYSTEM_ADMIN))
  const isSupervisor = computed(() => user.value?.role === 'Supervisor')
  const isManagement = computed(() => user.value?.role === 'Management')
  const isViewer = computed(() => user.value?.role === 'Viewer')
  const canEdit = computed(() => hasPermission(PERMISSIONS.RECORD_WRITE) || hasPermission(PERMISSIONS.RECORD_DELETE) || hasPermission(PERMISSIONS.ASSET_MANAGE) || hasPermission(PERMISSIONS.PART_MANAGE) || hasPermission(PERMISSIONS.INVENTORY_MANAGE) || hasPermission(PERMISSIONS.BOILER_WRITE) || hasPermission(PERMISSIONS.BOILER_MANAGE) || hasPermission(PERMISSIONS.SYSTEM_ADMIN))
  const canManage = computed(() => hasPermission(PERMISSIONS.ASSET_MANAGE) || hasPermission(PERMISSIONS.USER_MANAGE) || hasPermission(PERMISSIONS.INSPECTION_MANAGE) || hasPermission(PERMISSIONS.INVENTORY_MANAGE) || hasPermission(PERMISSIONS.BOILER_MANAGE) || hasPermission(PERMISSIONS.SYSTEM_ADMIN))
  const canViewCost = computed(() => hasPermission(PERMISSIONS.COST_VIEW))
  const canSwitchFactory = computed(() => hasPermission(PERMISSIONS.FACTORY_SWITCH))

  async function login(username, password) {
    const res = await api.adminLogin({ username, password })
    if (res.ok) {
      const userData = res.data.user
      if (!Array.isArray(userData.permissions) || userData.permissions.length === 0) {
        userData.permissions = migratePermissions(userData)
      }
      user.value = userData
      token.value = res.data.token
      localStorage.setItem('kj_user', JSON.stringify(userData))
      localStorage.setItem('kj_token', res.data.token)
    }
    return res
  }

  function logout() {
    user.value = null
    token.value = ''
    localStorage.removeItem('kj_user')
    localStorage.removeItem('kj_token')
  }

  return {
    user,
    token,
    isLoggedIn,
    isAdmin,
    isSupervisor,
    isManagement,
    isViewer,
    canEdit,
    canManage,
    canViewCost,
    canSwitchFactory,
    hasPermission,
    login,
    logout,
  }
})
