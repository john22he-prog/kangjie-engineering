import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/utils/api'

// PC端允许登录的角色
const PC_ALLOWED_ROLES = ['Supervisor', 'Management', 'Admin', 'Viewer']

// 解析 JWT payload（不验证签名，仅读取过期时间）
function parseJwtPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    // base64url -> base64
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    if (pad) b64 += '===='.slice(0, 4 - pad)
    const json = atob(b64)
    return JSON.parse(json)
  } catch {
    return null
  }
}

// 检查 Token 是否已过期
function isTokenExpired(tokenStr) {
  if (!tokenStr) return true
  const payload = parseJwtPayload(tokenStr)
  if (!payload || !payload.exp) return false // 无 exp 字段不判定过期
  return payload.exp < Math.floor(Date.now() / 1000)
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(JSON.parse(localStorage.getItem('kj_user') || 'null'))
  const token = ref(localStorage.getItem('kj_token') || '')

  // 启动时检查 Token 是否已过期，过期则清除
  if (token.value && isTokenExpired(token.value)) {
    console.warn('Token 已过期，自动退出登录')
    user.value = null
    token.value = ''
    localStorage.removeItem('kj_user')
    localStorage.removeItem('kj_token')
  }

  const isLoggedIn = computed(() => !!user.value && !!token.value)
  const isAdmin = computed(() => user.value?.role === 'Admin')
  const isSupervisor = computed(() => user.value?.role === 'Supervisor')
  const isManagement = computed(() => user.value?.role === 'Management')
  const isViewer = computed(() => user.value?.role === 'Viewer')
  const canEdit = computed(() => !isViewer.value) // 查看员不能编辑
  const canManage = computed(() => isAdmin.value || isSupervisor.value || isManagement.value)
  const canViewCost = computed(() => isAdmin.value || isSupervisor.value || isManagement.value || isViewer.value)
  const canSwitchFactory = computed(() => isAdmin.value || isManagement.value)

  async function login(username, password) {
    const res = await api.adminLogin({ username, password })
    if (res.ok) {
      const role = res.data.user.role
      // PC端允许的角色
      if (!PC_ALLOWED_ROLES.includes(role)) {
        return { ok: false, error: { message: '该角色无PC端登录权限' } }
      }
      user.value = res.data.user
      token.value = res.data.token
      localStorage.setItem('kj_user', JSON.stringify(res.data.user))
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
    login,
    logout,
  }
})
