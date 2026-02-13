<template>
  <div class="page-container ai-report">
    <div class="page-header">
      <h2>AI 数据分析报告</h2>
      <div class="header-actions">
        <!-- 管理员：选范围 -->
        <el-select v-if="isAdmin" v-model="reportScope" placeholder="范围" style="width: 130px;" @change="onScopeChange">
          <el-option label="单工厂" value="factory" />
          <el-option label="全部汇总" value="summary" />
        </el-select>
        <el-select
          v-if="isAdmin && reportScope === 'factory'"
          v-model="selectedFactoryId"
          placeholder="选择工厂"
          clearable
          style="width: 160px; margin-left: 8px;"
        >
          <el-option v-for="f in factoryOptions" :key="f.factoryId" :label="f.factoryName" :value="f.factoryId" />
        </el-select>
        <!-- 主管：显示当前工厂 -->
        <template v-if="!isAdmin && currentFactoryId">
          <el-tag type="info" style="margin-left: 8px;">{{ currentFactoryName }}</el-tag>
        </template>
        <el-date-picker
          v-model="selectedMonth"
          type="month"
          placeholder="选择月份"
          format="YYYY年MM月"
          value-format="YYYY-MM"
          style="width: 150px; margin-left: 12px;"
        />
        <el-button type="primary" :loading="loading" @click="loadReport" style="margin-left: 12px;">
          生成报告
        </el-button>
      </div>
    </div>

    <template v-if="report">
      <!-- 1. 总览数字卡 -->
      <el-row :gutter="16" class="stat-row">
        <el-col :span="4"><div class="stat-card"><div class="stat-value">{{ report.stats.totalLogs }}</div><div class="stat-label">更换次数</div></div></el-col>
        <el-col :span="4"><div class="stat-card"><div class="stat-value">{{ report.stats.totalPartsQty }}</div><div class="stat-label">配件消耗</div></div></el-col>
        <el-col :span="4">
          <div class="stat-card" :class="{ 'stat-danger': report.stats.openAlerts > 0 }">
            <div class="stat-value">{{ report.stats.openAlerts }}</div><div class="stat-label">待处理报警</div>
          </div>
        </el-col>
        <el-col :span="4"><div class="stat-card"><div class="stat-value">¥{{ (report.stats.totalUsageCost || 0).toLocaleString() }}</div><div class="stat-label">使用成本</div></div></el-col>
        <el-col :span="4">
          <div class="stat-card" :class="{ 'stat-warn': report.stats.lowStockCount > 0 }">
            <div class="stat-value">{{ report.stats.lowStockCount || 0 }}</div><div class="stat-label">低库存预警</div>
          </div>
        </el-col>
        <el-col :span="4"><div class="stat-card"><div class="stat-value">{{ report.stats.engineerWorkload?.length || 0 }}</div><div class="stat-label">活跃工程师</div></div></el-col>
      </el-row>

      <!-- 2. 历史环比对比卡 -->
      <el-card class="history-card" shadow="never">
        <template #header>
          <div class="card-header-flex">
            <span>历史对比与趋势</span>
            <el-tag v-if="report.history" :type="report.history.logsPct > 20 ? 'danger' : report.history.logsPct < -20 ? 'success' : 'info'" size="small">
              更换 {{ report.history.logsPct >= 0 ? '+' : '' }}{{ report.history.logsPct }}%
            </el-tag>
          </div>
        </template>
        <el-row :gutter="16">
          <el-col :span="12">
            <div ref="chartHistoryRef" class="chart-box"></div>
          </el-col>
          <el-col :span="12">
            <ul class="section-list">
              <li v-for="(item, i) in historySection?.items" :key="i">{{ item.text }}</li>
            </ul>
          </el-col>
        </el-row>
      </el-card>

      <!-- 3. AI 文字摘要 -->
      <el-card class="summary-card" shadow="never">
        <template #header>
          <div class="card-header-flex">
            <span>{{ report.factoryLabel }} · {{ selectedMonth }} 报告摘要</span>
          </div>
        </template>
        <p class="summary-text">{{ report.summaryText }}</p>
      </el-card>

      <!-- 4-8. 各维度分析卡片 -->
      <el-row :gutter="16" class="sections-row">
        <el-col v-for="sec in otherSections" :key="sec.title" :span="12">
          <el-card shadow="never" class="section-card">
            <template #header>{{ sec.title }}</template>
            <ul class="section-list">
              <li v-for="(item, i) in sec.items" :key="i">{{ item.text }}</li>
            </ul>
          </el-card>
        </el-col>
      </el-row>

      <!-- 可视化：配件 TOP5 + 设备 TOP5 -->
      <el-row :gutter="16" class="chart-row">
        <el-col :span="12">
          <el-card shadow="never">
            <template #header>配件消耗 TOP 5</template>
            <div ref="chartPartsRef" class="chart-box"></div>
            <el-empty v-if="!report.stats.topParts?.length" description="暂无数据" :image-size="60" />
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="never">
            <template #header>设备更换 TOP 5</template>
            <div ref="chartAssetsRef" class="chart-box"></div>
            <el-empty v-if="!report.stats.topAssets?.length" description="暂无数据" :image-size="60" />
          </el-card>
        </el-col>
      </el-row>

      <!-- Admin 汇总：各工厂对比表 -->
      <el-card v-if="report.byFactory?.length" shadow="never" class="by-factory-card">
        <template #header>各工厂横向对比</template>
        <el-table :data="report.byFactory" stripe size="small">
          <el-table-column prop="factoryName" label="工厂" width="140" />
          <el-table-column prop="totalLogs" label="更换次数" width="100" />
          <el-table-column prop="totalPartsQty" label="配件消耗" width="100" />
          <el-table-column label="OPEN 报警" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.openAlerts > 0" type="danger" size="small">{{ row.openAlerts }}</el-tag>
              <span v-else>0</span>
            </template>
          </el-table-column>
          <el-table-column label="使用成本" width="120">
            <template #default="{ row }">¥{{ (row.totalUsageCost || 0).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="低库存" width="80">
            <template #default="{ row }">
              <el-tag v-if="row.lowStockCount > 0" type="warning" size="small">{{ row.lowStockCount }}</el-tag>
              <span v-else>0</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>

    <el-empty v-else-if="!loading" description="选择月份与范围后点击「生成报告」" :image-size="100" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/utils/api'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'

const authStore = useAuthStore()
const isAdmin = computed(() => authStore.user?.role === 'Admin')
const currentFactoryId = computed(() => authStore.user?.role === 'Supervisor' ? authStore.user?.factoryId : null)

const loading = ref(false)
const selectedMonth = ref(new Date().toISOString().slice(0, 7))
const reportScope = ref('factory')
const selectedFactoryId = ref('')
const factoryOptions = ref([])
const report = ref(null)

const chartPartsRef = ref()
const chartAssetsRef = ref()
const chartHistoryRef = ref()
let chartParts = null
let chartAssets = null
let chartHistory = null

// 当前工厂名称（主管显示用）
const currentFactoryName = computed(() => {
  if (!currentFactoryId.value) return ''
  const f = factoryOptions.value.find(x => x.factoryId === currentFactoryId.value)
  return f ? f.factoryName : currentFactoryId.value
})

// 历史对比维度的 section
const historySection = computed(() => report.value?.sections?.find(s => s.title === '历史对比与趋势'))

// 排除历史对比的其余维度
const otherSections = computed(() => report.value?.sections?.filter(s => s.title !== '历史对比与趋势') || [])

async function loadFactoryOptions() {
  const res = await api.listFactories()
  if (res.ok && res.data?.list) factoryOptions.value = res.data.list
}

function onScopeChange() {
  report.value = null
}

async function loadReport() {
  const fid = isAdmin.value
    ? (reportScope.value === 'factory' ? selectedFactoryId.value : undefined)
    : currentFactoryId.value

  if (reportScope.value === 'factory' && !fid && isAdmin.value) {
    ElMessage.warning('请先选择工厂')
    return
  }
  loading.value = true
  report.value = null
  try {
    const res = await api.getAIReport({
      yearMonth: selectedMonth.value,
      factoryId: reportScope.value === 'summary' ? undefined : fid,
      scope: isAdmin.value ? reportScope.value : 'factory',
    })
    if (res.ok && res.data) {
      report.value = res.data
      await nextTick()
      renderCharts()
    } else {
      ElMessage.error(res.error?.message || '生成报告失败')
    }
  } finally {
    loading.value = false
  }
}

function renderCharts() {
  if (!report.value?.stats) return
  const stats = report.value.stats
  const prev = report.value.prevStats

  // 历史环比柱状图
  if (chartHistoryRef.value && prev) {
    if (!chartHistory) chartHistory = echarts.init(chartHistoryRef.value)
    const cats = ['更换次数', '配件消耗', 'OPEN报警', '使用成本(百元)']
    chartHistory.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['上月', '本月'], top: 4 },
      grid: { left: 40, right: 20, top: 34, bottom: 30 },
      xAxis: { type: 'category', data: cats },
      yAxis: { type: 'value' },
      series: [
        {
          name: '上月', type: 'bar', barGap: '10%',
          data: [prev.totalLogs, prev.totalPartsQty, prev.openAlerts, Math.round((prev.totalUsageCost || 0) / 100)],
          itemStyle: { color: '#C0C4CC', borderRadius: [4, 4, 0, 0] },
        },
        {
          name: '本月', type: 'bar',
          data: [stats.totalLogs, stats.totalPartsQty, stats.openAlerts, Math.round((stats.totalUsageCost || 0) / 100)],
          itemStyle: { color: '#409EFF', borderRadius: [4, 4, 0, 0] },
        },
      ],
    }, true)
  }

  // 配件 TOP 5
  if (chartPartsRef.value && stats.topParts?.length) {
    if (!chartParts) chartParts = echarts.init(chartPartsRef.value)
    const data = [...stats.topParts].reverse()
    chartParts.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 90, right: 30, top: 10, bottom: 10 },
      xAxis: { type: 'value', show: false },
      yAxis: {
        type: 'category', data: data.map(d => d.partName),
        axisLabel: { fontSize: 12 }, axisTick: { show: false }, axisLine: { show: false },
      },
      series: [{
        type: 'bar', data: data.map(d => d.totalQty), barWidth: 18,
        itemStyle: { borderRadius: [0, 4, 4, 0], color: '#07C160' },
        label: { show: true, position: 'right', fontSize: 12 },
      }],
    }, true)
  }

  // 设备 TOP 5
  if (chartAssetsRef.value && stats.topAssets?.length) {
    if (!chartAssets) chartAssets = echarts.init(chartAssetsRef.value)
    const data = [...stats.topAssets].reverse()
    chartAssets.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 100, right: 30, top: 10, bottom: 10 },
      xAxis: { type: 'value', show: false },
      yAxis: {
        type: 'category', data: data.map(d => d.assetName),
        axisLabel: { fontSize: 12 }, axisTick: { show: false }, axisLine: { show: false },
      },
      series: [{
        type: 'bar', data: data.map(d => d.logCount), barWidth: 18,
        itemStyle: { borderRadius: [0, 4, 4, 0], color: '#409EFF' },
        label: { show: true, position: 'right', formatter: '{c}次', fontSize: 12 },
      }],
    }, true)
  }
}

onMounted(() => {
  loadFactoryOptions()
  if (!isAdmin.value && currentFactoryId.value) loadReport()
})
</script>

<style lang="scss" scoped>
.page-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
  h2 { margin: 0; }
  .header-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    margin-left: auto;
  }
}

.stat-row {
  margin-bottom: 16px;
  .stat-card {
    background: #fff;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
    .stat-value { font-size: 22px; font-weight: 600; color: #303133; }
    .stat-label { font-size: 13px; color: #909399; margin-top: 4px; }
    &.stat-danger .stat-value { color: #F56C6C; }
    &.stat-warn .stat-value { color: #E6A23C; }
  }
}

.history-card {
  margin-bottom: 16px;
  .chart-box { height: 220px; }
}

.card-header-flex {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.summary-card {
  margin-bottom: 16px;
  .summary-text { margin: 0; line-height: 1.7; color: #303133; }
}

.sections-row {
  margin-bottom: 16px;
  .section-card { margin-bottom: 16px; }
  .section-list {
    margin: 0;
    padding-left: 20px;
    color: #606266;
    font-size: 14px;
    line-height: 1.8;
  }
}

.chart-row {
  margin-bottom: 16px;
  .chart-box { height: 220px; }
}

.by-factory-card {
  margin-bottom: 16px;
}
</style>
