<template>
  <el-select
    :model-value="appStore.currentFactoryId"
    @change="onSwitch"
    placeholder="选择园区"
    style="width: 180px;"
    size="default"
  >
    <el-option
      v-for="f in appStore.factories"
      :key="f.factoryId"
      :label="parkNames[f.factoryId] || f.factoryName"
      :value="f.factoryId"
    />
  </el-select>
</template>

<script setup>
import { reactive, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { api } from '@/utils/api'

const emit = defineEmits(['change'])
const appStore = useAppStore()
const parkNames = reactive({})

async function loadParks() {
  try {
    const res = await api.boilerListParks()
    if (res.ok && res.data) {
      for (const p of res.data) {
        if (p.parkName) parkNames[p.factoryId] = p.parkName
      }
    }
  } catch (e) { /* ignore */ }
}

function onSwitch(factoryId) {
  const f = appStore.factories.find(x => x.factoryId === factoryId)
  if (f) {
    appStore.setCurrentFactory(f.factoryId, f.factoryName)
    emit('change', factoryId)
  }
}

onMounted(loadParks)
</script>
