import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/utils/api'

// PC端允许登录的角色
const PC_ALLOWED_ROLES = ['Supervisor', 'Management', 'Admin']

export const useAuthStore = defineStore('auth', () => {
  const user = ref(JSON.parse(localStorage.getItem('kj_user') || 'null'))
  const token = ref(localStorage.getItem('kj_token') || '')

  const isLoggedIn = computed(() => !!user.value && !!token.value)
  const isAdmin = computed(() => user.value?.role === 'Admin')
  const isSupervisor = computed(() => user.value?.role === 'Supervisor')
  const isManagement = computed(() => user.value?.role === 'Management')
  const canManage = computed(() => isAdmin.value || isSupervisor.value || isManagement.value)
  const canViewCost = computed(() => isAdmin.value || isSupervisor.value || isManagement.value)
  const canSwitchFactory = computed(() => isAdmin.value || isManagement.value)

  async function login(username, password) {
    const res = await api.adminLogin({ username, password })
    if (res.ok) {
      const role = res.data.user.role
      // PC端仅允许主管及以上角色登录
      if (!PC_ALLOWED_ROLES.includes(role)) {
        return { ok: false, error: { message: '仅主管及以上人员可登录PC端' } }
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
    canManage,
    canViewCost,
    canSwitchFactory,
    login,
    logout,
  }
})
