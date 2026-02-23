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
        <TimeRangeSelector v-model="timeRange" style="margin-left: 12px;" />
        <!-- 报告类型 -->
        <el-select v-model="promptType" placeholder="报告类型" style="width: 130px; margin-left: 8px;">
          <el-option label="月度总结" value="monthly_summary" />
          <el-option label="设备分析" value="device_analysis" />
          <el-option label="成本分析" value="cost_analysis" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="loadReport" style="margin-left: 12px;">
          生成报告
        </el-button>
        <el-button v-if="report" type="success" plain @click="handleExportPDF" style="margin-left: 8px;">
          导出 PDF
        </el-button>
      </div>
    </div>

    <template v-if="report">
      <!-- 1. 总览数字卡 -->
      <el-row :gutter="16" class="stat-row">
        <el-col :xs="24" :sm="12" :md="8" :lg="4"><div class="stat-card"><div class="stat-value">{{ report.stats.totalLogs }}</div><div class="stat-label">更换次数</div></div></el-col>
        <el-col :xs="24" :sm="12" :md="8" :lg="4"><div class="stat-card"><div class="stat-value">{{ report.stats.totalPartsQty }}</div><div class="stat-label">配件消耗</div></div></el-col>
        <el-col :xs="24" :sm="12" :md="8" :lg="4">
          <div class="stat-card" :class="{ 'stat-danger': report.stats.openAlerts > 0 }">
            <div class="stat-value">{{ report.stats.openAlerts }}</div><div class="stat-label">待处理报警</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8" :lg="4"><div class="stat-card"><div class="stat-value">¥{{ (report.stats.totalUsageCost || 0).toLocaleString() }}</div><div class="stat-label">使用成本</div></div></el-col>
        <el-col :xs="24" :sm="12" :md="8" :lg="4">
          <div class="stat-card" :class="{ 'stat-warn': report.stats.lowStockCount > 0 }">
            <div class="stat-value">{{ report.stats.lowStockCount || 0 }}</div><div class="stat-label">低库存预警</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8" :lg="4"><div class="stat-card"><div class="stat-value">{{ report.stats.engineerWorkload?.length || 0 }}</div><div class="stat-label">活跃工程师</div></div></el-col>
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
          <el-col :xs="24" :md="12">
            <div ref="chartHistoryRef" class="chart-box"></div>
          </el-col>
          <el-col :xs="24" :md="12">
            <ul class="section-list">
              <li v-for="(item, i) in historySection?.items" :key="i">{{ item.text }}</li>
            </ul>
          </el-col>
        </el-row>
      </el-card>

      <!-- LLM AI 分析报告（如果有） -->
      <el-card v-if="report.llmContent" class="llm-card" shadow="never">
        <template #header>
          <div class="card-header-flex">
            <span>
              <el-icon style="vertical-align: -2px; margin-right: 4px;"><MagicStick /></el-icon>
              AI 智能分析
            </span>
            <el-tag type="success" size="small" effect="plain">{{ promptTypeLabel }}</el-tag>
          </div>
        </template>
        <div class="llm-content markdown-body" v-html="renderedLLM"></div>
      </el-card>

      <!-- LLM 错误提示 -->
      <el-alert
        v-if="report.llmError"
        :title="'AI 分析生成失败：' + report.llmError"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 16px;"
        description="已回退到规则模板报告。请检查 AI 设置中的 API 地址、Key 和模型配置。"
      />

      <!-- 3. 模板文字摘要 -->
      <el-card class="summary-card" shadow="never">
        <template #header>
          <div class="card-header-flex">
            <span>{{ report.factoryLabel }} · {{ timeRange.label }} 报告摘要</span>
            <el-tag v-if="!report.llmContent" type="info" size="small" effect="plain">规则模板</el-tag>
          </div>
        </template>
        <p class="summary-text">{{ report.summaryText }}</p>
      </el-card>

      <!-- 4-8. 各维度分析卡片 -->
      <el-row :gutter="16" class="sections-row">
        <el-col v-for="sec in otherSections" :key="sec.title" :xs="24" :md="12">
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
        <el-col :xs="24" :md="12">
          <el-card shadow="never">
            <template #header>配件消耗 TOP 5</template>
            <div ref="chartPartsRef" class="chart-box"></div>
            <el-empty v-if="!report.stats.topParts?.length" description="暂无数据" :image-size="60" />
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
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

    <!-- 错误提示 -->
    <el-alert
      v-if="loadError && !report"
      :title="'报告生成失败'"
      type="error"
      show-icon
      :closable="false"
      style="margin-bottom: 16px;"
    >
      <template #default>
        <p style="margin: 4px 0;">{{ loadError }}</p>
        <p style="margin: 4px 0; color: #909399; font-size: 12px;">
          常见原因：1) 云函数超时（LLM调用耗时较长）；2) API Key 或 API 地址配置错误；3) 网络问题。
          请到「设置 > AI 分析设置」检查配置，或暂时清空 API Key 以使用纯模板报告。
        </p>
      </template>
    </el-alert>
    <el-empty v-else-if="!loading && !report" description="选择月份与范围后点击「生成报告」" :image-size="100" />

    <!-- 历史报告记录 -->
    <el-card class="history-reports-card" shadow="never" style="margin-top: 20px;">
      <template #header>
        <div class="card-header-flex">
          <span>历史生成记录</span>
          <el-button size="small" @click="loadHistory" :loading="historyLoading">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
      </template>

      <!-- 筛选栏 -->
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
          <el-option label="月度总结" value="monthly_summary" />
          <el-option label="设备分析" value="device_analysis" />
          <el-option label="成本分析" value="cost_analysis" />
        </el-select>
      </div>

      <el-table :data="historyList" v-loading="historyLoading" stripe size="small" style="width: 100%;">
        <el-table-column label="生成时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="yearMonth" label="报告月份" width="100" />
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
        <el-table-column prop="createdByName" label="生成人" width="100" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="viewHistoryReport(row)">查看</el-button>
            <el-button size="small" type="success" plain @click="downloadHistoryReport(row)">下载PDF</el-button>
            <el-button
              v-if="isAdmin"
              size="small"
              type="danger"
              plain
              @click="deleteHistoryReport(row)"
            >删除</el-button>
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

      <el-empty v-if="!historyLoading && historyList.length === 0" description="暂无历史报告" :image-size="60" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/utils/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Refresh } from '@element-plus/icons-vue'
import echarts from '@/utils/echarts'
import { marked } from 'marked'
import TimeRangeSelector from '@/components/TimeRangeSelector.vue'
import dayjs from 'dayjs'

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
})

const authStore = useAuthStore()
const isAdmin = computed(() => authStore.user?.role === 'Admin')
const currentFactoryId = computed(() => authStore.user?.role === 'Supervisor' ? authStore.user?.factoryId : null)

const loading = ref(false)
const timeRange = ref({ mode: 'month', yearMonths: [dayjs().format('YYYY-MM')], label: dayjs().format('YYYY年MM月') })
const reportScope = ref('factory')
const selectedFactoryId = ref('')
const factoryOptions = ref([])
const report = ref(null)
const promptType = ref('monthly_summary')
const loadError = ref('')

const chartPartsRef = ref()
const chartAssetsRef = ref()
const chartHistoryRef = ref()
let chartParts = null
let chartAssets = null
let chartHistory = null

const promptTypeLabels = {
  monthly_summary: '月度总结',
  device_analysis: '设备分析',
  cost_analysis: '成本分析',
}
const promptTypeLabel = computed(() => promptTypeLabels[report.value?.promptType] || '月度总结')

// LLM Markdown 渲染
const renderedLLM = computed(() => {
  if (!report.value?.llmContent) return ''
  try {
    return marked(report.value.llmContent)
  } catch {
    return report.value.llmContent
  }
})

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
  if (res.ok && res.data?.list) {
    factoryOptions.value = res.data.list
    // 如果只有一个工厂，自动选中
    if (factoryOptions.value.length === 1 && !selectedFactoryId.value) {
      selectedFactoryId.value = factoryOptions.value[0].factoryId
    }
  }
}

function onScopeChange() {
  report.value = null
}

async function loadReport() {
  const fid = isAdmin.value
    ? (reportScope.value === 'factory' ? selectedFactoryId.value : undefined)
    : currentFactoryId.value

  if (reportScope.value === 'factory' && !fid && isAdmin.value) {
    // 没选工厂时，自动切换为全部汇总
    if (factoryOptions.value.length > 0) {
      ElMessage.info('未选择工厂，已自动切换为「全部汇总」模式')
      reportScope.value = 'summary'
    } else {
      ElMessage.info('尚无工厂数据，将生成全局报告')
    }
  }
  loading.value = true
  report.value = null
  loadError.value = ''
  try {
    const actualScope = isAdmin.value ? reportScope.value : 'factory'
    const actualFid = actualScope === 'summary' ? undefined : (fid || undefined)
    const t = timeRange.value
    const tp = (t.mode === 'month' && t.yearMonths?.length === 1) ? { yearMonth: t.yearMonths[0] } : { yearMonths: t.yearMonths }
    const res = await api.getAIReport({
      ...tp,
      factoryId: actualFid,
      scope: actualScope,
      promptType: promptType.value,
    })
    console.log('[AI Report] response:', res)
    if (res.ok && res.data) {
      report.value = res.data
      loadError.value = ''
      await nextTick()
      renderCharts()
      // 刷新历史列表（新报告已自动保存）
      loadHistory()
    } else {
      const errMsg = res.error?.message || (typeof res === 'string' ? res.slice(0, 200) : '生成报告失败，请检查网络或稍后重试')
      loadError.value = errMsg
      ElMessage.error({ message: errMsg, duration: 8000 })
    }
  } catch (e) {
    console.error('[AI Report] error:', e)
    loadError.value = '请求异常: ' + (e.message || String(e))
    ElMessage.error({ message: loadError.value, duration: 8000 })
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

// ====== 导出 PDF ======
function handleExportPDF() {
  if (!report.value) return

  const stats = report.value.stats
  const prev = report.value.prevStats || {}
  const ptLabel = promptTypeLabels[report.value.promptType] || '月度总结'

  // 获取图表图片
  let historyChartImg = ''
  let partsChartImg = ''
  let assetsChartImg = ''
  try { if (chartHistory) historyChartImg = chartHistory.getDataURL({ type: 'png', pixelRatio: 2 }) } catch (e) { /* ignore */ }
  try { if (chartParts) partsChartImg = chartParts.getDataURL({ type: 'png', pixelRatio: 2 }) } catch (e) { /* ignore */ }
  try { if (chartAssets) assetsChartImg = chartAssets.getDataURL({ type: 'png', pixelRatio: 2 }) } catch (e) { /* ignore */ }

  // 构建统计卡片 HTML
  const statCards = [
    { label: '更换次数', value: stats.totalLogs },
    { label: '配件消耗', value: stats.totalPartsQty },
    { label: '待处理报警', value: stats.openAlerts, danger: stats.openAlerts > 0 },
    { label: '使用成本', value: '¥' + (stats.totalUsageCost || 0).toLocaleString() },
    { label: '低库存预警', value: stats.lowStockCount || 0, warn: (stats.lowStockCount || 0) > 0 },
    { label: '活跃工程师', value: stats.engineerWorkload?.length || 0 },
  ]

  const statCardsHtml = statCards.map(c => {
    const color = c.danger ? '#F56C6C' : c.warn ? '#E6A23C' : '#303133'
    return `<div style="flex:1;text-align:center;padding:12px 8px;background:#f5f7fa;border-radius:6px;">
      <div style="font-size:20px;font-weight:600;color:${color};">${c.value}</div>
      <div style="font-size:12px;color:#909399;margin-top:4px;">${c.label}</div>
    </div>`
  }).join('')

  // 构建模板分析 sections
  const sectionsHtml = (report.value.sections || []).map(sec => {
    const items = (sec.items || []).map(i => `<li>${escapeHtml(i.text)}</li>`).join('')
    return `<div style="margin-bottom:16px;"><h3 style="margin:0 0 6px;font-size:15px;color:#303133;">${escapeHtml(sec.title)}</h3><ul style="margin:0;padding-left:20px;color:#606266;font-size:13px;line-height:1.8;">${items}</ul></div>`
  }).join('')

  // 构建各工厂对比表
  let factoryTableHtml = ''
  if (report.value.byFactory?.length) {
    const rows = report.value.byFactory.map(f =>
      `<tr><td>${escapeHtml(f.factoryName)}</td><td>${f.totalLogs}</td><td>${f.totalPartsQty}</td><td>${f.openAlerts}</td><td>¥${(f.totalUsageCost || 0).toLocaleString()}</td><td>${f.lowStockCount || 0}</td></tr>`
    ).join('')
    factoryTableHtml = `
      <h2 style="font-size:16px;margin:20px 0 8px;">各工厂横向对比</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f5f7fa;">
          <th style="border:1px solid #dcdfe6;padding:6px 10px;text-align:left;">工厂</th>
          <th style="border:1px solid #dcdfe6;padding:6px 10px;">更换次数</th>
          <th style="border:1px solid #dcdfe6;padding:6px 10px;">配件消耗</th>
          <th style="border:1px solid #dcdfe6;padding:6px 10px;">OPEN报警</th>
          <th style="border:1px solid #dcdfe6;padding:6px 10px;">使用成本</th>
          <th style="border:1px solid #dcdfe6;padding:6px 10px;">低库存</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`
  }

  // 历史环比
  const logsPct = report.value.history?.logsPct || 0
  const partsPct = report.value.history?.partsPct || 0

  // 完整 HTML
  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${escapeHtml(report.value.factoryLabel)} - ${timeRange.value.label} ${ptLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif; color: #303133; padding: 30px 40px; font-size: 14px; line-height: 1.6; }
  h1 { font-size: 22px; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; color: #909399; font-size: 13px; margin-bottom: 20px; }
  .stat-row { display: flex; gap: 10px; margin-bottom: 20px; }
  .section-title { font-size: 16px; font-weight: 600; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ebeef5; }
  .chart-row { display: flex; gap: 16px; margin: 16px 0; }
  .chart-row img { width: 48%; max-height: 220px; object-fit: contain; }
  .summary-box { background: #f5f7fa; border-radius: 6px; padding: 12px 16px; margin: 12px 0; font-size: 14px; line-height: 1.7; }
  .llm-section { margin: 16px 0; padding: 16px; border-left: 3px solid #67C23A; background: #fafafa; border-radius: 0 6px 6px 0; }
  .llm-section h1 { font-size: 18px; text-align: left; margin: 14px 0 6px; border-bottom: 1px solid #ebeef5; padding-bottom: 4px; }
  .llm-section h2 { font-size: 16px; margin: 12px 0 4px; }
  .llm-section h3 { font-size: 14px; margin: 10px 0 4px; }
  .llm-section ul, .llm-section ol { padding-left: 20px; margin: 4px 0; }
  .llm-section li { margin: 2px 0; }
  .llm-section table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
  .llm-section table th, .llm-section table td { border: 1px solid #dcdfe6; padding: 5px 8px; text-align: left; }
  .llm-section table th { background: #f5f7fa; }
  .llm-section blockquote { margin: 8px 0; padding: 8px 14px; border-left: 3px solid #409EFF; background: #f0f5ff; color: #606266; }
  .llm-section p { margin: 4px 0; }
  .footer { margin-top: 30px; text-align: center; color: #c0c4cc; font-size: 11px; border-top: 1px solid #ebeef5; padding-top: 10px; }
  @media print {
    body { padding: 15px 20px; }
    .llm-section { break-inside: avoid; }
  }
</style>
</head><body>

<h1>${escapeHtml(report.value.factoryLabel)} · ${timeRange.value.label} ${ptLabel}</h1>
<div class="subtitle">生成时间：${new Date().toLocaleString('zh-CN')} &nbsp;|&nbsp; 更换环比 ${logsPct >= 0 ? '+' : ''}${logsPct}% &nbsp;|&nbsp; 配件环比 ${partsPct >= 0 ? '+' : ''}${partsPct}%</div>

<div class="stat-row">${statCardsHtml}</div>

${historyChartImg ? `<div class="section-title">历史对比与趋势</div><div style="text-align:center;"><img src="${historyChartImg}" style="max-width:100%;max-height:240px;"></div>` : ''}

${report.value.llmContent ? `
<div class="section-title">AI 智能分析（${ptLabel}）</div>
<div class="llm-section">${renderedLLM.value}</div>
` : ''}

<div class="section-title">报告摘要</div>
<div class="summary-box">${escapeHtml(report.value.summaryText)}</div>

<div class="section-title">详细分析</div>
${sectionsHtml}

${(partsChartImg || assetsChartImg) ? `
<div class="section-title">配件与设备 TOP 5</div>
<div class="chart-row">
  ${partsChartImg ? `<img src="${partsChartImg}">` : ''}
  ${assetsChartImg ? `<img src="${assetsChartImg}">` : ''}
</div>
` : ''}

${factoryTableHtml}

<div class="footer">本报告由康洁工程部智能维保系统自动生成</div>

<script>window.onload = function() { setTimeout(function() { window.print(); }, 300); }<\/script>
</body></html>`

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  } else {
    ElMessage.error('无法打开新窗口，请允许弹出窗口后重试')
  }
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ====== 历史报告记录 ======
const historyList = ref([])
const historyLoading = ref(false)
const historyPage = ref(1)
const historyPageSize = 10
const historyTotal = ref(0)
const historyFilterMonth = ref('')
const historyFilterType = ref('')

function promptTagType(type) {
  return { monthly_summary: '', device_analysis: 'warning', cost_analysis: 'danger' }[type] || 'info'
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function loadHistory() {
  historyLoading.value = true
  try {
    const opts = { page: historyPage.value, pageSize: historyPageSize }
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
  loadError.value = ''
  try {
    const res = await api.getAIReportDetail(row.reportId)
    if (res.ok && res.data?.reportData) {
      report.value = res.data.reportData
      // 更新当前选择器状态以匹配历史报告
      timeRange.value = { mode: 'month', yearMonths: [row.yearMonth], label: row.yearMonth }
      promptType.value = row.promptType
      if (row.scope === 'summary') {
        reportScope.value = 'summary'
      } else {
        reportScope.value = 'factory'
        selectedFactoryId.value = row.factoryId || ''
      }
      await nextTick()
      renderCharts()
      // 滚动到页面顶部
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
  // 先加载报告详情再导出PDF
  api.getAIReportDetail(row.reportId).then(res => {
    if (res.ok && res.data?.reportData) {
      const savedReport = report.value
      report.value = res.data.reportData
      nextTick(() => {
        handleExportPDF()
        // 恢复之前的报告
        report.value = savedReport
      })
    } else {
      ElMessage.error('加载报告详情失败')
    }
  })
}

async function deleteHistoryReport(row) {
  try {
    await ElMessageBox.confirm(
      `确定要删除这份报告吗？\n${row.factoryLabel} · ${row.yearMonth} · ${promptTypeLabels[row.promptType] || row.promptType}`,
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

onMounted(() => {
  loadFactoryOptions()
  loadHistory()
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

// LLM AI 分析卡片
.llm-card {
  margin-bottom: 16px;
  border-left: 3px solid #67C23A;

  .llm-content {
    line-height: 1.8;
    color: #303133;
    font-size: 14px;

    :deep(h1) { font-size: 20px; margin: 16px 0 8px; border-bottom: 1px solid #ebeef5; padding-bottom: 6px; }
    :deep(h2) { font-size: 17px; margin: 14px 0 6px; }
    :deep(h3) { font-size: 15px; margin: 12px 0 4px; }
    :deep(ul), :deep(ol) { padding-left: 20px; margin: 6px 0; }
    :deep(li) { margin: 2px 0; }
    :deep(strong) { color: #303133; }
    :deep(table) {
      border-collapse: collapse;
      width: 100%;
      margin: 8px 0;
      font-size: 13px;
      th, td {
        border: 1px solid #dcdfe6;
        padding: 6px 10px;
        text-align: left;
      }
      th { background: #f5f7fa; font-weight: 600; }
    }
    :deep(blockquote) {
      margin: 8px 0;
      padding: 8px 16px;
      border-left: 3px solid #409EFF;
      background: #f5f7fa;
      color: #606266;
    }
    :deep(code) {
      background: #f5f7fa;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 13px;
    }
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

.history-reports-card {
  margin-bottom: 16px;
}
</style>
