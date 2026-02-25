<template>
  <div class="page-container boiler-monthly">
    <div class="page-header">
      <h2>月度报表</h2>
      <div class="header-actions">
        <BoilerParkSelect @change="loadData" />
        <el-date-picker v-model="selectedMonth" type="month" format="YYYY年MM月" value-format="YYYY-MM"
          :clearable="false" style="width:160px" @change="loadData" />
        <el-button @click="exportExcel" :disabled="!monthData">
          <el-icon><Download /></el-icon>导出 Excel
        </el-button>
      
        <el-button type="primary" @click="entryRef?.open()"><el-icon><Edit /></el-icon>录入数据</el-button>
      </div>
    </div>

    <div v-loading="loading">
      <!-- 月度汇总卡片 -->
      <el-row :gutter="16" class="summary-row">
        <el-col :xs="12" :sm="8" :md="4" v-for="item in summaryCards" :key="item.label">
          <div class="summary-card">
            <div class="sc-label">{{ item.label }}</div>
            <div class="sc-value">{{ item.value }}</div>
            <div class="sc-compare" v-if="item.compare != null" :class="item.compare > 0 ? 'red' : 'green'">
              vs 上月 {{ item.compare > 0 ? '+' : '' }}{{ item.compare }}%
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- 日均趋势图 -->
      <el-card shadow="never" class="section-card">
        <template #header><span class="card-title">每日产汽量 &amp; 成本趋势</span></template>
        <div ref="trendChartRef" class="chart-box"></div>
      </el-card>

      <!-- 客户用汽汇总 -->
      <el-card shadow="never" class="section-card">
        <template #header><span class="card-title">各客户月度用汽汇总</span></template>
        <el-table :data="customerSummary" stripe>
          <el-table-column prop="name" label="客户" width="160" />
          <el-table-column prop="totalSteam" label="累计用汽（吨）" align="right">
            <template #default="{ row }">{{ row.totalSteam.toFixed(1) }}</template>
          </el-table-column>
          <el-table-column prop="dailyAvg" label="日均用汽（吨）" align="right">
            <template #default="{ row }">{{ row.dailyAvg.toFixed(1) }}</template>
          </el-table-column>
          <el-table-column label="费用（元）" align="right" v-if="hasPrices">
            <template #default="{ row }">¥{{ row.cost.toLocaleString() }}</template>
          </el-table-column>
          <el-table-column prop="days" label="运行天数" align="center" width="100" />
        </el-table>
      </el-card>

      <!-- 锅炉运行汇总 -->
      <el-card shadow="never" class="section-card">
        <template #header><span class="card-title">各锅炉月度运行汇总</span></template>
        <el-table :data="boilerSummary" stripe>
          <el-table-column prop="name" label="锅炉" width="160" />
          <el-table-column prop="totalElec" label="累计用电（度）" align="right">
            <template #default="{ row }">{{ row.totalElec.toLocaleString() }}</template>
          </el-table-column>
          <el-table-column prop="totalSteam" label="累计产汽（吨）" align="right">
            <template #default="{ row }">{{ row.totalSteam.toFixed(1) }}</template>
          </el-table-column>
          <el-table-column label="电力成本（元）" align="right" v-if="hasPrices">
            <template #default="{ row }">¥{{ row.elecCost.toLocaleString() }}</template>
          </el-table-column>
          <el-table-column prop="days" label="运行天数" align="center" width="100" />
        </el-table>
      </el-card>

      <!-- 明细列表 -->
      <el-card shadow="never" class="section-card">
        <template #header><span class="card-title">每日明细</span></template>
        <el-table :data="dailyRecords" stripe size="small" max-height="500">
          <el-table-column prop="record_date" label="日期" width="110" fixed />
          <el-table-column prop="total_steam_production" label="产汽(吨)" width="90" align="right" />
          <el-table-column prop="total_electricity" label="用电(度)" width="90" align="right">
            <template #default="{ row }">{{ row.total_electricity?.toLocaleString() ?? '--' }}</template>
          </el-table-column>
          <el-table-column prop="fuel_consumed" label="燃料(吨)" width="80" align="right" />
          <el-table-column prop="water_usage" label="用水(吨)" width="80" align="right" />
          <el-table-column prop="fuel_intake" label="进柴(吨)" width="80" align="right">
            <template #default="{ row }">{{ row.fuel_intake || '--' }}</template>
          </el-table-column>
          <el-table-column label="总成本(元)" width="100" align="right" v-if="hasPrices">
            <template #default="{ row }">{{ calcDayCost(row).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="吨汽成本" width="90" align="right" v-if="hasPrices">
            <template #default="{ row }">¥{{ calcPerSteam(row) }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
    <BoilerEntryDialog ref="entryRef" @submitted="loadData" />
  </div>
</template>

<script setup>
import BoilerParkSelect from '@/components/BoilerParkSelect.vue'
import BoilerEntryDialog from '@/components/BoilerEntryDialog.vue'
import { ref, computed, onMounted, watch, nextTick, onBeforeUnmount } from 'vue'
import { useAppStore } from '@/stores/app'
import { api } from '@/utils/api'
import { ElMessage } from 'element-plus'
import { Download, Edit } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import * as XLSX from 'xlsx'

const appStore = useAppStore()
const entryRef = ref(null)
const loading = ref(false)
const selectedMonth = ref(dayjs().format('YYYY-MM'))
const monthData = ref(null)
const dailyRecords = ref([])
const prices = ref({ fuel: 0, electricity: 0, water: 0 })
const lastMonthRecords = ref([])
const trendChartRef = ref(null)
let trendChart = null

const hasPrices = computed(() => prices.value.fuel > 0 || prices.value.electricity > 0 || prices.value.water > 0)

function calcDayCost(r) {
  const p = prices.value
  return Math.round((r.fuel_consumed || 0) * (p.fuel || 0) + (r.total_electricity || 0) * (p.electricity || 0) + (r.water_usage || 0) * (p.water || 0))
}
function calcPerSteam(r) {
  const c = calcDayCost(r)
  return r.total_steam_production > 0 ? (c / r.total_steam_production).toFixed(1) : '--'
}

function sumField(records, field) {
  return records.reduce((s, r) => s + (r[field] || 0), 0)
}

const summaryCards = computed(() => {
  const recs = dailyRecords.value
  const last = lastMonthRecords.value
  if (recs.length === 0) return []
  const totalSteam = sumField(recs, 'total_steam_production')
  const totalElec = sumField(recs, 'total_electricity')
  const totalFuel = sumField(recs, 'fuel_consumed')
  const totalWater = sumField(recs, 'water_usage')
  const totalCost = recs.reduce((s, r) => s + calcDayCost(r), 0)
  const perSteam = totalSteam > 0 ? totalCost / totalSteam : 0
  const days = recs.length

  function cmp(cur, lastRecs, field) {
    if (lastRecs.length === 0) return null
    const lastVal = sumField(lastRecs, field)
    return lastVal > 0 ? +((cur - lastVal) / lastVal * 100).toFixed(1) : null
  }

  const items = [
    { label: '总产汽（吨）', value: totalSteam.toFixed(1), compare: cmp(totalSteam, last, 'total_steam_production') },
    { label: '总用电（度）', value: totalElec.toLocaleString(), compare: cmp(totalElec, last, 'total_electricity') },
    { label: '总燃料（吨）', value: totalFuel.toFixed(1), compare: cmp(totalFuel, last, 'fuel_consumed') },
    { label: '总用水（吨）', value: totalWater.toLocaleString(), compare: cmp(totalWater, last, 'water_usage') },
    { label: '日均产汽', value: (totalSteam / days).toFixed(1) + ' 吨', compare: null },
  ]
  if (hasPrices.value) {
    items.push({ label: '月度总成本', value: '¥' + totalCost.toLocaleString(), compare: null })
  }
  return items
})

const customerSummary = computed(() => {
  const map = {}
  dailyRecords.value.forEach(r => {
    (r.customers || []).forEach(c => {
      if (!map[c.name]) map[c.name] = { name: c.name, totalSteam: 0, days: 0 }
      map[c.name].totalSteam += c.steam_usage || 0
      map[c.name].days++
    })
  })
  const p = prices.value
  const steamPrice = hasPrices.value ? calcSteamPrice() : 0
  return Object.values(map).map(m => ({
    ...m,
    dailyAvg: m.days > 0 ? m.totalSteam / m.days : 0,
    cost: Math.round(m.totalSteam * steamPrice),
  }))
})

function calcSteamPrice() {
  const recs = dailyRecords.value
  const totalCost = recs.reduce((s, r) => s + calcDayCost(r), 0)
  const totalSteam = sumField(recs, 'total_steam_production')
  return totalSteam > 0 ? totalCost / totalSteam : 0
}

const boilerSummary = computed(() => {
  const map = {}
  dailyRecords.value.forEach(r => {
    (r.boilers || []).forEach(b => {
      if (!map[b.name]) map[b.name] = { name: b.name, totalElec: 0, totalSteam: 0, days: 0 }
      map[b.name].totalElec += b.electricity || 0
      map[b.name].totalSteam += b.steam_production || 0
      map[b.name].days++
    })
  })
  const p = prices.value
  return Object.values(map).map(m => ({ ...m, elecCost: Math.round(m.totalElec * (p.electricity || 0)) }))
})

async function loadData() {
  loading.value = true
  try {
    const factoryId = appStore.currentFactoryId || undefined
    const month = selectedMonth.value
    const lastMonth = dayjs(month + '-01').subtract(1, 'month').format('YYYY-MM')

    const [recRes, lastRes, cfgRes] = await Promise.all([
      api.boilerListRecords({ page: 1, pageSize: 50, factoryId, month }),
      api.boilerListRecords({ page: 1, pageSize: 50, factoryId, month: lastMonth }),
      api.boilerGetConfig(factoryId || ''),
    ])

    if (recRes.ok) dailyRecords.value = recRes.data.list || []
    if (lastRes.ok) lastMonthRecords.value = lastRes.data.list || []
    if (cfgRes.ok && cfgRes.data?.prices) prices.value = cfgRes.data.prices

    await nextTick()
    renderTrendChart()
  } finally { loading.value = false }
}

function renderTrendChart() {
  if (!trendChartRef.value) return
  if (!trendChart) trendChart = echarts.init(trendChartRef.value)

  const recs = [...dailyRecords.value].sort((a, b) => a.record_date.localeCompare(b.record_date))
  const dates = recs.map(r => r.record_date.slice(5))
  const steamData = recs.map(r => r.total_steam_production || 0)
  const costData = hasPrices.value ? recs.map(r => calcDayCost(r)) : []

  const series = [
    { name: '产汽量(吨)', type: 'bar', data: steamData, itemStyle: { color: '#409EFF', borderRadius: [4, 4, 0, 0] }, yAxisIndex: 0 },
  ]
  const yAxis = [{ type: 'value', name: '产汽(吨)', splitLine: { lineStyle: { type: 'dashed' } } }]

  if (costData.length > 0) {
    series.push({ name: '总成本(元)', type: 'line', data: costData, smooth: true, itemStyle: { color: '#E65100' }, yAxisIndex: 1 })
    yAxis.push({ type: 'value', name: '成本(元)', splitLine: { show: false } })
  }

  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { top: 40, bottom: 24, left: 60, right: costData.length > 0 ? 60 : 20 },
    xAxis: { type: 'category', data: dates },
    yAxis,
    series,
  }, true)
}

function exportExcel() {
  const recs = [...dailyRecords.value].sort((a, b) => a.record_date.localeCompare(b.record_date))
  const wb = XLSX.utils.book_new()

  const summaryRows = [{
    '月份': selectedMonth.value,
    '总产汽(吨)': sumField(recs, 'total_steam_production'),
    '总用电(度)': sumField(recs, 'total_electricity'),
    '总燃料(吨)': sumField(recs, 'fuel_consumed'),
    '总用水(吨)': sumField(recs, 'water_usage'),
    '总成本(元)': hasPrices.value ? recs.reduce((s, r) => s + calcDayCost(r), 0) : '',
    '运行天数': recs.length,
  }]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), '月度汇总')

  const dayRows = recs.map(r => {
    const obj = { '日期': r.record_date, '产汽(吨)': r.total_steam_production, '用电(度)': r.total_electricity, '燃料(吨)': r.fuel_consumed, '用水(吨)': r.water_usage, '进柴(吨)': r.fuel_intake || '' }
    if (hasPrices.value) { obj['总成本(元)'] = calcDayCost(r); obj['吨汽成本(元)'] = calcPerSteam(r) }
    ;(r.boilers || []).forEach(b => { obj[b.name + ' 用电(度)'] = b.electricity; obj[b.name + ' 产汽(吨)'] = b.steam_production })
    ;(r.customers || []).forEach(c => { obj[c.name + ' 用汽(吨)'] = c.steam_usage })
    return obj
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dayRows), '每日明细')

  const custRows = customerSummary.value.map(c => ({
    '客户': c.name, '累计用汽(吨)': c.totalSteam, '日均用汽(吨)': +c.dailyAvg.toFixed(1), '运行天数': c.days,
    ...(hasPrices.value ? { '费用(元)': c.cost } : {}),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custRows), '客户用汽汇总')

  XLSX.writeFile(wb, `锅炉月报_${selectedMonth.value}.xlsx`)
  ElMessage.success('导出成功')
}

watch(() => appStore.currentFactoryId, () => loadData())
onMounted(() => loadData())
onBeforeUnmount(() => { trendChart?.dispose() })
</script>

<style lang="scss" scoped>
.boiler-monthly {
  .header-actions { display: flex; gap: 10px; align-items: center; }

  .summary-row { margin-bottom: 16px; }
  .summary-card {
    background: #fff; border: 1px solid #ebeef5; border-radius: 10px;
    padding: 16px; text-align: center; margin-bottom: 12px;
    .sc-label { font-size: 12px; color: #909399; margin-bottom: 6px; }
    .sc-value { font-size: 22px; font-weight: 700; color: #303133; }
    .sc-compare { font-size: 12px; margin-top: 4px;
      &.red { color: #F56C6C; }
      &.green { color: #67C23A; }
    }
  }

  .section-card { border-radius: 12px; margin-bottom: 16px; }
  .card-title { font-weight: 600; font-size: 15px; }
  .chart-box { height: 280px; }
}
</style>
