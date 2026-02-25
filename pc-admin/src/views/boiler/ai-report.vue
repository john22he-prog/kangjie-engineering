<template>
  <div class="page-container boiler-ai-report">
    <div class="page-header">
      <h2>锅炉房 AI 分析</h2>
      <div class="header-actions">
        <BoilerParkSelect @change="onParkChange" />
        <TimeRangeSelector v-model="timeRange" style="margin-left: 8px;" />
        <el-select v-model="promptType" placeholder="报告类型" style="width: 130px;">
          <el-option label="每日简报" value="daily_report" />
          <el-option label="异常诊断" value="anomaly_diagnosis" />
          <el-option label="趋势预测" value="trend_forecast" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="generateReport">
          生成报告
        </el-button>
        <el-button v-if="report" type="success" plain @click="handleExportPDF" style="margin-left: 8px;">
          导出 PDF
        </el-button>
      </div>
    </div>

    <template v-if="report">
      <el-row :gutter="16" class="stat-row">
        <el-col :xs="12" :sm="6" :lg="4">
          <div class="stat-card kpi-highlight">
            <div class="stat-value">{{ report.stats.totalSteam || '--' }} <span class="unit">吨</span></div>
            <div class="stat-label">总产汽量</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6" :lg="4">
          <div class="stat-card kpi-cost">
            <div class="stat-value">¥{{ (report.stats.totalCost || 0).toLocaleString() }}</div>
            <div class="stat-label">总能源成本</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6" :lg="4">
          <div class="stat-card">
            <div class="stat-value">¥{{ report.stats.perSteamCost || '--' }}</div>
            <div class="stat-label">吨汽成本</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6" :lg="4">
          <div class="stat-card" :class="{ 'stat-warn': (report.stats.steamLossRate || 0) > 15 }">
            <div class="stat-value">{{ report.stats.steamLossRate || '--' }}<span class="unit">%</span></div>
            <div class="stat-label">汽损率</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6" :lg="4">
          <div class="stat-card">
            <div class="stat-value">{{ report.stats.totalElec || '--' }} <span class="unit">kWh</span></div>
            <div class="stat-label">总用电</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6" :lg="4">
          <div class="stat-card" :class="{ 'stat-danger': (report.stats.fuelDaysLeft || 99) < 5 }">
            <div class="stat-value">{{ report.stats.fuelDaysLeft || '--' }} <span class="unit">天</span></div>
            <div class="stat-label">燃料可用天数</div>
          </div>
        </el-col>
      </el-row>

      <el-card v-if="report.llmContent" class="llm-card" shadow="never">
        <template #header>
          <div class="card-header-flex">
            <span>
              <el-icon style="vertical-align: -2px; margin-right: 4px;"><MagicStick /></el-icon>
              AI 智能分析
            </span>
            <el-tag type="warning" size="small" effect="plain">{{ promptTypeLabel }}</el-tag>
          </div>
        </template>
        <div class="llm-content markdown-body" v-html="renderedLLM"></div>
      </el-card>

      <el-card class="summary-card" shadow="never">
        <template #header>
          <div class="card-header-flex">
            <span>{{ timeRange.label }} 运行摘要</span>
            <el-tag v-if="!report.llmContent" type="info" size="small" effect="plain">规则模板</el-tag>
          </div>
        </template>
        <p class="summary-text">{{ report.summaryText }}</p>
      </el-card>

      <el-row :gutter="16" class="sections-row">
        <el-col v-for="sec in report.sections" :key="sec.title" :xs="24" :md="12">
          <el-card shadow="never" class="section-card">
            <template #header>{{ sec.title }}</template>
            <ul class="section-list">
              <li v-for="(item, i) in sec.items" :key="i">{{ item.text }}</li>
            </ul>
          </el-card>
        </el-col>
      </el-row>
    </template>

    <!-- 错误提示 -->
    <el-alert
      v-if="loadError && !report"
      title="报告生成失败"
      type="error"
      show-icon
      :closable="false"
      style="margin-bottom: 16px;"
    >
      <template #default>
        <p style="margin: 4px 0;">{{ loadError }}</p>
      </template>
    </el-alert>
    <el-empty v-else-if="!loading && !report" description="选择时间范围与报告类型后点击「生成报告」" :image-size="100" />

    <!-- 历史生成记录（仅锅炉房数据，与工程部不串联） -->
    <el-card class="history-reports-card" shadow="never" style="margin-top: 20px;">
      <template #header>
        <div class="card-header-flex">
          <span>历史生成记录</span>
          <el-button size="small" @click="loadHistory" :loading="historyLoading">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
      </template>
      <div class="history-filter" style="margin-bottom: 12px; display: flex; gap: 10px; flex-wrap: wrap;">
        <el-date-picker
          v-model="historyFilterMonth"
          type="month"
          placeholder="筛选月份"
          format="YYYY年MM月"
          value-format="YYYY-MM"
          clearable
          style="width: 150px;"
          @change="loadHistory"
        />
        <el-select v-model="historyFilterType" placeholder="报告类型" clearable style="width: 130px;" @change="loadHistory">
          <el-option label="每日简报" value="daily_report" />
          <el-option label="异常诊断" value="anomaly_diagnosis" />
          <el-option label="趋势预测" value="trend_forecast" />
        </el-select>
      </div>
      <el-table :data="historyList" v-loading="historyLoading" stripe size="small" style="width: 100%;">
        <el-table-column label="生成时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="报告月份" width="120">
          <template #default="{ row }">{{ row.timeRangeLabel || row.yearMonth }}</template>
        </el-table-column>
        <el-table-column prop="factoryLabel" label="范围" width="120" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="promptTagType(row.promptType)">{{ promptTypeLabels[row.promptType] || row.promptType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="AI分析" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.hasLLM" type="success" size="small" effect="plain">有</el-tag>
            <el-tag v-else-if="row.llmError" type="warning" size="small" effect="plain">失败</el-tag>
            <el-tag v-else type="info" size="small" effect="plain">无</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdByName" label="生成人" width="100">
          <template #default="{ row }">{{ row.createdByName || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="viewHistoryReport(row)">查看</el-button>
            <el-button size="small" type="success" plain @click="downloadHistoryReport(row)">下载PDF</el-button>
            <el-button v-if="isAdmin" size="small" type="danger" plain @click="deleteHistoryReport(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <!-- 分页 -->
      <div v-if="historyTotal > historyPageSize" style="margin-top: 12px; text-align: right;">
        <el-pagination
          v-model:current-page="historyPage"
          :page-size="historyPageSize"
          :total="historyTotal"
          layout="prev, pager, next"
          small
          @current-change="loadHistory"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Refresh } from '@element-plus/icons-vue'
import { marked } from 'marked'
import dayjs from 'dayjs'
import TimeRangeSelector from '@/components/TimeRangeSelector.vue'
import BoilerParkSelect from '@/components/BoilerParkSelect.vue'

const appStore = useAppStore()
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.user?.role === 'Admin')
const loading = ref(false)
const loadError = ref('')
const report = ref(null)
const timeRange = ref({ mode: 'month', yearMonths: [dayjs().format('YYYY-MM')], label: dayjs().format('YYYY年MM月') })
const promptType = ref('daily_report')
const selectedFactoryId = ref('')
const factoryLabel = ref('锅炉房')

const historyList = ref([])
const historyLoading = ref(false)
const historyPage = ref(1)
const historyPageSize = 10
const historyTotal = ref(0)
const historyFilterMonth = ref('')
const historyFilterType = ref('')

const promptTypeLabels = {
  daily_report: '每日简报',
  anomaly_diagnosis: '异常诊断',
  trend_forecast: '趋势预测',
}
const promptTypeLabel = computed(() => promptTypeLabels[promptType.value] || '每日简报')

const renderedLLM = computed(() => {
  if (!report.value?.llmContent) return ''
  try { return marked(report.value.llmContent) } catch { return report.value.llmContent }
})

function promptTagType(type) {
  return { daily_report: '', anomaly_diagnosis: 'warning', trend_forecast: 'success' }[type] || 'info'
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function onParkChange(parkId) {
  selectedFactoryId.value = parkId || ''
  const parks = appStore.boilerParkNames || {}
  factoryLabel.value = parks[parkId] || '锅炉房'
}

async function loadHistory() {
  historyLoading.value = true
  try {
    const opts = { page: historyPage.value, pageSize: historyPageSize, department: 'boiler' }
    if (historyFilterMonth.value) opts.yearMonth = historyFilterMonth.value
    if (historyFilterType.value) opts.promptType = historyFilterType.value
    const res = await api.listAIReports(opts)
    if (res.ok && res.data) {
      historyList.value = res.data.list || []
      historyTotal.value = res.data.total || 0
    }
  } catch (e) {
    console.error('加载历史报告失败:', e)
  } finally {
    historyLoading.value = false
  }
}

async function viewHistoryReport(row) {
  loading.value = true
  report.value = null
  try {
    const res = await api.getAIReportDetail(row.reportId)
    if (res.ok && res.data?.reportData) {
      report.value = res.data.reportData
      timeRange.value = { mode: 'month', yearMonths: [row.yearMonth], label: row.timeRangeLabel || row.yearMonth }
      promptType.value = row.promptType
      window.scrollTo({ top: 0, behavior: 'smooth' })
      ElMessage.success('已加载历史报告：' + formatTime(row.createdAt))
    } else {
      ElMessage.error(res.error?.message || '加载报告失败')
    }
  } catch (e) {
    ElMessage.error('加载失败：' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

function downloadHistoryReport(row) {
  api.getAIReportDetail(row.reportId).then(res => {
    if (res.ok && res.data?.reportData) {
      const saved = report.value
      report.value = res.data.reportData
      nextTick(() => {
        handleExportPDF()
        report.value = saved
      })
    } else {
      ElMessage.error('加载报告详情失败')
    }
  })
}

async function deleteHistoryReport(row) {
  try {
    await ElMessageBox.confirm(
      `确定要删除这份报告吗？\n${row.factoryLabel} · ${row.timeRangeLabel || row.yearMonth} · ${promptTypeLabels[row.promptType] || row.promptType}`,
      '确认删除',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
    const res = await api.deleteAIReport(row.reportId)
    if (res.ok) {
      ElMessage.success('报告已删除')
      loadHistory()
    } else {
      ElMessage.error(res.error?.message || '删除失败')
    }
  } catch {}
}

function handleExportPDF() {
  if (!report.value) return
  const win = window.open('', '_blank')
  if (!win) { ElMessage.error('请允许弹出窗口'); return }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>锅炉房报告 - ${timeRange.value.label}</title>
<style>body{font-family:sans-serif;padding:24px;color:#303133;} .stat{display:inline-block;margin:8px 16px 8px 0;} .stat-value{font-size:20px;font-weight:600;}</style></head><body>
<h1>锅炉房 AI 分析 · ${timeRange.value.label}</h1>
<p>${(report.value.summaryText || '').replace(/</g, '&lt;')}</p>
<script>setTimeout(function(){window.print();},300);<\/script></body></html>`
  win.document.write(html)
  win.document.close()
}

async function generateReport() {
  loading.value = true
  loadError.value = ''
  report.value = null
  const ym = timeRange.value?.yearMonths?.[0] || dayjs().format('YYYY-MM')
  try {
    const factoryId = selectedFactoryId.value || appStore.currentFactoryId || ''
    const dateStr = dayjs(ym + '-15').format('YYYY-MM-DD')

    const [overviewRes, alertsRes] = await Promise.all([
      api.boilerGetOverview({ date: dateStr, factoryId }),
      api.boilerListAlerts({ factoryId, status: 'all', page: 1, pageSize: 50 }),
    ])

    const s = overviewRes?.data?.summary || {}
    const totalSteam = s.total_steam_production || 0
    const totalUsage = s.total_steam_usage || 0
    const totalElec = s.total_electricity || 0
    const totalWater = s.total_water || 0
    const totalFuel = s.fuel_consumption || 0
    const steamLossRate = totalSteam > 0 ? Math.round((totalSteam - totalUsage) / totalSteam * 100 * 10) / 10 : 0
    const fuelStock = s.fuel_stock || 0
    const avgDailyFuel = totalFuel > 0 ? totalFuel : 10
    const fuelDaysLeft = avgDailyFuel > 0 ? Math.round(fuelStock / avgDailyFuel) : 99

    const fuelPrice = 1.2, elecPrice = 0.75, waterPrice = 5.0
    const fuelCost = Math.round(totalFuel * fuelPrice)
    const elecCost = Math.round(totalElec * elecPrice)
    const waterCost = Math.round(totalWater * waterPrice)
    const totalCost = fuelCost + elecCost + waterCost
    const perSteamCost = totalSteam > 0 ? (totalCost / totalSteam).toFixed(1) : '--'

    const alertList = alertsRes?.data?.list || []
    const openAlerts = alertList.filter(a => a.status === 'open' || a.status === 'OPEN').length

    const stats = {
      totalSteam, totalUsage, totalElec, totalWater, totalFuel,
      steamLossRate, fuelDaysLeft, fuelStock,
      totalCost, perSteamCost, fuelCost, elecCost, waterCost, openAlerts,
    }

    const sections = []
    const prodItems = [
      { text: `总产汽量 ${totalSteam} 吨，总用汽量 ${totalUsage} 吨，汽损率 ${steamLossRate}%。` },
    ]
    if (steamLossRate > 15) prodItems.push({ text: '⚠ 汽损率偏高（>15%），建议检查管道保温和阀门密封。' })
    else if (steamLossRate <= 5) prodItems.push({ text: '✓ 汽损率控制良好（≤5%），管道运行状态优秀。' })
    sections.push({ title: '产汽与用汽', items: prodItems })

    const energyItems = [
      { text: `用电 ${totalElec} kWh，用水 ${totalWater} 吨，燃料消耗 ${totalFuel} 吨。` },
    ]
    if (totalSteam > 0) energyItems.push({ text: `吨汽耗电 ${(totalElec / totalSteam).toFixed(1)} kWh，吨汽耗水 ${(totalWater / totalSteam).toFixed(2)} 吨，吨汽耗燃料 ${(totalFuel / totalSteam).toFixed(3)} 吨。` })
    sections.push({ title: '能耗效率', items: energyItems })

    const costItems = [
      { text: `总成本 ¥${totalCost.toLocaleString()}（燃料 ¥${fuelCost.toLocaleString()} / 电 ¥${elecCost.toLocaleString()} / 水 ¥${waterCost.toLocaleString()}）。` },
      { text: `吨汽成本 ¥${perSteamCost}。` },
    ]
    sections.push({ title: '成本分析', items: costItems })

    const stockItems = [
      { text: `当前燃料库存 ${fuelStock} 吨，按日均消耗估算可用 ${fuelDaysLeft} 天。` },
    ]
    if (fuelDaysLeft < 5) stockItems.push({ text: '⚠ 燃料库存紧张（<5天），请立即安排采购！' })
    else if (fuelDaysLeft < 10) stockItems.push({ text: '燃料库存偏低（<10天），建议尽快采购补充。' })
    else stockItems.push({ text: '✓ 燃料库存充足。' })
    sections.push({ title: '燃料库存', items: stockItems })

    if (openAlerts > 0) sections.push({ title: '预警情况', items: [{ text: `当前有 ${openAlerts} 条未处理预警，建议及时排查处理。` }] })

    const summaryText = `${timeRange.value.label} 总产汽 ${totalSteam} 吨，总成本 ¥${totalCost.toLocaleString()}，吨汽成本 ¥${perSteamCost}，汽损率 ${steamLossRate}%，燃料可用 ${fuelDaysLeft} 天。${openAlerts > 0 ? ` 有 ${openAlerts} 条预警待处理。` : ''}`

    const reportData = { stats, sections, summaryText, llmContent: null }
    report.value = reportData

    await api.saveBoilerAIReport({
      factoryId,
      factoryLabel: factoryLabel.value,
      yearMonth: ym,
      promptType: promptType.value,
      reportData,
    })
    loadHistory()
    ElMessage.success('报告已生成')
  } catch (e) {
    console.error('[Boiler AI Report]', e)
    loadError.value = e.message || '未知错误'
    ElMessage.error('生成失败：' + loadError.value)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadHistory()
})
</script>

<style lang="scss" scoped>
.page-header {
  display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;
  h2 { margin: 0; }
  .header-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-left: auto; }
}

.stat-row {
  margin-bottom: 16px;
  .stat-card {
    background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.06);
    .stat-value { font-size: 22px; font-weight: 600; color: #303133; }
    .stat-label { font-size: 13px; color: #909399; margin-top: 4px; }
    .unit { font-size: 13px; font-weight: 400; color: #909399; }
    &.kpi-highlight { border-left: 3px solid #E65100; }
    &.kpi-cost { border-left: 3px solid #F56C6C; }
    &.stat-warn .stat-value { color: #E6A23C; }
    &.stat-danger .stat-value { color: #F56C6C; }
  }
}

.card-header-flex { display: flex; align-items: center; justify-content: space-between; }

.llm-card {
  margin-bottom: 16px; border-left: 3px solid #E65100;
  .llm-content {
    line-height: 1.8; color: #303133; font-size: 14px;
    :deep(h1) { font-size: 20px; margin: 16px 0 8px; border-bottom: 1px solid #ebeef5; padding-bottom: 6px; }
    :deep(h2) { font-size: 17px; margin: 14px 0 6px; }
    :deep(h3) { font-size: 15px; margin: 12px 0 4px; }
    :deep(ul), :deep(ol) { padding-left: 20px; margin: 6px 0; }
    :deep(li) { margin: 2px 0; }
    :deep(table) { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 13px;
      th, td { border: 1px solid #dcdfe6; padding: 6px 10px; text-align: left; }
      th { background: #f5f7fa; }
    }
    :deep(blockquote) { margin: 8px 0; padding: 8px 16px; border-left: 3px solid #E65100; background: #fff7ed; color: #606266; }
    :deep(p) { margin: 6px 0; }
  }
}

.summary-card {
  margin-bottom: 16px;
  .summary-text { margin: 0; line-height: 1.7; color: #303133; }
}

.sections-row {
  margin-bottom: 16px;
  .section-card { margin-bottom: 16px; }
  .section-list { margin: 0; padding-left: 20px; color: #606266; font-size: 14px; line-height: 1.8; }
}

.history-reports-card { margin-top: 20px; }
</style>
