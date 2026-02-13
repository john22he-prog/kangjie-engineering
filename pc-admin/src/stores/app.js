import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/utils/api'

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const currentFactoryId = ref(localStorage.getItem('kj_factory_id') || '')
  const currentFactoryName = ref(localStorage.getItem('kj_factory_name') || '')
  const factories = ref([])

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function setCurrentFactory(factoryId, factoryName) {
    currentFactoryId.value = factoryId
    currentFactoryName.value = factoryName
    localStorage.setItem('kj_factory_id', factoryId)
    localStorage.setItem('kj_factory_name', factoryName)
  }

  async function loadFactories() {
    const res = await api.listFactories()
    if (res.ok) {
      factories.value = res.data.list
      // Auto-select first factory if none selected
      if (!currentFactoryId.value && res.data.list.length > 0) {
        setCurrentFactory(res.data.list[0].factoryId, res.data.list[0].factoryName)
      }
    }
  }

  return {
    sidebarCollapsed,
    toggleSidebar,
    currentFactoryId,
    currentFactoryName,
    factories,
    setCurrentFactory,
    loadFactories,
  }
})
