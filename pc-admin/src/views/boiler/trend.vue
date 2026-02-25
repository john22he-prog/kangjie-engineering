<template>
  <div class="page-container boiler-trend">
    <div class="page-header">
      <h2>趋势分析</h2>
      <div class="header-actions">
        <BoilerParkSelect @change="loadTrend" />
        <el-select v-model="metric" style="width:180px" @change="loadTrend">
          <el-option v-for="m in metricOptions" :key="m.value" :label="m.label" :value="m.value" />
        </el-select>
        <el-select v-model="range" style="width:130px" @change="onRangeChange">
          <el-option label="近7天" value="7d" />
          <el-option label="近14天" value="14d" />
          <el-option label="近30天" value="30d" />
          <el-option label="自定义" value="custom" />
        </el-select>
        <el-date-picker v-if="range === 'custom'" v-model="customRange" type="daterange"
          start-placeholder="开始" end-placeholder="结束" format="YYYY-MM-DD" value-format="YYYY-MM-DD"
          style="width:260px" @change="loadTrend" />
        <el-button type="primary" @click="entryRef?.open()"><el-icon><Edit /></el-icon>录入数据</el-button>
      </div>
    </div>

    <el-card shadow="never" v-loading="loading">
      <div ref="chartRef" class="trend-chart"></div>
    </el-card>

    <el-card shadow="never" style="margin-top:16px">
      <template #header><span class="card-title">数据明细</span></template>
      <el-table :data="tableData" stripe size="small" max-height="400">
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column :label="currentMetricLabel" width="150">
          <template #default="{ row }">
            <span class="num-val">{{ row.value }}</span>
            <span class="unit-txt">{{ currentUnit }}</span>
          </template>
        </el-table-column>
        <el-table-column label="环比变化" width="140">
          <template #default="{ row }">
            <span v-if="row.change != null" :class="row.change >= 0 ? 'chg-up' : 'chg-down'">
              {{ row.change >= 0 ? '+' : '' }}{{ row.change.toFixed(1) }}%
            </span>
            <span v-else class="no-data">--</span>
          </template>
        </el-table-column>
        <el-table-column label="vs 目标" width="120" v-if="hasTarget">
          <template #default="{ row }">
            <span v-if="row.vsTarget != null" :class="row.vsTarget > 0 ? 'chg-up' : 'chg-down'">
              {{ row.vsTarget > 0 ? '+' : '' }}{{ row.vsTarget.toFixed(1) }}%
            </span>
            <span v-else class="no-data">--</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    <BoilerEntryDialog ref="entryRef" @submitted="loadTrend" />
  </div>
</template>

<script setup>
import BoilerParkSelect from '@/components/BoilerParkSelect.vue'
import BoilerEntryDialog from '@/components/BoilerEntryDialog.vue'
import { Edit } from '@element-plus/icons-vue'
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import { api } from '@/utils/api'
import echarts from '@/utils/echarts'
import dayjs from 'dayjs'

const appStore = useAppStore()

const metricOptions = [
  { value: 'total_steam_production', label: '产汽量 (t)', unit: 't' },
  { value: 'cost_per_steam', label: '吨汽成本 (¥/t)', unit: '¥/t' },
  { value: 'steam_fuel_ratio', label: '汽柴比', unit: '' },
  { value: 'total_cost', label: '总成本 (¥)', unit: '¥' },
  { value: 'total_electricity', label: '用电量 (kWh)', unit: 'kWh' },
  { value: 'steam_loss_rate', label: '蒸汽损耗率 (%)', unit: '%' },
  { value: 'fuel_stock_estimate', label: '燃料库存 (t)', unit: 't' },
  { value: 'fuel_stock_days', label: '燃料可用天数', unit: '天' },
]

const metric = ref('total_steam_production')
const range = ref('7d')
const customRange = ref([])
const entryRef = ref(null)
const loading = ref(false)
const trendData = ref([])
const kpiTargets = ref({})
const chartRef = ref(null)
let chartInstance = null

const currentMetricLabel = computed(() => metricOptions.find(m => m.value === metric.value)?.label || '')
const currentUnit = computed(() => metricOptions.find(m => m.value === metric.value)?.unit || '')

const targetValue = computed(() => {
  if (metric.value === 'cost_per_steam') return kpiTargets.value.costPerSteam || null
  if (metric.value === 'steam_fuel_ratio') return kpiTargets.value.steamFuelRatio || null
  return null
})
const hasTarget = computed(() => targetValue.value != null)

const tableData = computed(() => trendData.value.map((item, idx) => {
  const change = idx > 0 && trendData.value[idx - 1].value > 0
    ? ((item.value - trendData.value[idx - 1].value) / trendData.value[idx - 1].value * 100) : null
  const tv = targetValue.value
  const vsTarget = tv && item.value > 0 ? ((item.value - tv) / tv * 100) : null
  return { ...item, change, vsTarget }
}))

function getDateRange() {
  if (range.value === 'custom' && customRange.value?.length === 2) return { startDate: customRange.value[0], endDate: customRange.value[1] }
  const days = { '7d': 6, '14d': 13, '30d': 29 }[range.value] || 6
  return { startDate: dayjs().subtract(days, 'day').format('YYYY-MM-DD'), endDate: dayjs().format('YYYY-MM-DD') }
}

function onRangeChange() { if (range.value !== 'custom') loadTrend() }

async function loadTrend() {
  const { startDate, endDate } = getDateRange()
  if (!startDate || !endDate) return
  loading.value = true
  try {
    const factoryId = appStore.currentFactoryId || undefined
    const [res, cfgRes] = await Promise.all([
      api.boilerGetTrend({ metric: metric.value, startDate, endDate, factoryId }),
      api.boilerGetConfig(factoryId || ''),
    ])
    if (cfgRes.ok && cfgRes.data?.kpiTargets) kpiTargets.value = cfgRes.data.kpiTargets
    if (res.ok) { trendData.value = res.data; await nextTick(); renderChart() }
  } finally { loading.value = false }
}

function renderChart() {
  if (!chartRef.value) return
  if (!chartInstance) chartInstance = echarts.init(chartRef.value)
  const dates = trendData.value.map(d => (d.date || d.record_date || '').slice(5))
  const values = trendData.value.map(d => d.value)
  const unit = currentUnit.value

  const markLineData = [
    { type: 'average', name: '平均值', lineStyle: { color: '#909399', type: 'dashed' }, label: { formatter: '{c}', fontSize: 11 } }
  ]
  const tv = targetValue.value
  if (tv != null) {
    markLineData.push({
      yAxis: tv,
      name: '目标',
      label: { formatter: '目标 {c}', position: 'insideStartTop', fontSize: 11 },
      lineStyle: { color: '#F56C6C', type: 'solid', width: 2 },
    })
  }

  const metricColor = {
    total_steam_production: '#409EFF', cost_per_steam: '#E65100', steam_fuel_ratio: '#1ABC9C',
    total_cost: '#F56C6C', total_electricity: '#E6A23C', steam_loss_rate: '#9B59B6',
    fuel_stock_estimate: '#67C23A', fuel_stock_days: '#3498DB',
  }[metric.value] || '#E65100'

  chartInstance.setOption({
    tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}<br/>${currentMetricLabel.value}：${p[0].value} ${unit}` },
    grid: { left: 60, right: 30, top: 30, bottom: 40 },
    xAxis: { type: 'category', data: dates, axisLabel: { rotate: dates.length > 15 ? 45 : 0 } },
    yAxis: { type: 'value', name: unit },
    series: [{ type: 'line', data: values, smooth: true,
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: metricColor + '33' }, { offset: 1, color: metricColor + '05' }
      ]) },
      lineStyle: { color: metricColor, width: 2 }, itemStyle: { color: metricColor },
      markLine: { silent: true, data: markLineData },
    }],
  }, true)
}

function onResize() { chartInstance?.resize() }
onMounted(() => { loadTrend(); window.addEventListener('resize', onResize) })
onBeforeUnmount(() => { window.removeEventListener('resize', onResize); chartInstance?.dispose() })
</script>

<style lang="scss" scoped>
.boiler-trend {
  .header-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .trend-chart { height: 360px; }
  .card-title { font-weight: 600; font-size: 15px; }
  .num-val { font-weight: 600; color: #303133; }
  .unit-txt { font-size: 12px; color: #909399; margin-left: 4px; }
  .chg-up { color: #F56C6C; font-weight: 500; }
  .chg-down { color: #67C23A; font-weight: 500; }
  .no-data { color: #c0c4cc; }
}
</style>
