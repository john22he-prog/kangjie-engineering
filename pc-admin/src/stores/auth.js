import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/utils/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(JSON.parse(localStorage.getItem('kj_user') || 'null'))
  const token = ref(localStorage.getItem('kj_token') || '')

  const isLoggedIn = computed(() => !!user.value && !!token.value)
  const isAdmin = computed(() => user.value?.role === 'Admin')
  const isSupervisor = computed(() => user.value?.role === 'Supervisor')
  const canManage = computed(() => isAdmin.value || isSupervisor.value)

  async function login(username, password) {
    const res = await api.adminLogin({ username, password })
    if (res.ok) {
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
    canManage,
    login,
    logout,
  }
})
