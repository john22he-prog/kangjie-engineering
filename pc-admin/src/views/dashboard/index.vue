<template>
  <div class="page-container dashboard">
    <!-- 顶部：标题 + 全局月份选择器 -->
    <div class="page-header">
      <h2>数据看板</h2>
      <el-date-picker
        v-model="selectedMonth"
        type="month"
        placeholder="选择月份"
        format="YYYY年MM月"
        value-format="YYYY-MM"
        :clearable="false"
        @change="refreshAll"
      />
    </div>

    <!-- M1：核心数字卡 -->
    <el-row :gutter="16" class="stat-row">
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon icon-green">
            <el-icon :size="26"><Document /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ stats.totalLogs }}</div>
            <div class="stat-label">本月更换次数</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon icon-blue">
            <el-icon :size="26"><Box /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ stats.totalPartsQty }}</div>
            <div class="stat-label">配件消耗总量</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card clickable" @click="goAlerts">
          <div class="stat-icon icon-red">
            <el-icon :size="26"><Warning /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value stat-danger">{{ stats.openAlerts }}</div>
            <div class="stat-label">待处理报警 <el-icon class="link-icon"><Right /></el-icon></div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon icon-orange">
            <el-icon :size="26"><UserFilled /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ stats.engineerWorkload?.length || 0 }}</div>
            <div class="stat-label">活跃工程师</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- M2 + M3：配件TOP5 + 设备TOP5 -->
    <el-row :gutter="16" class="chart-row">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <span class="card-title">M2 · 配件消耗 TOP 5</span>
            <span class="card-hint">点击柱条查看设备分布</span>
          </template>
          <div ref="chartPartsRef" class="chart-box"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <span class="card-title">M3 · 设备更换 TOP 5</span>
            <span class="card-hint">点击柱条查看配件分布</span>
          </template>
          <div ref="chartAssetsRef" class="chart-box"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- M5 + M4：7天趋势 + 工程师工作量 -->
    <el-row :gutter="16" class="chart-row">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>
            <span class="card-title">M5 · 最近 7 天更换趋势</span>
          </template>
          <div ref="chartTrendRef" class="chart-box"></div>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>
            <span class="card-title">M4 · 工程师工作量</span>
          </template>
          <div ref="chartEngineerRef" class="chart-box"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- M6：报警设备分布 -->
    <el-row :gutter="16" class="chart-row">
      <el-col :span="24">
        <el-card shadow="never">
          <template #header>
            <div class="m6-header">
              <span class="card-title">M6 · 报警设备分布（OPEN）</span>
              <el-button text type="primary" @click="goAlerts">
                查看全部报警 <el-icon><Right /></el-icon>
              </el-button>
            </div>
          </template>
          <div v-if="stats.alertsByAsset?.length" class="alert-asset-list">
            <div
              v-for="item in stats.alertsByAsset"
              :key="item.assetId"
              class="alert-asset-row"
              @click="openAssetAlertDrawer(item.assetId)"
            >
              <div class="alert-asset-left">
                <el-icon class="warn-icon" :size="18"><WarningFilled /></el-icon>
                <div>
                  <div class="alert-asset-name">{{ item.assetName }}</div>
                  <div class="alert-asset-workshop">{{ item.workshop }}</div>
                </div>
              </div>
              <div class="alert-asset-right">
                <el-badge :value="item.openCount" type="danger" />
                <span class="alert-hint">条报警</span>
                <el-icon class="arrow-icon"><ArrowRight /></el-icon>
              </div>
            </div>
          </div>
          <el-empty v-else description="当月无待处理报警" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>

    <!-- M7：库存概览 + 月度金额趋势 + 设备金额TOP10（仅主管及以上可见） -->
    <el-row :gutter="16" class="chart-row" v-if="canViewCost">
      <!-- 库存概览（可点击跳转） -->
      <el-col :span="6">
        <el-card shadow="never">
          <template #header>
            <span class="card-title">库存概览</span>
          </template>
          <div class="inv-summary">
            <div class="inv-item inv-clickable" @click="$router.push('/inventory')">
              <span class="inv-label">库存总价值</span>
              <span class="inv-value">¥{{ inventorySummary.totalInventoryValue?.toLocaleString() || '0' }}</span>
              <el-icon class="inv-arrow"><ArrowRight /></el-icon>
            </div>
            <div class="inv-item inv-clickable" @click="$router.push('/inventory/logs?tab=inbound')">
              <span class="inv-label">当月入库</span>
              <span class="inv-value inv-green">¥{{ inventorySummary.totalInboundValue?.toLocaleString() || '0' }}</span>
              <el-icon class="inv-arrow"><ArrowRight /></el-icon>
            </div>
            <div class="inv-item inv-clickable" @click="$router.push('/inventory/logs?tab=outbound')">
              <span class="inv-label">当月出库（使用）</span>
              <span class="inv-value inv-red">¥{{ inventorySummary.totalOutboundValue?.toLocaleString() || '0' }}</span>
              <el-icon class="inv-arrow"><ArrowRight /></el-icon>
            </div>
            <div class="inv-item inv-clickable" v-if="inventorySummary.lowStockCount" @click="$router.push('/inventory?filter=lowstock')">
              <span class="inv-label">低库存预警</span>
              <span class="inv-value inv-warn">{{ inventorySummary.lowStockCount }} 种</span>
              <el-icon class="inv-arrow"><ArrowRight /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <!-- 月度库存金额趋势（简化：折线图 = 库存总值 / 入库 / 出库） -->
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>
            <span class="card-title">月度库存金额趋势</span>
          </template>
          <div ref="chartCostTrendRef" class="chart-box" style="height: 280px;"></div>
        </el-card>
      </el-col>
      <!-- 月度设备配件使用金额 TOP 10（竖状柱状图） -->
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>
            <div class="m6-header">
              <span class="card-title">设备配件使用金额 TOP 10</span>
              <span class="card-hint">点击柱条查看明细</span>
            </div>
          </template>
          <div ref="chartCostRankingRef" class="chart-box" style="height: 280px;"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 下钻 Drawer: 配件消耗明细 ===== -->
    <el-drawer
      v-model="partDrawerVisible"
      :title="`${partDetail.partName || ''} — 设备消耗分布`"
      size="560px"
      direction="rtl"
    >
      <div class="drill-header">
        <div class="drill-meta">
          <el-tag>{{ partDetail.partCode }}</el-tag>
          <span>{{ partDetail.yearMonth }}</span>
          <span class="drill-total">总消耗: <strong>{{ partDetail.totalQty }}</strong> {{ partDetail.unit }}</span>
        </div>
      </div>
      <div v-for="(row, idx) in partDetail.byAsset" :key="row.assetId" class="drill-row">
        <div class="drill-row-header" @click="row._expanded = !row._expanded">
          <span class="drill-rank" :class="{ top: idx < 3 }">{{ idx + 1 }}</span>
          <div class="drill-info">
            <div class="drill-name">{{ row.assetName }} <span class="drill-sub">{{ row.workshop }}</span></div>
            <div class="drill-bar-wrap">
              <div class="drill-bar" :style="{ width: row.percentage + '%' }"></div>
            </div>
          </div>
          <div class="drill-nums">
            <div class="drill-qty">{{ row.qtySum }} {{ partDetail.unit }}</div>
            <div class="drill-pct">{{ row.percentage }}%</div>
            <el-tag v-if="row.isOverThreshold" type="danger" size="small" effect="dark">超阈值</el-tag>
            <el-tag v-else-if="row.threshold" type="info" size="small">
              阈值 {{ row.threshold }}
            </el-tag>
          </div>
          <el-icon class="expand-icon"><ArrowDown v-if="!row._expanded" /><ArrowUp v-else /></el-icon>
        </div>
        <!-- 二次下钻：更换记录明细 -->
        <el-collapse-transition>
          <div v-if="row._expanded && row.logs?.length" class="drill-logs">
            <div v-for="log in row.logs" :key="log.logId" class="log-line">
              <span class="log-date">{{ formatShort(log.ts) }}</span>
              <el-tag :type="typeTag(log.type)" size="small">{{ log.type }}</el-tag>
              <span class="log-loc">{{ log.locationName }}</span>
              <span class="log-person">{{ log.reporterName }}</span>
              <span class="log-qty">x{{ log.qty }}</span>
              <span v-if="log.remark" class="log-remark">{{ log.remark }}</span>
            </div>
          </div>
          <div v-else-if="row._expanded" class="drill-logs empty">暂无明细记录</div>
        </el-collapse-transition>
      </div>
    </el-drawer>

    <!-- ===== 下钻 Drawer: 设备消耗明细 ===== -->
    <el-drawer
      v-model="assetDrawerVisible"
      :title="`${assetDetail.assetName || ''} — 配件消耗分布`"
      size="560px"
      direction="rtl"
    >
      <div class="drill-header">
        <div class="drill-meta">
          <el-tag>{{ assetDetail.assetNo }}</el-tag>
          <span>{{ assetDetail.workshop }}</span>
          <span>{{ assetDetail.yearMonth }}</span>
          <span class="drill-total">更换 <strong>{{ assetDetail.totalLogCount }}</strong> 次，涉及 <strong>{{ assetDetail.totalPartTypes }}</strong> 种配件</span>
        </div>
      </div>
      <div v-for="(row, idx) in assetDetail.byPart" :key="row.partSkuId" class="drill-row">
        <div class="drill-row-header" @click="row._expanded = !row._expanded">
          <span class="drill-rank" :class="{ top: idx < 3 }">{{ idx + 1 }}</span>
          <div class="drill-info">
            <div class="drill-name">{{ row.partName }} <span class="drill-sub">{{ row.partCode }}</span></div>
            <div class="drill-bar-wrap">
              <div
                class="drill-bar"
                :class="{ 'bar-danger': row.isOverThreshold }"
                :style="{ width: Math.min(100, row.usageRate || 0) + '%' }"
              ></div>
            </div>
          </div>
          <div class="drill-nums">
            <div class="drill-qty">{{ row.qtySum }} {{ row.unit }}</div>
            <div class="drill-pct">{{ row.logCount }}次</div>
            <el-tag v-if="row.isOverThreshold" type="danger" size="small" effect="dark">
              {{ row.usageRate }}%
            </el-tag>
            <el-tag v-else-if="row.threshold" size="small">
              阈值 {{ row.threshold }}
            </el-tag>
            <el-tag v-else type="info" size="small">未设阈值</el-tag>
          </div>
          <el-icon class="expand-icon"><ArrowDown v-if="!row._expanded" /><ArrowUp v-else /></el-icon>
        </div>
        <el-collapse-transition>
          <div v-if="row._expanded && row.logs?.length" class="drill-logs">
            <div v-for="log in row.logs" :key="log.logId" class="log-line">
              <span class="log-date">{{ formatShort(log.ts) }}</span>
              <el-tag :type="typeTag(log.type)" size="small">{{ log.type }}</el-tag>
              <span class="log-loc">{{ log.locationName }}</span>
              <span class="log-person">{{ log.reporterName }}</span>
              <span class="log-qty">x{{ log.qty }}</span>
              <span v-if="log.remark" class="log-remark">{{ log.remark }}</span>
            </div>
          </div>
          <div v-else-if="row._expanded" class="drill-logs empty">暂无明细记录</div>
        </el-collapse-transition>
      </div>
    </el-drawer>

    <!-- ===== 下钻 Drawer: 设备报警明细 + ACK ===== -->
    <el-drawer
      v-model="alertDrawerVisible"
      :title="`${alertDetail.assetName || ''} — 报警明细`"
      size="600px"
      direction="rtl"
    >
      <div class="drill-header">
        <div class="drill-meta">
          <el-tag>{{ alertDetail.assetNo }}</el-tag>
          <span>{{ alertDetail.workshop }}</span>
          <span>{{ alertDetail.yearMonth }}</span>
          <el-tag type="danger" effect="dark">{{ alertDetail.openCount }} 条待处理</el-tag>
        </div>
      </div>

      <div v-for="alert in alertDetail.alerts" :key="alert.alertId" class="alert-detail-card">
        <div class="alert-card-header">
          <div class="alert-card-title">
            <el-icon color="#F56C6C"><WarningFilled /></el-icon>
            <span>{{ alert.partName }}</span>
            <el-tag size="small" type="info">{{ alert.partCode }}</el-tag>
          </div>
          <el-tag type="danger" size="small" effect="dark">OPEN</el-tag>
        </div>

        <div class="alert-card-metrics">
          <div class="metric">
            <span class="metric-label">阈值</span>
            <span class="metric-val">{{ alert.thresholdValue }} {{ alert.unit }}/月</span>
          </div>
          <div class="metric">
            <span class="metric-label">当前累计</span>
            <span class="metric-val danger">{{ alert.currentQty }} {{ alert.unit }}</span>
          </div>
          <div class="metric">
            <span class="metric-label">超出</span>
            <span class="metric-val danger">+{{ alert.overQty }} ({{ alert.overRate }}%)</span>
          </div>
        </div>

        <el-progress
          :percentage="Math.min(100, Math.round((alert.currentQty / alert.thresholdValue) * 100))"
          :color="'#F56C6C'"
          :stroke-width="10"
          :format="() => alert.overRate + '%'"
          style="margin: 12px 0;"
        />

        <!-- 消耗明细 -->
        <div class="alert-logs-title">消耗明细（本月更换记录）</div>
        <div v-if="alert.logs?.length" class="drill-logs">
          <div v-for="log in alert.logs" :key="log.logId" class="log-line">
            <span class="log-date">{{ formatShort(log.ts) }}</span>
            <el-tag :type="typeTag(log.type)" size="small">{{ log.type }}</el-tag>
            <span class="log-loc">{{ log.locationName }}</span>
            <span class="log-person">{{ log.reporterName }}</span>
            <span class="log-qty">x{{ log.qty }}</span>
            <span v-if="log.remark" class="log-remark">{{ log.remark }}</span>
          </div>
        </div>
        <div v-else class="drill-logs empty">暂无相关更换记录</div>

        <!-- ACK 按钮 -->
        <div class="ack-area">
          <el-input
            v-model="alert._ackNote"
            type="textarea"
            :rows="2"
            placeholder="填写确认说明（必填）"
            style="margin-bottom: 8px"
          />
          <el-button
            type="primary"
            :loading="alert._acking"
            :disabled="!alert._ackNote"
            @click="handleAckInDrawer(alert)"
          >
            确认报警 (ACK)
          </el-button>
        </div>
      </div>

      <el-empty v-if="!alertDetail.alerts?.length" description="暂无待处理报警" />
    </el-drawer>

    <!-- ===== 下钻 Drawer: 设备配件金额明细 ===== -->
    <el-drawer
      v-model="costDetailDrawerVisible"
      :title="`${costDetail.assetName || ''} — 配件金额明细`"
      size="560px"
      direction="rtl"
    >
      <div class="drill-header">
        <div class="drill-meta">
          <span>{{ costDetail.yearMonth }}</span>
          <span class="drill-total">总金额: <strong>¥{{ costDetail.totalCost?.toLocaleString() || '0' }}</strong></span>
        </div>
      </div>
      <div v-for="(row, idx) in costDetail.partList" :key="row.partSkuId" class="drill-row">
        <div class="drill-row-header">
          <span class="drill-rank" :class="{ top: idx < 3 }">{{ idx + 1 }}</span>
          <div class="drill-info">
            <div class="drill-name">{{ row.partName }} <span class="drill-sub">{{ row.partCode }}</span></div>
            <div v-if="row.specModel" class="drill-spec">{{ row.specModel }}</div>
            <div class="drill-bar-wrap">
              <div class="drill-bar" :style="{ width: row.percentage + '%' }"></div>
            </div>
          </div>
          <div class="drill-nums">
            <div class="drill-qty">¥{{ row.totalCost?.toLocaleString() }}</div>
            <div class="drill-pct">{{ row.qty }} {{ row.unit }} · {{ row.percentage }}%</div>
          </div>
        </div>
      </div>
      <el-empty v-if="!costDetail.partList?.length" description="暂无配件金额数据" />
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, markRaw } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import * as echarts from 'echarts'

const router = useRouter()
const authStore = useAuthStore()
const appStore = useAppStore()
const canViewCost = computed(() => authStore.canViewCost)

// ===== 全局月份 =====
const selectedMonth = ref(dayjs().format('YYYY-MM'))

// ===== 统计数据 =====
const stats = reactive({
  totalLogs: 0,
  totalPartsQty: 0,
  openAlerts: 0,
  totalAlerts: 0,
  topParts: [],
  topAssets: [],
  engineerWorkload: [],
  dailyTrend: [],
  alertsByAsset: [],
})

// ===== 库存 & 成本数据 =====
const inventorySummary = reactive({})
const costTrendData = reactive({ months: [], inventoryByMonth: [], inboundByMonth: [], outboundByMonth: [] })
const costRankingData = reactive({ costByAsset: [], totalMonthlyUsageCost: 0 })

// ===== 下钻状态 =====
const partDrawerVisible = ref(false)
const partDetail = reactive({})
const assetDrawerVisible = ref(false)
const assetDetail = reactive({})
const alertDrawerVisible = ref(false)
const alertDetail = reactive({})
const costDetailDrawerVisible = ref(false)
const costDetail = reactive({ assetName: '', yearMonth: '', totalCost: 0, partList: [] })

// ===== ECharts 实例 =====
const chartPartsRef = ref()
const chartAssetsRef = ref()
const chartTrendRef = ref()
const chartEngineerRef = ref()
const chartCostTrendRef = ref()
const chartCostRankingRef = ref()
let chartParts = null
let chartAssets = null
let chartTrend = null
let chartEngineer = null
let chartCostTrend = null
let chartCostRanking = null

// ===== 工具函数 =====
function formatShort(ts) {
  return ts ? dayjs(ts).format('MM-DD HH:mm') : '-'
}

function typeTag(type) {
  return { '维修': '', '预防': 'success', '紧急': 'danger' }[type] || 'info'
}

// ===== 路由联动 =====
function goAlerts() {
  router.push({ path: '/alerts', query: { status: 'OPEN' } })
}

// ===== 数据加载 =====
async function refreshAll() {
  const isSupervisorWithFactory = authStore.user?.role === 'Supervisor' && authStore.user?.factoryId
  const res = await api.getDashboardStats({
    yearMonth: selectedMonth.value,
    factoryId: isSupervisorWithFactory ? authStore.user.factoryId : appStore.currentFactoryId,
  })
  if (!res.ok) return
  Object.assign(stats, res.data)

  // Load inventory & cost data if user can view
  if (canViewCost.value) {
    const factoryId = appStore.currentFactoryId
    const [sumRes, trendRes, rankRes] = await Promise.all([
      api.getInventorySummary(factoryId, selectedMonth.value),
      api.getInventoryTrend(factoryId, 12),
      api.getMonthlyCostRanking(factoryId, selectedMonth.value)
    ])
    if (sumRes.ok) Object.assign(inventorySummary, sumRes.data)
    if (trendRes.ok) Object.assign(costTrendData, trendRes.data)
    if (rankRes.ok) Object.assign(costRankingData, rankRes.data)
  }

  await nextTick()
  renderCharts()
}

// ===== ECharts 渲染 =====
const COLORS = {
  green: '#07C160',
  blue: '#409EFF',
  orange: '#E6A23C',
  red: '#F56C6C',
  gray: '#C0C4CC',
}

function renderCharts() {
  renderPartsChart()
  renderAssetsChart()
  renderTrendChart()
  renderEngineerChart()
  if (canViewCost.value) {
    renderCostTrendChart()
    renderCostRankingChart()
  }
}

function renderPartsChart() {
  if (!chartPartsRef.value) return
  if (!chartParts) {
    chartParts = echarts.init(chartPartsRef.value)
    chartParts.on('click', (params) => {
      if (params.componentType === 'series') {
        const item = stats.topParts[params.dataIndex]
        if (item) openPartDrawer(item.partSkuId)
      }
    })
  }
  const data = [...stats.topParts].reverse()
  chartParts.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 100, right: 40, top: 10, bottom: 10 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: data.map(d => d.partName),
      axisLabel: { fontSize: 13, color: '#303133' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [{
      type: 'bar',
      data: data.map(d => d.totalQty),
      barWidth: 20,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#07C160' },
          { offset: 1, color: '#38d976' },
        ]),
      },
      label: { show: true, position: 'right', fontSize: 13, fontWeight: 600, color: '#303133' },
      cursor: 'pointer',
    }],
  }, true)
}

function renderAssetsChart() {
  if (!chartAssetsRef.value) return
  if (!chartAssets) {
    chartAssets = echarts.init(chartAssetsRef.value)
    chartAssets.on('click', (params) => {
      if (params.componentType === 'series') {
        const item = stats.topAssets[params.dataIndex]
        if (item) openAssetDrawer(item.assetId)
      }
    })
  }
  const data = [...stats.topAssets].reverse()
  chartAssets.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 110, right: 40, top: 10, bottom: 10 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: data.map(d => d.assetName),
      axisLabel: { fontSize: 13, color: '#303133' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [{
      type: 'bar',
      data: data.map(d => d.logCount),
      barWidth: 20,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#409EFF' },
          { offset: 1, color: '#79bbff' },
        ]),
      },
      label: {
        show: true,
        position: 'right',
        fontSize: 13,
        fontWeight: 600,
        color: '#303133',
        formatter: '{c}次',
      },
      cursor: 'pointer',
    }],
  }, true)
}

function renderTrendChart() {
  if (!chartTrendRef.value) return
  if (!chartTrend) chartTrend = echarts.init(chartTrendRef.value)
  const trend = stats.dailyTrend || []
  chartTrend.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params) => `${params[0].axisValue}<br/>更换 <b>${params[0].value}</b> 次`,
    },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'category',
      data: trend.map(d => d.label),
      axisLabel: { fontSize: 12, color: '#909399' },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#E4E7ED' } },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { fontSize: 12, color: '#909399' },
      splitLine: { lineStyle: { color: '#F2F6FC', type: 'dashed' } },
    },
    series: [{
      type: 'line',
      data: trend.map(d => d.count),
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { width: 3, color: COLORS.green },
      itemStyle: { color: COLORS.green },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(7, 193, 96, 0.25)' },
          { offset: 1, color: 'rgba(7, 193, 96, 0.02)' },
        ]),
      },
    }],
  }, true)
}

function renderEngineerChart() {
  if (!chartEngineerRef.value) return
  if (!chartEngineer) chartEngineer = echarts.init(chartEngineerRef.value)
  const data = [...(stats.engineerWorkload || [])].reverse()
  chartEngineer.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 70, right: 40, top: 10, bottom: 10 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: data.map(d => d.name),
      axisLabel: { fontSize: 13, color: '#303133' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [{
      type: 'bar',
      data: data.map(d => d.logCount),
      barWidth: 20,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#E6A23C' },
          { offset: 1, color: '#f0c78a' },
        ]),
      },
      label: {
        show: true,
        position: 'right',
        fontSize: 13,
        fontWeight: 600,
        color: '#303133',
        formatter: '{c}次',
      },
    }],
  }, true)
}

// ===== 月度库存金额趋势（简化：折线图 = 库存总值 / 入库总值 / 出库总值） =====
function renderCostTrendChart() {
  if (!chartCostTrendRef.value) return
  if (!chartCostTrend) chartCostTrend = echarts.init(chartCostTrendRef.value)

  const { months, inventoryByMonth, inboundByMonth, outboundByMonth } = costTrendData

  chartCostTrend.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        let html = `<b>${params[0].axisValue}</b><br/>`
        params.forEach(p => {
          html += `${p.marker} ${p.seriesName}: ¥${p.value?.toLocaleString()}<br/>`
        })
        return html
      }
    },
    legend: {
      bottom: 0,
      textStyle: { fontSize: 12 },
    },
    grid: { left: 60, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: months || [],
      axisLabel: { fontSize: 11, color: '#909399' },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: '#909399', formatter: '¥{value}' },
      splitLine: { lineStyle: { color: '#F2F6FC', type: 'dashed' } },
    },
    series: [
      {
        name: '库存总值',
        type: 'line',
        data: inventoryByMonth || [],
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2.5, color: '#409EFF' },
        itemStyle: { color: '#409EFF' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(64, 158, 255, 0.15)' },
            { offset: 1, color: 'rgba(64, 158, 255, 0.02)' },
          ]),
        },
      },
      {
        name: '入库总值',
        type: 'bar',
        data: inboundByMonth || [],
        barWidth: 12,
        itemStyle: {
          borderRadius: [3, 3, 0, 0],
          color: '#67C23A',
        },
      },
      {
        name: '出库（使用）总值',
        type: 'bar',
        data: outboundByMonth || [],
        barWidth: 12,
        itemStyle: {
          borderRadius: [3, 3, 0, 0],
          color: '#F56C6C',
        },
      },
    ],
  }, true)
}

// ===== 设备配件使用金额 TOP 10 竖状柱状图 =====
function renderCostRankingChart() {
  if (!chartCostRankingRef.value) return
  if (!chartCostRanking) {
    chartCostRanking = echarts.init(chartCostRankingRef.value)
    chartCostRanking.on('click', (params) => {
      if (params.componentType === 'series') {
        const list = costRankingData.costByAsset || []
        // Data is reversed for horizontal bar
        const item = list[list.length - 1 - params.dataIndex]
        if (item) openCostDetailDrawer(item.assetId)
      }
    })
  }

  const ranking = costRankingData.costByAsset || []
  const data = [...ranking].reverse()

  chartCostRanking.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        return `${params[0].name}<br/>配件使用金额: <b>¥${params[0].value?.toLocaleString()}</b>`
      }
    },
    grid: { left: 110, right: 50, top: 10, bottom: 10 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: data.map(d => d.assetName),
      axisLabel: { fontSize: 12, color: '#303133' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [{
      type: 'bar',
      data: data.map(d => d.totalCost),
      barWidth: 18,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#E6A23C' },
          { offset: 1, color: '#f0c78a' },
        ]),
      },
      label: {
        show: true,
        position: 'right',
        fontSize: 11,
        fontWeight: 600,
        color: '#303133',
        formatter: (params) => '¥' + params.value?.toLocaleString(),
      },
      cursor: 'pointer',
    }],
  }, true)
}

// ===== 下钻：配件消耗明细 =====
async function openPartDrawer(partSkuId) {
  const res = await api.getDashboardPartDetail(partSkuId, selectedMonth.value)
  if (!res.ok) return
  // 添加展开状态
  res.data.byAsset.forEach(row => { row._expanded = false })
  Object.assign(partDetail, res.data)
  partDrawerVisible.value = true
}

// ===== 下钻：设备消耗明细 =====
async function openAssetDrawer(assetId) {
  const res = await api.getDashboardAssetDetail(assetId, selectedMonth.value)
  if (!res.ok) return
  res.data.byPart.forEach(row => { row._expanded = false })
  Object.assign(assetDetail, res.data)
  assetDrawerVisible.value = true
}

// ===== 下钻：设备报警明细 =====
async function openAssetAlertDrawer(assetId) {
  const res = await api.getDashboardAssetAlerts(assetId, selectedMonth.value)
  if (!res.ok) return
  res.data.alerts.forEach(a => { a._ackNote = ''; a._acking = false })
  Object.assign(alertDetail, res.data)
  alertDrawerVisible.value = true
}

// ===== 下钻：设备配件金额明细 =====
async function openCostDetailDrawer(assetId) {
  const res = await api.getAssetCostDetail(
    appStore.currentFactoryId, assetId, selectedMonth.value
  )
  if (!res.ok) return
  Object.assign(costDetail, res.data)
  costDetailDrawerVisible.value = true
}

// ===== ACK =====
async function handleAckInDrawer(alert) {
  if (!alert._ackNote?.trim()) {
    ElMessage.warning('请填写确认说明')
    return
  }
  alert._acking = true
  try {
    const res = await api.ackAlert(alert.alertId, alert._ackNote)
    if (res.ok) {
      ElMessage.success('报警已确认')
      // 移除已确认的报警
      const idx = alertDetail.alerts.findIndex(a => a.alertId === alert.alertId)
      if (idx !== -1) alertDetail.alerts.splice(idx, 1)
      alertDetail.openCount = alertDetail.alerts.length
      // 刷新看板数据
      refreshAll()
    } else {
      ElMessage.error(res.error?.message || '操作失败')
    }
  } finally {
    alert._acking = false
  }
}

// ===== 窗口尺寸响应 =====
function handleResize() {
  chartParts?.resize()
  chartAssets?.resize()
  chartTrend?.resize()
  chartEngineer?.resize()
  chartCostTrend?.resize()
  chartCostRanking?.resize()
}

onMounted(() => {
  refreshAll()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chartParts?.dispose()
  chartAssets?.dispose()
  chartTrend?.dispose()
  chartEngineer?.dispose()
  chartCostTrend?.dispose()
  chartCostRanking?.dispose()
})
</script>

<style lang="scss" scoped>
.dashboard {
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
}

// ===== M1 数字卡 =====
.stat-row {
  margin-bottom: 16px;
}

.stat-card {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 1px 4px rgba(0,0,0,.05);
  transition: transform .2s, box-shadow .2s;

  &.clickable {
    cursor: pointer;
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,.1);
    }
  }
}

.stat-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.icon-green  { background: #e6f9ee; color: #07C160; }
  &.icon-blue   { background: #ecf5ff; color: #409EFF; }
  &.icon-red    { background: #fef0f0; color: #F56C6C; }
  &.icon-orange { background: #fdf6ec; color: #E6A23C; }
}

.stat-body {
  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: #303133;
    line-height: 1.2;
    &.stat-danger { color: #F56C6C; }
  }
  .stat-label {
    font-size: 13px;
    color: #909399;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 2px;
    .link-icon { font-size: 12px; }
  }
}

// ===== 图表卡片 =====
.chart-row {
  margin-bottom: 16px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.card-hint {
  font-size: 12px;
  color: #c0c4cc;
  margin-left: 8px;
}

:deep(.el-card__header) {
  padding: 14px 20px;
  display: flex;
  align-items: center;
}

.chart-box {
  height: 240px;
  width: 100%;
}

// ===== M6 报警设备分布 =====
.m6-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.alert-asset-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.alert-asset-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s;

  &:hover {
    background: #fef0f0;
  }
}

.alert-asset-left {
  display: flex;
  align-items: center;
  gap: 12px;

  .warn-icon { color: #F56C6C; }
  .alert-asset-name { font-size: 14px; font-weight: 500; color: #303133; }
  .alert-asset-workshop { font-size: 12px; color: #909399; margin-top: 2px; }
}

.alert-asset-right {
  display: flex;
  align-items: center;
  gap: 8px;

  .alert-hint { font-size: 13px; color: #909399; }
  .arrow-icon { color: #c0c4cc; }
}

// ===== 下钻 Drawer 通用样式 =====
.drill-header {
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 16px;
}

.drill-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: #606266;
}

.drill-total {
  strong { color: #303133; font-size: 16px; }
}

.drill-row {
  border-bottom: 1px solid #f5f5f5;
}

.drill-row-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
  cursor: pointer;
  transition: background .15s;

  &:hover { background: #fafafa; border-radius: 6px; padding-left: 8px; padding-right: 8px; }
}

.drill-rank {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: #f0f0f0;
  color: #909399;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.top { background: #07C160; color: #fff; }
}

.drill-info {
  flex: 1;
  min-width: 0;

  .drill-name {
    font-size: 14px;
    font-weight: 500;
    color: #303133;
    margin-bottom: 6px;

    .drill-sub {
      font-size: 12px;
      color: #909399;
      font-weight: 400;
      margin-left: 6px;
    }
  }

  .drill-bar-wrap {
    height: 6px;
    background: #f0f0f0;
    border-radius: 3px;
    overflow: hidden;

    .drill-bar {
      height: 100%;
      background: #07C160;
      border-radius: 3px;
      transition: width .4s ease;

      &.bar-danger { background: #F56C6C; }
    }
  }
}

.drill-nums {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;

  .drill-qty {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
  }
  .drill-pct {
    font-size: 12px;
    color: #909399;
  }
}

.expand-icon {
  color: #c0c4cc;
  flex-shrink: 0;
}

// 更换记录明细
.drill-logs {
  padding: 8px 0 12px 36px;
  border-top: 1px dashed #f0f0f0;

  &.empty {
    font-size: 13px;
    color: #c0c4cc;
    padding: 12px 0 12px 36px;
  }
}

.log-line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;

  .log-date { color: #909399; flex-shrink: 0; width: 90px; }
  .log-loc { color: #606266; }
  .log-person { color: #303133; font-weight: 500; }
  .log-qty { color: #07C160; font-weight: 600; flex-shrink: 0; }
  .log-remark { color: #909399; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
}

// ===== 报警明细卡片 =====
.alert-detail-card {
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 16px;
}

.alert-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  .alert-card-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    color: #303133;
  }
}

.alert-card-metrics {
  display: flex;
  gap: 24px;
  margin-bottom: 4px;

  .metric {
    .metric-label {
      font-size: 12px;
      color: #909399;
    }
    .metric-val {
      font-size: 14px;
      font-weight: 600;
      color: #303133;
      &.danger { color: #F56C6C; }
    }
  }
}

.alert-logs-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin: 12px 0 4px;
}

.ack-area {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed #fbc4c4;
}

// ===== 库存概览 =====
.inv-summary {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inv-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;

  &:last-child { border-bottom: none; }

  &.inv-clickable {
    cursor: pointer;
    border-radius: 6px;
    padding: 8px 8px;
    margin: 0 -8px;
    transition: background .15s;
    &:hover { background: #f5f7fa; }
  }
}

.inv-arrow {
  color: #c0c4cc;
  font-size: 14px;
  flex-shrink: 0;
  margin-left: 4px;
}

.inv-label {
  font-size: 13px;
  color: #909399;
}

.inv-value {
  font-size: 18px;
  font-weight: 700;
  color: #303133;
}

.inv-green { color: #67C23A; }
.inv-red { color: #F56C6C; }
.inv-warn { color: #E6A23C; }

.drill-spec {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}
</style>
