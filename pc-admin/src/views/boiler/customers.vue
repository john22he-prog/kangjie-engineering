<template>
  <div class="page-container boiler-customers">
    <div class="page-header">
      <h2>客户用汽</h2>
      <div class="header-actions">
        <BoilerParkSelect @change="loadData" />
        <el-radio-group v-model="range" @change="loadData" size="default">
          <el-radio-button value="7">近7天</el-radio-button>
          <el-radio-button value="30">近30天</el-radio-button>
        </el-radio-group>
      
        <el-button type="primary" @click="entryRef?.open()"><el-icon><Edit /></el-icon>录入数据</el-button>
      </div>
    </div>

    <div v-loading="loading">
      <el-row :gutter="16" class="summary-row" v-if="customers.length">
        <el-col :xs="12" :sm="8" :md="6" v-for="c in customers" :key="c.name">
          <div class="summary-card" :class="{ active: selectedName === c.name }" @click="selectedName = selectedName === c.name ? '' : c.name">
            <div class="sc-name">{{ c.name }}</div>
            <div class="sc-total">{{ c.total_steam?.toLocaleString() ?? '--' }} <span class="sc-unit">吨</span></div>
            <div class="sc-meta">
              <span>{{ c.days?.length ?? 0 }} 天</span>
              <span>日均 {{ c.dailyAvg ?? '--' }} 吨</span>
            </div>
          </div>
        </el-col>
      </el-row>

      <el-card shadow="never" class="table-card">
        <template #header>
          <div class="card-header">
            <span class="card-title">每日用汽明细</span>
            <el-radio-group v-model="selectedName" size="small" v-if="customers.length > 1">
              <el-radio-button value="">全部客户</el-radio-button>
              <el-radio-button v-for="c in customers" :key="c.name" :value="c.name">{{ c.name }}</el-radio-button>
            </el-radio-group>
          </div>
        </template>
        <el-table :data="tableData" stripe size="default" max-height="500" empty-text="暂无数据">
          <el-table-column prop="date" label="日期" width="120" sortable />
          <el-table-column prop="customer" label="客户" width="120" v-if="!selectedName" />
          <el-table-column prop="steam_usage" label="用汽量（吨）" align="right" width="140" sortable />

        </el-table>
      </el-card>

      <el-card v-if="customers.length" shadow="never" class="trend-card">
        <template #header><span class="card-title">用汽趋势</span></template>
        <div ref="chartRef" class="chart-box"></div>
      </el-card>
    </div>
    <BoilerEntryDialog ref="entryRef" @submitted="loadData" />
  </div>
</template>

<script setup>
import BoilerParkSelect from '@/components/BoilerParkSelect.vue'
import BoilerEntryDialog from '@/components/BoilerEntryDialog.vue'
import { Edit } from '@element-plus/icons-vue'
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { api } from '@/utils/api'
import echarts from '@/utils/echarts'

const appStore = useAppStore()
const entryRef = ref(null)
const loading = ref(false)
const customers = ref([])
const selectedName = ref('')
const range = ref('30')
const chartRef = ref(null)
let chartInstance = null

const tableData = computed(() => {
  const rows = []
  for (const c of customers.value) {
    if (selectedName.value && c.name !== selectedName.value) continue
    for (const d of c.days || []) {
      rows.push({ date: d.date, customer: c.name, steam_usage: d.steam_usage })
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date))
  return rows
})

async function loadData() {
  loading.value = true
  try {
    const factoryId = appStore.currentFactoryId || undefined
    const res = await api.boilerGetCustomerStats({ factoryId, days: Number(range.value) })
    if (res.ok) {
      customers.value = res.data || []
      if (customers.value.length === 1) selectedName.value = customers.value[0].name
      else selectedName.value = ''
    }
  } finally { loading.value = false }
  await nextTick()
  renderChart()
}

function renderChart() {
  if (!chartRef.value || !customers.value.length) return
  if (!chartInstance) chartInstance = echarts.init(chartRef.value)
  const allDates = new Set()
  for (const c of customers.value) {
    for (const d of c.days || []) allDates.add(d.date)
  }
  const dates = [...allDates].sort()
  const series = customers.value.map(c => {
    const dayMap = {}
    for (const d of c.days || []) dayMap[d.date] = d.steam_usage
    return {
      name: c.name, type: 'bar', stack: 'total',
      data: dates.map(dt => dayMap[dt] || 0),
      barMaxWidth: 32,
      itemStyle: { borderRadius: [2, 2, 0, 0] },
    }
  })
  chartInstance.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: customers.value.map(c => c.name), bottom: 0 },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category', data: dates.map(d => d.slice(5)) },
    yAxis: { type: 'value', name: '吨' },
    series,
  }, true)
}

watch(() => appStore.currentFactoryId, () => loadData())
function onResize() { chartInstance?.resize() }
onMounted(() => { loadData(); window.addEventListener('resize', onResize) })
onBeforeUnmount(() => { window.removeEventListener('resize', onResize); chartInstance?.dispose() })
</script>

<style lang="scss" scoped>
.boiler-customers {
  .header-actions { display: flex; gap: 12px; align-items: center; }
  .summary-row { margin-bottom: 16px; .el-col { margin-bottom: 12px; } }
  .summary-card {
    background: #fff; border-radius: 12px; padding: 16px 20px;
    box-shadow: 0 1px 4px rgba(0,0,0,.06); cursor: pointer; transition: all .2s;
    border: 2px solid transparent;
    &:hover { box-shadow: 0 4px 16px rgba(0,0,0,.12); }
    &.active { border-color: #409EFF; background: #ecf5ff; }
  }
  .sc-name { font-size: 15px; font-weight: 600; color: #303133; margin-bottom: 8px; }
  .sc-total { font-size: 26px; font-weight: 700; color: #303133; }
  .sc-unit { font-size: 14px; font-weight: 400; color: #909399; }
  .sc-meta { display: flex; gap: 16px; margin-top: 6px; font-size: 13px; color: #909399; }
  .card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
  .card-title { font-weight: 600; font-size: 15px; }
  .table-card { border-radius: 12px; margin-bottom: 16px; }
  .trend-card { border-radius: 12px; }
  .chart-box { height: 300px; }
  .text-muted { color: #c0c4cc; }
}
</style>
