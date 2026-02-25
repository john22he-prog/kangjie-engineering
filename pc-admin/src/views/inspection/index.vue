<template>
  <div class="page-container">
    <div class="page-header">
      <h2>巡检管理</h2>
    </div>

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <!-- ========== 数据看板 ========== -->
      <el-tab-pane label="数据看板" name="dashboard">
        <div v-loading="dashLoading">
          <div v-if="!dash.hasPlan && !dashLoading" class="empty-tip">
            <el-empty description="暂未配置巡检计划，请先在「巡检计划」中配置">
              <el-button type="primary" @click="activeTab = 'plan'">配置巡检计划</el-button>
            </el-empty>
          </div>
          <template v-if="dash.hasPlan">
            <!-- 统计卡片 -->
            <div class="stat-cards">
              <div class="stat-card green">
                <div class="stat-icon">✓</div>
                <div class="stat-body">
                  <div class="stat-value">{{ dash.cards.todayCompleted }}<span class="stat-unit"> / {{ dash.cards.todayTotal }}</span></div>
                  <div class="stat-label">今日完成</div>
                </div>
              </div>
              <div class="stat-card" :class="dash.cards.weekRate >= 80 ? 'blue' : 'orange'">
                <div class="stat-icon">📊</div>
                <div class="stat-body">
                  <div class="stat-value">{{ dash.cards.weekRate }}<span class="stat-unit">%</span></div>
                  <div class="stat-label">本周完成率</div>
                </div>
              </div>
              <div class="stat-card purple">
                <div class="stat-icon">📋</div>
                <div class="stat-body">
                  <div class="stat-value">{{ dash.cards.monthCount }}</div>
                  <div class="stat-label">本月打卡总数</div>
                </div>
              </div>
              <div class="stat-card" :class="dash.cards.streak > 0 ? 'gold' : 'gray'">
                <div class="stat-icon">🔥</div>
                <div class="stat-body">
                  <div class="stat-value">{{ dash.cards.streak }}<span class="stat-unit"> 天</span></div>
                  <div class="stat-label">连续达标</div>
                </div>
              </div>
              <div class="stat-card" :class="dash.cards.todayMissedCount === 0 ? 'green' : 'red'">
                <div class="stat-icon">⚠</div>
                <div class="stat-body">
                  <div class="stat-value">{{ dash.cards.todayMissedCount }}</div>
                  <div class="stat-label">今日漏检</div>
                </div>
              </div>
            </div>

            <!-- 90天巡检日历（含完成率） -->
            <div class="chart-row">
              <div class="chart-box full">
                <div class="chart-title">近90天巡检日历</div>
                <div class="calendar-heatmap-v2">
                  <div class="cal-legend-top">
                    <span class="cal-legend-item"><span class="cal-dot lv0"></span>未巡检</span>
                    <span class="cal-legend-item"><span class="cal-dot lv1"></span>&lt;50%</span>
                    <span class="cal-legend-item"><span class="cal-dot lv2"></span>≥50%</span>
                    <span class="cal-legend-item"><span class="cal-dot lv3"></span>全部完成</span>
                  </div>
                  <div class="cal-grid-v2">
                    <div
                      v-for="(cell, idx) in dash.calendar"
                      :key="idx"
                      class="cal-cell-v2"
                      :class="'lv' + cell.level"
                      :title="cell.date + ': ' + cell.done + '/' + cell.total"
                    >
                      <span class="cal-date-v2">{{ cell.date.slice(5) }}</span>
                      <span class="cal-rate-v2">{{ cell.total > 0 ? Math.round(cell.done / cell.total * 100) : 0 }}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 人员排行 + 时间分布 -->
            <div class="chart-row">
              <div class="chart-box wide">
                <div class="chart-title">人员打卡排行</div>
                <div ref="userChartRef" class="chart-canvas"></div>
              </div>
              <div class="chart-box narrow">
                <div class="chart-title">打卡时间分布</div>
                <div ref="hourChartRef" class="chart-canvas"></div>
              </div>
            </div>

            <!-- 设备漏检排行 -->
            <div class="chart-row" v-if="dash.deviceMissed?.length">
              <div class="chart-box full">
                <div class="chart-title">设备漏检排行（近30天）</div>
                <div ref="deviceChartRef" class="chart-canvas tall"></div>
              </div>
            </div>

            <!-- 今日漏检列表 -->
            <div v-if="dash.cards.todayMissed?.length" class="missed-section">
              <div class="section-title">今日待巡检设备</div>
              <div class="missed-tags">
                <el-tag v-for="item in dash.cards.todayMissed" :key="item.assetId" type="danger" effect="plain" class="missed-tag">
                  {{ item.assetName }} <span class="missed-no">{{ item.assetNo }}</span>
                </el-tag>
              </div>
            </div>
          </template>
        </div>
      </el-tab-pane>

      <!-- ========== 今日巡检 ========== -->
      <el-tab-pane label="今日巡检" name="today">
        <div v-loading="todayLoading">
          <div class="progress-overview" v-if="todayPlan">
            <div class="progress-card">
              <div class="progress-title">今日巡检进度</div>
              <div class="progress-date">{{ todayDate }}</div>
              <div class="progress-nums">
                <span class="done-num">{{ todayCompleted }}</span>
                <span class="sep"> / </span>
                <span class="total-num">{{ todayTotal }}</span>
              </div>
              <el-progress :percentage="todayProgress" :stroke-width="12" :color="todayProgress >= 100 ? '#67c23a' : '#07C160'" style="margin-top: 12px" />
            </div>
          </div>
          <div v-if="!todayPlan && !todayLoading" class="empty-tip">
            <el-empty description="暂未配置巡检计划">
              <el-button type="primary" @click="activeTab = 'plan'">配置巡检计划</el-button>
            </el-empty>
          </div>
          <el-table v-if="todayPlan" :data="todayAssets" stripe style="margin-top: 16px">
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.done ? 'success' : 'info'" size="small">{{ row.done ? '已完成' : '待巡检' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="assetName" label="设备名称" min-width="150" />
            <el-table-column prop="assetNo" label="设备编号" width="120" />
            <el-table-column label="巡检人" width="100">
              <template #default="{ row }">{{ row.log?.userDisplayName || '-' }}</template>
            </el-table-column>
            <el-table-column label="巡检时间" width="180">
              <template #default="{ row }">{{ row.log ? formatTime(row.log.createdAt) : '-' }}</template>
            </el-table-column>
            <el-table-column label="照片" width="120">
              <template #default="{ row }">
                <el-button v-if="row.log?.images?.length" size="small" text type="primary" @click="showImages(row.log.images)">{{ row.log.images.length }}张</el-button>
                <span v-else style="color:#c0c4cc">-</span>
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">{{ row.log?.remark || '-' }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- ========== 历史记录 ========== -->
      <el-tab-pane label="历史记录" name="history">
        <div class="filter-bar">
          <el-date-picker v-model="historyDateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width: 300px" @change="loadHistory" />
          <el-button @click="loadHistory" :loading="historyLoading"><el-icon><Refresh /></el-icon>刷新</el-button>
        </div>
        <el-table :data="historyList" v-loading="historyLoading" stripe style="margin-top: 16px">
          <el-table-column prop="inspectDate" label="日期" width="130" />
          <el-table-column label="完成情况" width="150">
            <template #default="{ row }">
              <el-tag :type="row.completed >= row.total ? 'success' : 'warning'" size="small">{{ row.completed }} / {{ row.total }}</el-tag>
              <span style="margin-left:8px;color:#909399;font-size:12px">{{ row.total > 0 ? Math.round(row.completed / row.total * 100) : 0 }}%</span>
            </template>
          </el-table-column>
          <el-table-column label="巡检详情" min-width="400">
            <template #default="{ row }">
              <div v-for="log in row.logs" :key="log.assetId" class="history-log-item">
                <span class="log-asset">{{ log.assetName }}</span>
                <span class="log-no">{{ log.assetNo }}</span>
                <span class="log-user">{{ log.userDisplayName }}</span>
                <el-button v-if="log.images?.length" size="small" text type="primary" @click="showImages(log.images)">{{ log.images.length }}张</el-button>
                <span v-if="log.remark" class="log-remark">{{ log.remark }}</span>
              </div>
              <span v-if="!row.logs?.length" style="color:#c0c4cc">无打卡记录</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- ========== 巡检计划 ========== -->
      <el-tab-pane label="巡检计划" name="plan" v-if="canManage">
        <div class="plan-header">
          <div class="plan-info">
            <el-input v-model="planName" placeholder="计划名称" style="width: 250px" />
            <span class="plan-count">已选 {{ selectedAssetIds.length }} / {{ allAssets.length }} 台设备</span>
          </div>
          <div class="plan-actions">
            <el-button @click="selectAllAssets">全选</el-button>
            <el-button @click="deselectAllAssets">取消全选</el-button>
            <el-button type="primary" @click="savePlan" :loading="planSaving" :disabled="selectedAssetIds.length === 0">保存巡检计划</el-button>
          </div>
        </div>
        <el-table :data="allAssets" v-loading="planLoading" stripe style="margin-top: 16px" @selection-change="onAssetSelectionChange" ref="planTableRef">
          <el-table-column type="selection" width="55" />
          <el-table-column prop="assetName" label="设备名称" min-width="200" />
          <el-table-column prop="assetNo" label="设备编号" width="150" />
          <el-table-column prop="workshop" label="车间" width="120" />
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="imageDialogVisible" title="巡检照片" width="700px">
      <div class="image-grid">
        <el-image v-for="(img, idx) in currentImages" :key="idx" :src="img" :preview-src-list="currentImages" :initial-index="idx" fit="cover" class="preview-image" :preview-teleported="true">
          <template #error><div class="image-error"><el-icon :size="32"><Picture /></el-icon><span>加载失败</span></div></template>
        </el-image>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch, onBeforeUnmount } from 'vue'
import { api } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import dayjs from 'dayjs'
import * as echarts from 'echarts'

const auth = useAuthStore()
const canManage = computed(() => auth.canManage)

const activeTab = ref('dashboard')

// ===== Dashboard =====
const dashLoading = ref(false)
const dash = ref({ hasPlan: false, cards: {}, trend: [], userRanking: [], deviceMissed: [], calendar: [], hourly: [] })

const userChartRef = ref(null)
const hourChartRef = ref(null)
const deviceChartRef = ref(null)
, userChart = null, hourChart = null, deviceChart = null

async function loadDashboard() {
  dashLoading.value = true
  try {
    const res = await api.getInspectionDashboard()
    if (res.ok) {
      dash.value = res.data
      await nextTick()
      if (res.data.hasPlan) renderCharts()
    }
  } catch (e) { console.error('loadDashboard error', e) }
  dashLoading.value = false
}

function renderCharts() {
  renderUserChart()
  renderHourChart()
  renderDeviceChart()
}

function renderUserChart() {
  if (!userChartRef.value) return
  if (userChart) userChart.dispose()
  userChart = echarts.init(userChartRef.value)
  const ranking = (dash.value.userRanking || []).slice().reverse()
  userChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 90, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: ranking.map(u => u.name), axisLabel: { fontSize: 12 } },
    series: [{ type: 'bar', data: ranking.map(u => ({ value: u.count, itemStyle: { color: '#409EFF', borderRadius: [0, 4, 4, 0] } })), barMaxWidth: 20, label: { show: true, position: 'right', fontSize: 12, color: '#606266' } }]
  })
}

function renderHourChart() {
  if (!hourChartRef.value) return
  if (hourChart) hourChart.dispose()
  hourChart = echarts.init(hourChartRef.value)
  const hourly = dash.value.hourly || []
  hourChart.setOption({
    tooltip: { trigger: 'axis', formatter: (ps) => `${ps[0].name}:00<br/>打卡次数: <b>${ps[0].value}</b>` },
    grid: { left: 45, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category', data: hourly.map(h => h.hour + ':00'), axisLabel: { rotate: 45, fontSize: 10 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar',
      data: hourly.map(h => ({
        value: h.count,
        itemStyle: {
          color: h.hour >= 7 && h.hour <= 18 ? '#67c23a' : '#e6a23c',
          borderRadius: [3, 3, 0, 0]
        }
      })),
      barMaxWidth: 16
    }]
  })
}

function renderDeviceChart() {
  if (!deviceChartRef.value) return
  if (deviceChart) deviceChart.dispose()
  const devices = dash.value.deviceMissed || []
  if (devices.length === 0) return
  deviceChart = echarts.init(deviceChartRef.value)
  const top = devices.slice(0, 15).reverse()
  deviceChart.setOption({
    tooltip: { trigger: 'axis', formatter: (ps) => { const p = ps[0]; const d = top[p.dataIndex]; return `${d.assetName} (${d.assetNo})<br/>漏检: <b>${d.missed}</b> 天 / 30天<br/>完成率: ${d.rate}%` } },
    grid: { left: 130, right: 50, top: 10, bottom: 20 },
    xAxis: { type: 'value', max: 30, name: '漏检天数' },
    yAxis: { type: 'category', data: top.map(d => d.assetName.length > 10 ? d.assetName.slice(0, 10) + '…' : d.assetName), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', data: top.map(d => ({ value: d.missed, itemStyle: { color: d.missed >= 20 ? '#f56c6c' : d.missed >= 10 ? '#e6a23c' : '#909399', borderRadius: [0, 4, 4, 0] } })), barMaxWidth: 18, label: { show: true, position: 'right', fontSize: 11, color: '#606266', formatter: (p) => top[p.dataIndex].missed + '天' } }]
  })
}


function handleResize() {
  userChart?.resize()
  hourChart?.resize()
  deviceChart?.resize()
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  loadDashboard()
  loadToday()
  loadHistory()
  if (canManage.value) loadPlanData()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  userChart?.dispose()
  hourChart?.dispose()
  deviceChart?.dispose()
})

function onTabChange(tab) {
  if (tab === 'dashboard') { nextTick(() => { if (dash.value.hasPlan) renderCharts() }) }
}

// ===== Today =====
const todayLoading = ref(false)
const todayPlan = ref(null)
const todayAssets = ref([])
const todayCompleted = ref(0)
const todayTotal = ref(0)
const todayDate = ref(dayjs().format('YYYY-MM-DD'))
const todayProgress = computed(() => todayTotal.value > 0 ? Math.round(todayCompleted.value / todayTotal.value * 100) : 0)

async function loadToday() {
  todayLoading.value = true
  try {
    const res = await api.getInspectionPlan()
    if (res.ok) {
      todayPlan.value = res.data.plan
      todayAssets.value = res.data.assets || []
      todayCompleted.value = res.data.completed
      todayTotal.value = res.data.total
      todayDate.value = res.data.inspectDate
    }
  } catch (e) { console.error('loadToday error', e) }
  todayLoading.value = false
}

// ===== History =====
const historyLoading = ref(false)
const historyList = ref([])
const historyDateRange = ref([])

async function loadHistory() {
  historyLoading.value = true
  try {
    const params = { page: 1, pageSize: 60 }
    if (historyDateRange.value?.length === 2) {
      params.startDate = historyDateRange.value[0]
      params.endDate = historyDateRange.value[1]
    }
    const res = await api.listInspectionHistory(params)
    if (res.ok) { historyList.value = res.data.list || [] }
  } catch (e) { console.error('loadHistory error', e) }
  historyLoading.value = false
}

// ===== Plan Config =====
const planLoading = ref(false)
const planSaving = ref(false)
const allAssets = ref([])
const selectedAssetIds = ref([])
const planName = ref('日常巡检')
const planTableRef = ref(null)

async function loadPlanData() {
  planLoading.value = true
  try {
    const [assetsRes, planRes] = await Promise.all([api.listAssets(), api.getInspectionPlan()])
    if (assetsRes.ok) { allAssets.value = assetsRes.data.list || [] }
    if (planRes.ok && planRes.data.plan) {
      planName.value = planRes.data.plan.planName || '日常巡检'
      const planAssetIds = new Set((planRes.data.assets || []).map(a => a.assetId))
      selectedAssetIds.value = [...planAssetIds]
      await nextTick()
      if (planTableRef.value) {
        allAssets.value.forEach(row => { if (planAssetIds.has(row.assetId)) planTableRef.value.toggleRowSelection(row, true) })
      }
    }
  } catch (e) { console.error('loadPlanData error', e) }
  planLoading.value = false
}

function onAssetSelectionChange(selection) { selectedAssetIds.value = selection.map(s => s.assetId) }
function selectAllAssets() { if (planTableRef.value) allAssets.value.forEach(row => planTableRef.value.toggleRowSelection(row, true)) }
function deselectAllAssets() { if (planTableRef.value) planTableRef.value.clearSelection() }

async function savePlan() {
  if (selectedAssetIds.value.length === 0) { ElMessage.warning('请至少选择 1 台设备'); return }
  planSaving.value = true
  try {
    const res = await api.setInspectionPlan({ assetIds: selectedAssetIds.value, planName: planName.value })
    if (res.ok) { ElMessage.success('巡检计划已保存（' + res.data.assetCount + '台设备）'); loadToday(); loadDashboard() }
    else { ElMessage.error(res.error?.message || '保存失败') }
  } catch (e) { ElMessage.error('网络异常') }
  planSaving.value = false
}

// ===== Shared =====
const imageDialogVisible = ref(false)
const currentImages = ref([])
function showImages(images) { currentImages.value = images || []; imageDialogVisible.value = true }
function formatTime(ts) { if (!ts) return '-'; return dayjs(ts).format('YYYY-MM-DD HH:mm') }
</script>

<style scoped>
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; }

/* ===== Stat Cards ===== */
.stat-cards { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
.stat-card {
  flex: 1; min-width: 170px; display: flex; align-items: center; gap: 14px;
  padding: 20px 22px; border-radius: 12px; transition: transform 0.2s, box-shadow 0.2s;
}
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
.stat-card.green  { background: linear-gradient(135deg, #f0faf3 0%, #e8f7ed 100%); }
.stat-card.blue   { background: linear-gradient(135deg, #ecf5ff 0%, #dbeafe 100%); }
.stat-card.purple { background: linear-gradient(135deg, #f5f0ff 0%, #ede5ff 100%); }
.stat-card.gold   { background: linear-gradient(135deg, #fffbe6 0%, #fff3cd 100%); }
.stat-card.orange { background: linear-gradient(135deg, #fef3e6 0%, #fde8cc 100%); }
.stat-card.red    { background: linear-gradient(135deg, #fef0f0 0%, #fde2e2 100%); }
.stat-card.gray   { background: linear-gradient(135deg, #f5f7fa 0%, #ebeef5 100%); }
.stat-icon { font-size: 32px; flex-shrink: 0; }
.stat-body { flex: 1; }
.stat-value { font-size: 30px; font-weight: 700; color: #303133; line-height: 1.1; }
.stat-unit { font-size: 14px; font-weight: 400; color: #909399; }
.stat-label { font-size: 13px; color: #909399; margin-top: 4px; }

/* ===== Chart Layout ===== */
.chart-row { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.chart-box {
  background: #fff; border-radius: 12px; padding: 20px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid #f0f0f0;
}
.chart-box.wide { flex: 2; min-width: 400px; }
.chart-box.narrow { flex: 1; min-width: 300px; }
.chart-box.full { flex: 1; min-width: 100%; }
.chart-title { font-size: 15px; font-weight: 600; color: #303133; margin-bottom: 12px; }
.chart-canvas { width: 100%; height: 280px; }
.chart-canvas.tall { height: 350px; }

/* ===== Calendar Heatmap V2 ===== */
.calendar-heatmap-v2 { padding: 8px 0; }
.cal-legend-top { display: flex; gap: 16px; margin-bottom: 16px; font-size: 13px; color: #909399; }
.cal-legend-item { display: flex; align-items: center; gap: 6px; }
.cal-dot { width: 14px; height: 14px; border-radius: 4px; display: inline-block; }
.cal-dot.lv0 { background: #ebeef5; }
.cal-dot.lv1 { background: #f89898; }
.cal-dot.lv2 { background: #e6a23c; }
.cal-dot.lv3 { background: #67c23a; }
.cal-grid-v2 {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(62px, 1fr));
  gap: 6px;
}
.cal-cell-v2 {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 56px; border-radius: 8px; cursor: default;
  transition: transform 0.15s, box-shadow 0.15s;
}
.cal-cell-v2:hover { transform: scale(1.08); z-index: 1; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.cal-cell-v2.lv0 { background: #f5f7fa; }
.cal-cell-v2.lv1 { background: #fde2e2; }
.cal-cell-v2.lv2 { background: #faecd8; }
.cal-cell-v2.lv3 { background: #e1f3d8; }
.cal-date-v2 {
  font-size: 11px; color: #909399; line-height: 1.2;
}
.cal-rate-v2 {
  font-size: 15px; font-weight: 700; line-height: 1.3; margin-top: 2px;
}
.cal-cell-v2.lv0 .cal-rate-v2 { color: #c0c4cc; }
.cal-cell-v2.lv1 .cal-rate-v2 { color: #f56c6c; }
.cal-cell-v2.lv2 .cal-rate-v2 { color: #e6a23c; }
.cal-cell-v2.lv3 .cal-rate-v2 { color: #67c23a; }

/* ===== Missed Section ===== */
.missed-section { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid #f0f0f0; }
.section-title { font-size: 15px; font-weight: 600; color: #303133; margin-bottom: 12px; }
.missed-tags { display: flex; gap: 8px; flex-wrap: wrap; }
.missed-tag { font-size: 13px; }
.missed-no { color: #c0c4cc; margin-left: 4px; font-size: 11px; }

/* ===== Today Tab ===== */
.progress-overview { display: flex; justify-content: center; margin-bottom: 16px; }
.progress-card { text-align: center; padding: 24px 48px; background: #f0faf3; border-radius: 12px; min-width: 300px; }
.progress-title { font-size: 16px; font-weight: 600; color: #303133; }
.progress-date { font-size: 13px; color: #909399; margin: 4px 0 12px; }
.progress-nums { font-size: 36px; font-weight: 700; }
.done-num { color: #07C160; }
.sep { color: #c0c4cc; font-size: 24px; }
.total-num { color: #606266; }

/* ===== Shared ===== */
.filter-bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.history-log-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; flex-wrap: wrap; }
.log-asset { font-weight: 500; }
.log-no { color: #909399; font-size: 12px; }
.log-user { color: #606266; }
.log-remark { color: #909399; font-size: 12px; font-style: italic; }
.plan-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.plan-info { display: flex; align-items: center; gap: 16px; }
.plan-count { color: #606266; font-size: 14px; }
.plan-actions { display: flex; gap: 8px; }
.image-grid { display: flex; flex-wrap: wrap; gap: 12px; }
.preview-image { width: 150px; height: 150px; border-radius: 8px; overflow: hidden; }
.image-error { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; background: #f5f7fa; color: #c0c4cc; font-size: 12px; }
.empty-tip { padding: 40px 0; }
</style>
