<template>
  <div class="page-container boiler-dashboard">
    <div class="page-header">
      <h2>数据看板</h2>
      <div class="header-actions">
        <BoilerParkSelect @change="loadData" />
        <el-date-picker v-model="selectedDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" :clearable="false" style="width: 160px" @change="loadData" />
        <el-button type="primary" @click="entryRef?.open()">
          <el-icon><Edit /></el-icon>录入数据
        </el-button>
      </div>
    </div>

    <div v-loading="loading">
      <el-alert v-if="overview.noRecordForDate && overview.recordDate" type="info" :closable="false" show-icon class="mb-16">
        当前日期暂无记录，以下显示为最近一条（{{ overview.recordDate }}）的数据
      </el-alert>

      <!-- 第一行：核心 KPI -->
      <el-row :gutter="16" class="kpi-row">
        <el-col :xs="12" :sm="5">
          <div class="kpi-card kpi-highlight" :class="{ 'kpi-over-target': costOverTarget }">
            <div class="kpi-value">{{ cost ? '¥' + cost.perSteam : '--' }}</div>
            <div class="kpi-label">吨汽成本</div>
            <div class="kpi-target" v-if="kpiTargets.costPerSteam">
              目标 ¥{{ kpiTargets.costPerSteam }}
              <span v-if="cost" :class="costOverTarget ? 'target-over' : 'target-ok'">
                {{ costOverTarget ? '超标' : '达标' }}
              </span>
            </div>
            <div class="kpi-deviation" v-if="s?.cost_deviation != null">
              <span :class="Math.abs(s.cost_deviation) > (alertThresholds.costDeviationPct || 15) ? 'chg-warn' : 'chg-ok'">
                vs 7日 {{ s.cost_deviation > 0 ? '+' : '' }}{{ s.cost_deviation }}%
              </span>
            </div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="5">
          <div class="kpi-card kpi-cost">
            <div class="kpi-value">{{ cost ? '¥' + cost.total.toLocaleString() : '--' }}</div>
            <div class="kpi-label">当日总成本</div>
            <div class="kpi-detail" v-if="cost">
              <span>燃料 ¥{{ cost.fuelCost.toLocaleString() }}</span>
              <span>电 ¥{{ cost.elecCost.toLocaleString() }}</span>
              <span>水 ¥{{ cost.waterCost.toLocaleString() }}</span>
              <span v-if="cost.laborCost > 0">人工 ¥{{ cost.laborCost }}</span>
            </div>
          </div>
        </el-col>
        <el-col :xs="8" :sm="5">
          <div class="kpi-card">
            <div class="kpi-value">{{ s?.total_steam_production ?? '--' }} <span class="kpi-unit">吨</span></div>
            <div class="kpi-label">总产汽量</div>
            <div class="kpi-sub" v-if="avgSummary?.total_steam_production != null">
              7日均值 {{ fmtAvg(avgSummary.total_steam_production) }}
            </div>
          </div>
        </el-col>
        <el-col :xs="8" :sm="5">
          <div class="kpi-card" :class="{ 'kpi-good': s?.steam_fuel_ratio > 0 && !sfRatioUnderTarget }">
            <div class="kpi-value">{{ s?.steam_fuel_ratio ?? '--' }}</div>
            <div class="kpi-label">汽柴比</div>
            <div class="kpi-target" v-if="kpiTargets.steamFuelRatio">
              目标 {{ kpiTargets.steamFuelRatio }}
              <span :class="sfRatioUnderTarget ? 'target-over' : 'target-ok'">
                {{ sfRatioUnderTarget ? '偏低' : '达标' }}
              </span>
            </div>
          </div>
        </el-col>
        <el-col :xs="8" :sm="4">
          <div class="kpi-card" :class="{ 'kpi-warn': s?.steam_loss_rate > 5 }">
            <div class="kpi-value">{{ s?.steam_loss_rate ?? '--' }}<span class="kpi-unit" v-if="s?.steam_loss_rate != null">%</span></div>
            <div class="kpi-label">损耗率</div>
          </div>
        </el-col>
      </el-row>

      <!-- 第二行：资源消耗 -->
      <el-row :gutter="16" class="stat-row">
        <el-col :xs="12" :sm="6" v-for="card in resourceCards" :key="card.key">
          <div class="stat-card">
            <div class="stat-icon" :style="{ background: card.bg, color: card.color }">
              <el-icon :size="20"><component :is="card.icon" /></el-icon>
            </div>
            <div class="stat-value">{{ card.value }}</div>
            <div class="stat-label">{{ card.label }}</div>
            <div class="stat-sub" v-if="card.avg != null">均值 {{ card.avg }}</div>
          </div>
        </el-col>
      </el-row>

      <!-- 第三行：锅炉明细 + 客户用汽 -->
      <el-row :gutter="16" class="detail-row">
        <el-col :xs="24" :md="12">
          <el-card shadow="never" class="detail-card">
            <template #header><span class="card-title">锅炉运行明细</span></template>
            <el-table :data="overview.boilers || []" stripe size="default">
              <el-table-column prop="name" label="锅炉" width="100" />
              <el-table-column label="用电（度）" align="right">
                <template #default="{ row }">
                  <span>{{ row.electricity?.toLocaleString() ?? '--' }}</span>
                  <span v-if="boilerElecAvg(row.name)" class="inline-avg">均{{ boilerElecAvg(row.name) }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="steam_production" label="产汽（吨）" align="right">
                <template #default="{ row }">{{ row.steam_production ?? '--' }}</template>
              </el-table-column>
            </el-table>
            <div class="detail-footer" v-if="s">
              <span>合计产汽 <b>{{ s.total_steam_production }} 吨</b></span>
              <span>合计用电 <b>{{ s.total_electricity?.toLocaleString() }} 度</b></span>
            </div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-card shadow="never" class="detail-card">
            <template #header><span class="card-title">客户用汽明细</span></template>
            <el-table :data="overview.customers || []" stripe size="default">
              <el-table-column prop="name" label="客户" width="100" />
              <el-table-column label="用汽（吨）" align="right">
                <template #default="{ row }">{{ row.steam_usage ?? '--' }}</template>
              </el-table-column>
            </el-table>
            <div class="detail-footer" v-if="s">
              <span>合计用汽 <b>{{ s.total_steam_usage }} 吨</b></span>
              <span v-if="s.steam_loss_rate != null">损耗率 <b :class="{ 'text-danger': s.steam_loss_rate > 5 }">{{ s.steam_loss_rate }}%</b></span>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 第四行：燃料库存 -->
      <el-row :gutter="16" class="stock-row">
        <el-col :xs="24" :md="8">
          <div class="stock-card" :class="{ 'stock-danger': s?.fuel_stock_days < (alertThresholds.fuelStockDaysThreshold || 3) }">
            <div class="stock-icon">
              <el-icon :size="24" :color="s?.fuel_stock_days < (alertThresholds.fuelStockDaysThreshold || 3) ? '#F56C6C' : '#1ABC9C'"><Warning /></el-icon>
            </div>
            <div class="stock-info">
              <div class="stock-val">{{ s?.fuel_stock_estimate ?? '--' }} 吨</div>
              <div class="stock-lbl">燃料库存</div>
            </div>
            <div class="stock-days" :class="{ 'text-danger': s?.fuel_stock_days < (alertThresholds.fuelStockDaysThreshold || 3) }">
              {{ s?.fuel_stock_days ?? '--' }} <span class="stock-unit">天</span>
            </div>
          </div>
        </el-col>
        <el-col :xs="12" :md="8">
          <div class="stock-card">
            <div class="stock-info" style="flex:1">
              <div class="stock-val">{{ s?.fuel_consumed ?? '--' }} 吨</div>
              <div class="stock-lbl">当日燃料消耗</div>
              <div class="stock-sub" v-if="s?.fuel_avg_price">结算均价 ¥{{ s.fuel_avg_price }}/吨</div>
            </div>
          </div>
        </el-col>
        <el-col :xs="12" :md="8">
          <div class="stock-card">
            <div class="stock-info" style="flex:1">
              <div class="stock-val">{{ s?.fuel_intake || '无' }}{{ s?.fuel_intake ? ' 吨' : '' }}</div>
              <div class="stock-lbl">当日进柴</div>
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- 第五行：趋势图 -->
      <el-card shadow="never" class="chart-card">
        <template #header>
          <div class="chart-header">
            <span class="card-title">近7天趋势</span>
            <el-radio-group v-model="chartMetric" size="small" @change="renderChart">
              <el-radio-button value="steam">产汽量</el-radio-button>
              <el-radio-button value="cost">吨汽成本</el-radio-button>
              <el-radio-button value="ratio">汽柴比</el-radio-button>
            </el-radio-group>
          </div>
        </template>
        <div ref="chartRef" class="chart-box"></div>
      </el-card>
    </div>

    <BoilerEntryDialog ref="entryRef" @submitted="loadData" />
  </div>
</template>

<script setup>
import BoilerParkSelect from '@/components/BoilerParkSelect.vue'
import BoilerEntryDialog from '@/components/BoilerEntryDialog.vue'
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { api } from '@/utils/api'
import echarts from '@/utils/echarts'
import dayjs from 'dayjs'
import { Edit, Odometer, Coin, DataLine, Timer, Warning } from '@element-plus/icons-vue'

const appStore = useAppStore()
const loading = ref(false)
const overview = ref({})
const recentRecords = ref([])
const prices = ref({ fuel: 0, electricity: 0, water: 0, laborMonthly: 0 })
const kpiTargets = ref({})
const alertThresholds = ref({})
const selectedDate = ref(dayjs().format('YYYY-MM-DD'))
const chartRef = ref(null)
const entryRef = ref(null)
const chartMetric = ref('steam')
let chartInstance = null

const s = computed(() => overview.value.summary)

const cost = computed(() => {
  const sum = s.value
  if (!sum) return null
  if (sum.total_cost != null && sum.total_cost > 0) {
    return {
      fuelCost: Math.round(sum.fuel_cost || 0),
      elecCost: Math.round(sum.electricity_cost || 0),
      waterCost: Math.round(sum.water_cost || 0),
      laborCost: Math.round(sum.labor_cost || 0),
      total: Math.round(sum.total_cost),
      perSteam: +(sum.cost_per_steam || 0).toFixed(1),
    }
  }
  const p = prices.value
  if (!p.fuel && !p.electricity && !p.water) return null
  const fuelCost = (sum.fuel_consumed || 0) * (p.fuel || 0)
  const elecCost = (sum.total_electricity || 0) * (p.electricity || 0)
  const waterCost = (sum.water_usage || 0) * (p.water || 0)
  const total = fuelCost + elecCost + waterCost
  const perSteam = sum.total_steam_production > 0 ? total / sum.total_steam_production : 0
  return { fuelCost: Math.round(fuelCost), elecCost: Math.round(elecCost), waterCost: Math.round(waterCost), laborCost: 0, total: Math.round(total), perSteam: +perSteam.toFixed(1) }
})

const costOverTarget = computed(() => {
  if (!kpiTargets.value.costPerSteam || !cost.value) return false
  return cost.value.perSteam > kpiTargets.value.costPerSteam
})

const sfRatioUnderTarget = computed(() => {
  if (!kpiTargets.value.steamFuelRatio || !s.value?.steam_fuel_ratio) return false
  return s.value.steam_fuel_ratio < kpiTargets.value.steamFuelRatio
})

function avg(arr) {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

const avgSummary = computed(() => {
  const recs = recentRecords.value
  if (!recs.length) return null
  return {
    total_steam_production: avg(recs.map(r => r.total_steam_production).filter(v => v != null)),
    total_electricity: avg(recs.map(r => r.total_electricity).filter(v => v != null)),
    fuel_consumed: avg(recs.map(r => r.fuel_consumed).filter(v => v != null)),
    water_usage: avg(recs.map(r => r.water_usage).filter(v => v != null)),
  }
})

function fmtAvg(val) {
  if (val == null) return null
  return val >= 100 ? Math.round(val).toLocaleString() : +val.toFixed(1)
}

function boilerElecAvg(name) {
  const vals = recentRecords.value.map(r => r.boilers?.find(b => b.name === name)?.electricity).filter(v => v != null)
  return vals.length ? fmtAvg(avg(vals)) : null
}

const resourceCards = computed(() => {
  const sum = s.value; const a = avgSummary.value
  return [
    { key: 'elec', icon: Odometer, bg: '#fdf6ec', color: '#E6A23C', value: sum?.total_electricity?.toLocaleString() ?? '--', label: '总用电量（度）', avg: fmtAvg(a?.total_electricity) },
    { key: 'fuel', icon: Coin, bg: '#fef0f0', color: '#F56C6C', value: sum?.fuel_consumed ?? '--', label: '当日燃料（吨）', avg: fmtAvg(a?.fuel_consumed) },
    { key: 'water', icon: DataLine, bg: '#f0f9eb', color: '#67C23A', value: sum?.water_usage ?? '--', label: '当日用水（吨）', avg: fmtAvg(a?.water_usage) },
    { key: 'intake', icon: Timer, bg: '#f4ecff', color: '#9B59B6', value: sum?.fuel_intake || '无', label: '当日进柴（吨）', avg: null },
  ]
})

async function loadData() {
  loading.value = true
  try {
    const factoryId = appStore.currentFactoryId || undefined
    const endDate = selectedDate.value
    const startDate = dayjs(endDate).subtract(6, 'day').format('YYYY-MM-DD')
    const [ovRes, recRes, trendRes, cfgRes] = await Promise.all([
      api.boilerGetOverview({ date: selectedDate.value, factoryId }),
      api.boilerListRecords({ page: 1, pageSize: 8, factoryId }),
      api.boilerGetTrend({ metric: 'total_steam_production', factoryId, startDate, endDate }),
      api.boilerGetConfig(factoryId || ''),
    ])
    if (ovRes.ok) overview.value = ovRes.data || {}
    if (recRes.ok) {
      const allRecs = recRes.data?.list || []
      recentRecords.value = allRecs.filter(r => r.record_date !== selectedDate.value).slice(0, 7)
    }
    if (cfgRes.ok && cfgRes.data) {
      prices.value = cfgRes.data.prices || {}
      kpiTargets.value = cfgRes.data.kpiTargets || {}
      alertThresholds.value = cfgRes.data.alerts || {}
    }
    if (trendRes.ok && Array.isArray(trendRes.data) && trendRes.data.length) {
      trendChartData.value = trendRes.data
      await nextTick(); renderChart()
    } else { trendChartData.value = []; await nextTick(); renderChart() }
  } finally { loading.value = false }
}

const trendChartData = ref([])

function renderChart() {
  if (!chartRef.value) return
  if (!chartInstance) chartInstance = echarts.init(chartRef.value)
  const data = trendChartData.value
  if (!data.length) { chartInstance.clear(); return }

  const metricMap = {
    steam: { field: 'total_steam_production', name: '产汽量', unit: '吨', color: '#409EFF' },
    cost: { field: 'cost_per_steam', name: '吨汽成本', unit: '元/吨', color: '#E65100' },
    ratio: { field: 'steam_fuel_ratio', name: '汽柴比', unit: '', color: '#1ABC9C' },
  }
  const m = metricMap[chartMetric.value] || metricMap.steam
  const dates = data.map(d => (d.date || d.record_date || '').slice(5))
  const values = data.map(d => d[m.field] != null ? d[m.field] : (d.value != null ? d.value : 0))
  const avgVal = values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : 0

  const markLineData = [
    { yAxis: avgVal, label: { formatter: '均值 {c}', position: 'insideEndTop', fontSize: 11 }, lineStyle: { color: '#909399', type: 'dashed', width: 1 } }
  ]
  if (chartMetric.value === 'cost' && kpiTargets.value.costPerSteam) {
    markLineData.push({
      yAxis: kpiTargets.value.costPerSteam,
      label: { formatter: '目标 {c}', position: 'insideStartTop', fontSize: 11 },
      lineStyle: { color: '#F56C6C', type: 'solid', width: 2 },
    })
  }
  if (chartMetric.value === 'ratio' && kpiTargets.value.steamFuelRatio) {
    markLineData.push({
      yAxis: kpiTargets.value.steamFuelRatio,
      label: { formatter: '目标 {c}', position: 'insideStartTop', fontSize: 11 },
      lineStyle: { color: '#67C23A', type: 'solid', width: 2 },
    })
  }

  chartInstance.setOption({
    tooltip: { trigger: 'axis', formatter(params) {
      const p = params[0]; return p.name + '<br/>' + m.name + '：' + p.value + ' ' + m.unit
    }},
    grid: { left: 60, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: dates },
    yAxis: { type: 'value', name: m.unit },
    series: [{ type: 'line', data: values, smooth: true,
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: m.color + '40' }, { offset: 1, color: m.color + '05' }
      ]) },
      lineStyle: { color: m.color, width: 2 }, itemStyle: { color: m.color },
      markLine: { silent: true, data: markLineData },
    }],
  }, true)
}

watch(() => appStore.currentFactoryId, () => loadData())
function onResize() { chartInstance?.resize() }
onMounted(() => { loadData(); window.addEventListener('resize', onResize) })
onBeforeUnmount(() => { window.removeEventListener('resize', onResize); chartInstance?.dispose() })
</script>

<style lang="scss" scoped>
.boiler-dashboard {
  .mb-16 { margin-bottom: 16px; }
  .header-actions { display: flex; gap: 12px; align-items: center; }

  .kpi-row { margin-bottom: 16px; .el-col { margin-bottom: 12px; } }
  .kpi-card {
    background: #fff; border-radius: 14px; padding: 20px 16px; text-align: center;
    box-shadow: 0 1px 4px rgba(0,0,0,.06); min-height: 120px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .kpi-highlight {
    background: linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%);
    border: 2px solid #FFB74D;
    .kpi-value { color: #E65100; font-size: 32px; }
    .kpi-label { color: #BF360C; font-weight: 600; }
  }
  .kpi-over-target {
    border-color: #F56C6C !important;
    background: linear-gradient(135deg, #fef0f0 0%, #fde2e2 100%) !important;
    .kpi-value { color: #F56C6C !important; }
  }
  .kpi-cost {
    background: linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%);
    border: 2px solid #64B5F6;
    .kpi-value { color: #1565C0; font-size: 24px; }
    .kpi-label { color: #0D47A1; }
  }
  .kpi-good { border: 2px solid #67C23A; background: #f0f9eb; }
  .kpi-warn { border: 2px solid #F56C6C; background: #fef0f0; }
  .kpi-value { font-size: 24px; font-weight: 700; color: #303133; line-height: 1.2; }
  .kpi-unit { font-size: 14px; font-weight: 400; color: #909399; }
  .kpi-label { font-size: 13px; color: #606266; margin-top: 4px; font-weight: 500; }
  .kpi-target { font-size: 11px; color: #909399; margin-top: 4px; }
  .kpi-deviation { font-size: 11px; margin-top: 2px; }
  .kpi-detail { font-size: 11px; color: #1565C0; margin-top: 4px; display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
  .kpi-sub { font-size: 12px; color: #909399; margin-top: 4px; }
  .target-over { color: #F56C6C; font-weight: 600; }
  .target-ok { color: #67C23A; font-weight: 600; }

  .stat-row { margin-bottom: 16px; .el-col { margin-bottom: 12px; } }
  .stat-card {
    background: #fff; border-radius: 12px; padding: 16px; text-align: center;
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
  }
  .stat-icon { width: 40px; height: 40px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 8px; }
  .stat-value { font-size: 22px; font-weight: 700; color: #303133; }
  .stat-label { font-size: 13px; color: #909399; margin-top: 2px; }
  .stat-sub { font-size: 11px; color: #b0b4bb; margin-top: 4px; }

  .chg-warn { color: #F56C6C; font-weight: 600; }
  .chg-ok { color: #67C23A; }

  .detail-row { margin-bottom: 16px; .el-col { margin-bottom: 12px; } }
  .detail-card { border-radius: 12px; }
  .card-title { font-weight: 600; font-size: 15px; }
  .detail-footer {
    display: flex; justify-content: space-between; padding: 12px 4px 0; font-size: 14px; color: #606266;
    b { color: #303133; }
  }
  .inline-avg { font-size: 11px; color: #b0b4bb; margin-left: 4px; }

  .stock-row { margin-bottom: 16px; .el-col { margin-bottom: 12px; } }
  .stock-card {
    background: #fff; border-radius: 12px; padding: 16px 20px;
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
    display: flex; align-items: center; gap: 16px; min-height: 72px;
    &.stock-danger { border-left: 4px solid #F56C6C; }
  }
  .stock-info { flex: 1; }
  .stock-val { font-size: 18px; font-weight: 700; color: #303133; }
  .stock-lbl { font-size: 13px; color: #909399; margin-top: 2px; }
  .stock-sub { font-size: 11px; color: #b0b4bb; margin-top: 2px; }
  .stock-days { font-size: 32px; font-weight: 700; color: #1ABC9C; text-align: right; }
  .stock-unit { font-size: 14px; font-weight: 400; color: #909399; }
  .text-danger { color: #F56C6C !important; }

  .chart-card { border-radius: 12px; }
  .chart-header { display: flex; justify-content: space-between; align-items: center; }
  .chart-box { height: 280px; }
}
</style>
