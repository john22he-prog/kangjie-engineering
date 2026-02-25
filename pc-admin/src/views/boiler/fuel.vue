<template>
  <div class="page-container boiler-fuel">
    <div class="page-header">
      <h2>燃料管理</h2>
      <div class="header-actions">
        <BoilerParkSelect @change="loadAll" />
        <el-button type="primary" @click="showInboundDialog">
          <el-icon><Plus /></el-icon>新增入库
        </el-button>
        <el-button @click="entryRef?.open()">
          <el-icon><Edit /></el-icon>录入数据
        </el-button>
      </div>
    </div>

    <div v-loading="loading">
      <!-- 库存概览卡片 -->
      <el-row :gutter="16" class="summary-row">
        <el-col :xs="12" :sm="6">
          <div class="summary-card">
            <div class="sc-value">{{ summary.currentWeight ?? '--' }} <span class="sc-unit">吨</span></div>
            <div class="sc-label">当前库存</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6">
          <div class="summary-card">
            <div class="sc-value">¥{{ summary.avgPrice ?? '--' }} <span class="sc-unit">/吨</span></div>
            <div class="sc-label">加权均价</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6">
          <div class="summary-card">
            <div class="sc-value">¥{{ summary.totalValue?.toLocaleString() ?? '--' }}</div>
            <div class="sc-label">库存金额</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="6">
          <div class="summary-card" :class="{ 'sc-warn': summary.stockDays < 3 }">
            <div class="sc-value">{{ summary.stockDays ?? '--' }} <span class="sc-unit">天</span></div>
            <div class="sc-label">预计可用</div>
            <div class="sc-sub" v-if="summary.avgDailyConsumption">日均消耗 {{ summary.avgDailyConsumption }} 吨</div>
          </div>
        </el-col>
      </el-row>

      <!-- 入库流水 + 消耗流水 -->
      <el-row :gutter="16">
        <el-col :xs="24" :md="14">
          <el-card shadow="never" class="section-card">
            <template #header>
              <div class="card-header">
                <span class="card-title">入库流水</span>
                <el-date-picker v-model="inboundDateRange" type="daterange" start-placeholder="开始" end-placeholder="结束"
                  format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width:240px" @change="loadInbound" size="small" />
              </div>
            </template>
            <el-table :data="inboundList" stripe size="small" max-height="400">
              <el-table-column prop="date" label="日期" width="100" />
              <el-table-column prop="supplier" label="供应商" width="100" />
              <el-table-column prop="weight" label="重量(吨)" width="90" align="right" />
              <el-table-column prop="unit_price" label="单价(元)" width="90" align="right" />
              <el-table-column label="金额(元)" width="100" align="right">
                <template #default="{ row }">¥{{ row.total_price?.toLocaleString() }}</template>
              </el-table-column>
              <el-table-column prop="note" label="备注" min-width="100" />
              <el-table-column label="" width="60" fixed="right">
                <template #default="{ row }">
                  <el-popconfirm title="确定删除此入库记录？" @confirm="deleteInbound(row.id)">
                    <template #reference>
                      <el-button link type="danger" size="small">删除</el-button>
                    </template>
                  </el-popconfirm>
                </template>
              </el-table-column>
            </el-table>
            <div class="table-footer" v-if="inboundTotal > inboundList.length">
              <el-pagination :current-page="inboundPage" :page-size="20" :total="inboundTotal"
                layout="prev, pager, next" @current-change="onInboundPage" size="small" />
            </div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="10">
          <el-card shadow="never" class="section-card">
            <template #header><span class="card-title">近7日消耗</span></template>
            <el-table :data="summary.consumption || []" stripe size="small" max-height="400">
              <el-table-column prop="date" label="日期" width="100" />
              <el-table-column prop="consumed" label="消耗(吨)" width="90" align="right" />
              <el-table-column label="费用(元)" width="100" align="right">
                <template #default="{ row }">¥{{ row.cost?.toLocaleString() }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <!-- 库存趋势 -->
      <el-card shadow="never" class="section-card" style="margin-top:16px">
        <template #header><span class="card-title">库存变化趋势</span></template>
        <div ref="chartRef" class="stock-chart"></div>
      </el-card>
    </div>

    <!-- 新增入库弹窗 -->
    <el-dialog v-model="inboundVisible" title="新增燃料入库" width="500px" align-center :close-on-click-modal="false">
      <el-form :model="inboundForm" label-width="90px">
        <el-form-item label="日期">
          <el-date-picker v-model="inboundForm.date" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="供应商">
          <el-select v-model="inboundForm.supplier" filterable allow-create placeholder="选择或输入" style="width:100%">
            <el-option v-for="s in suppliers" :key="s.name" :label="s.name" :value="s.name" />
          </el-select>
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="重量(吨)">
              <el-input-number v-model="inboundForm.weight" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单价(元)">
              <el-input-number v-model="inboundForm.unit_price" :min="0" :precision="0" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <div class="inbound-calc" v-if="inboundForm.weight > 0 && inboundForm.unit_price > 0">
          本批金额：<b>¥{{ (inboundForm.weight * inboundForm.unit_price).toLocaleString() }}</b>
        </div>
        <el-form-item label="备注">
          <el-input v-model="inboundForm.note" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="inboundVisible = false">取消</el-button>
        <el-button type="primary" :loading="inboundSubmitting" @click="submitInbound">确定入库</el-button>
      </template>
    </el-dialog>

    <BoilerEntryDialog ref="entryRef" @submitted="loadAll" />
  </div>
</template>

<script setup>
import BoilerParkSelect from '@/components/BoilerParkSelect.vue'
import BoilerEntryDialog from '@/components/BoilerEntryDialog.vue'
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import { api } from '@/utils/api'
import { ElMessage } from 'element-plus'
import echarts from '@/utils/echarts'
import dayjs from 'dayjs'
import { Plus, Edit } from '@element-plus/icons-vue'

const appStore = useAppStore()
const loading = ref(false)
const entryRef = ref(null)
const chartRef = ref(null)
let chartInstance = null

const summary = ref({})
const suppliers = ref([])
const inboundList = ref([])
const inboundTotal = ref(0)
const inboundPage = ref(1)
const inboundDateRange = ref([])

const inboundVisible = ref(false)
const inboundSubmitting = ref(false)
const inboundForm = ref({ date: dayjs().format('YYYY-MM-DD'), supplier: '', weight: 0, unit_price: 0, note: '' })

function showInboundDialog() {
  inboundForm.value = { date: dayjs().format('YYYY-MM-DD'), supplier: '', weight: 0, unit_price: 0, note: '' }
  inboundVisible.value = true
}

async function submitInbound() {
  const f = inboundForm.value
  if (!f.weight || f.weight <= 0) { ElMessage.warning('请输入重量'); return }
  if (!f.unit_price || f.unit_price <= 0) { ElMessage.warning('请输入单价'); return }
  inboundSubmitting.value = true
  try {
    const factoryId = appStore.currentFactoryId
    const res = await api.boilerFuelInbound({ ...f, factoryId })
    if (res.ok) {
      ElMessage.success('入库成功')
      inboundVisible.value = false
      loadAll()
    } else {
      ElMessage.error(res.error?.message || '入库失败')
    }
  } catch (err) { ElMessage.error('入库失败: ' + err.message) }
  finally { inboundSubmitting.value = false }
}

async function deleteInbound(id) {
  try {
    const res = await api.boilerDeleteFuelInbound(id)
    if (res.ok) { ElMessage.success('已删除'); loadAll() }
    else ElMessage.error(res.error?.message || '删除失败')
  } catch (err) { ElMessage.error(err.message) }
}

function onInboundPage(p) { inboundPage.value = p; loadInbound() }

async function loadInbound() {
  const factoryId = appStore.currentFactoryId
  if (!factoryId) return
  const params = { factoryId, page: inboundPage.value, pageSize: 20 }
  if (inboundDateRange.value?.length === 2) {
    params.startDate = inboundDateRange.value[0]
    params.endDate = inboundDateRange.value[1]
  }
  try {
    const res = await api.boilerListFuelInbound(params)
    if (res.ok) {
      inboundList.value = res.data?.list || []
      inboundTotal.value = res.data?.total || 0
    }
  } catch (e) { /* ignore */ }
}

async function loadSummary() {
  const factoryId = appStore.currentFactoryId
  if (!factoryId) return
  try {
    const [sumRes, cfgRes] = await Promise.all([
      api.boilerGetFuelSummary({ factoryId }),
      api.boilerGetConfig(factoryId),
    ])
    if (sumRes.ok) summary.value = sumRes.data || {}
    if (cfgRes.ok) suppliers.value = cfgRes.data?.suppliers || []
  } catch (e) { /* ignore */ }
}

async function loadAll() {
  loading.value = true
  try {
    await Promise.all([loadSummary(), loadInbound()])
    await nextTick()
    renderChart()
  } finally { loading.value = false }
}

function renderChart() {
  if (!chartRef.value) return
  if (!chartInstance) chartInstance = echarts.init(chartRef.value)
  const consumption = (summary.value.consumption || []).slice().reverse()
  if (!consumption.length) { chartInstance.clear(); return }
  const dates = consumption.map(c => c.date.slice(5))
  const consumed = consumption.map(c => c.consumed)
  chartInstance.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: dates },
    yAxis: { type: 'value', name: '吨' },
    series: [
      { name: '日消耗', type: 'bar', data: consumed, itemStyle: { color: '#E6A23C' }, barWidth: '40%' },
    ],
  })
}

function onResize() { chartInstance?.resize() }
onMounted(() => { loadAll(); window.addEventListener('resize', onResize) })
onBeforeUnmount(() => { window.removeEventListener('resize', onResize); chartInstance?.dispose() })
</script>

<style lang="scss" scoped>
.boiler-fuel {
  .header-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

  .summary-row { margin-bottom: 16px; .el-col { margin-bottom: 12px; } }
  .summary-card {
    background: #fff; border-radius: 12px; padding: 20px; text-align: center;
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
    &.sc-warn { border: 2px solid #F56C6C; background: #fef0f0; }
  }
  .sc-value { font-size: 24px; font-weight: 700; color: #303133; }
  .sc-unit { font-size: 14px; font-weight: 400; color: #909399; }
  .sc-label { font-size: 13px; color: #909399; margin-top: 4px; }
  .sc-sub { font-size: 11px; color: #b0b4bb; margin-top: 4px; }

  .section-card { border-radius: 12px; margin-bottom: 16px; }
  .card-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .card-title { font-weight: 600; font-size: 15px; }
  .table-footer { display: flex; justify-content: flex-end; padding-top: 12px; }

  .stock-chart { height: 260px; }

  .inbound-calc {
    padding: 10px 14px; margin-bottom: 12px;
    background: #fff7e6; border: 1px solid #ffe0b2; border-radius: 8px;
    font-size: 14px; color: #303133;
    b { color: #E65100; font-weight: 700; }
  }
}
</style>
