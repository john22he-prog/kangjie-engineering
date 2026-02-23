<template>
  <div class="page-container">
    <div class="page-header">
      <h2>{{ moduleLabel }}记录</h2>
      <div class="header-actions">
        <el-button type="primary" @click="openAddDialog">
          <el-icon><Plus /></el-icon>新增记录
        </el-button>
        <el-button @click="handleExport" :loading="exporting">
          <el-icon><Download /></el-icon>导出 Excel
        </el-button>
      </div>
    </div>

    <div class="filter-bar">
      <TimeRangeSelector v-model="timeRange" />
      <el-select v-model="filterType" placeholder="类型" clearable style="width: 120px" @change="loadList">
        <el-option label="维修" value="维修" />
        <el-option label="领用" value="领用" />
        <el-option label="更换" value="更换" />
      </el-select>
    </div>

    <!-- 出库汇总 -->
    <div class="summary-cards" v-if="outboundSummary">
      <div class="summary-card">
        <div class="summary-label">出库总数量</div>
        <div class="summary-value summary-blue">{{ outboundSummary.totalQty }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">出库总金额</div>
        <div class="summary-value summary-orange">¥{{ outboundSummary.totalCost?.toLocaleString() }}</div>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column label="日期时间" width="160">
        <template #default="{ row }">
          {{ formatTime(row.ts) }}
        </template>
      </el-table-column>
      <el-table-column prop="type" label="类型" width="80">
        <template #default="{ row }">
          <el-tag :type="typeTagType(row.type)" size="small">{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="物品明细" min-width="260">
        <template #default="{ row }">
          <div v-for="item in row.items" :key="item.partSkuId" class="item-line">
            <span>{{ item.partNameSnapshot }}</span>
            <span v-if="item.specModelSnapshot" class="spec-text">{{ item.specModelSnapshot }}</span>
            <el-tag size="small" type="info" class="qty-tag">x{{ item.qty }}</el-tag>
            <span v-if="item.unitCost" class="cost-text">¥{{ item.itemCost?.toFixed(2) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="金额" width="110">
        <template #default="{ row }">
          <span v-if="row.totalRepairCost > 0" class="cost-value">¥{{ row.totalRepairCost.toFixed(2) }}</span>
          <span v-else class="no-cost">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="reporterNameSnapshot" label="操作人" width="100" />
      <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
    </el-table>

    <div class="pagination-wrap">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="loadList"
      />
    </div>

    <!-- 新增记录弹窗 -->
    <el-dialog v-model="addDialogVisible" :title="`新增${moduleLabel}记录`" width="640px" :close-on-click-modal="false">
      <el-form :model="form" label-width="80px">
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 200px">
            <el-option label="维修" value="维修" />
            <el-option label="领用" value="领用" />
            <el-option label="更换" value="更换" />
          </el-select>
        </el-form-item>

        <el-form-item label="物品">
          <div style="width: 100%">
            <div v-for="(item, idx) in form.items" :key="idx" class="add-item-row">
              <el-select
                v-model="item.partSkuId"
                filterable
                placeholder="搜索选择配件"
                style="flex: 1"
                @change="(val) => onPartSelect(idx, val)"
              >
                <el-option
                  v-for="p in allParts"
                  :key="p.partSkuId"
                  :label="`${p.partName}${p.specModel ? ' (' + p.specModel + ')' : ''}`"
                  :value="p.partSkuId"
                />
              </el-select>
              <el-input-number v-model="item.qty" :min="1" :max="99" size="default" style="width: 110px" />
              <el-button type="danger" text size="small" @click="form.items.splice(idx, 1)" :disabled="form.items.length <= 1">
                删除
              </el-button>
            </div>
            <el-button type="primary" text size="small" @click="addFormItem">+ 添加物品</el-button>
          </div>
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { ElMessage } from 'element-plus'
// XLSX 动态导入，按需加载
import dayjs from 'dayjs'
import TimeRangeSelector from '@/components/TimeRangeSelector.vue'

const route = useRoute()
const appStore = useAppStore()

const moduleType = computed(() => route.name === 'Boiler' ? 'boiler' : 'facility')
const moduleLabel = computed(() => moduleType.value === 'boiler' ? '锅炉房' : '厂务')

const loading = ref(false)
const exporting = ref(false)
const submitting = ref(false)
const list = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = 20
const timeRange = ref({ mode: 'month', yearMonths: [dayjs().format('YYYY-MM')], label: dayjs().format('YYYY年MM月') })
const filterType = ref('')
const addDialogVisible = ref(false)
const allParts = ref([])
const outboundSummary = ref(null)

const form = ref({
  type: '维修',
  items: [{ partSkuId: '', qty: 1 }],
  remark: '',
})

function formatTime(ts) {
  return ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '-'
}

function typeTagType(type) {
  return { '维修': '', '领用': 'warning', '更换': 'success' }[type] || 'info'
}

async function loadList() {
  loading.value = true
  try {
    const t = timeRange.value
    const tp = (t.mode === 'month' && t.yearMonths?.length === 1) ? { yearMonth: t.yearMonths[0] } : { yearMonths: t.yearMonths }
    const params = {
      ...tp,
      module: moduleType.value,
      page: currentPage.value,
      pageSize,
    }
    if (appStore.currentFactoryId) params.factoryId = appStore.currentFactoryId

    const [res, sumRes] = await Promise.all([
      api.listReplacementLogs(params),
      api.getFacilityOutboundSummary(
        moduleType.value,
        appStore.currentFactoryId,
        tp.yearMonth,
        tp.yearMonths
      ),
    ])

    if (res.ok) {
      let logs = res.data.list
      if (filterType.value) {
        logs = logs.filter(l => l.type === filterType.value)
      }
      list.value = logs
      total.value = res.data.total
    }
    if (sumRes.ok) {
      outboundSummary.value = sumRes.data
    }
  } finally {
    loading.value = false
  }
}

async function loadParts() {
  const res = await api.listParts(appStore.currentFactoryId)
  if (res.ok) allParts.value = res.data.list || []
}

function openAddDialog() {
  form.value = {
    type: '维修',
    items: [{ partSkuId: '', qty: 1 }],
    remark: '',
  }
  addDialogVisible.value = true
  if (!allParts.value.length) loadParts()
}

function addFormItem() {
  form.value.items.push({ partSkuId: '', qty: 1 })
}

function onPartSelect(idx, partSkuId) {
  const part = allParts.value.find(p => p.partSkuId === partSkuId)
  if (part) {
    form.value.items[idx].partName = part.partName
  }
}

async function handleSubmit() {
  const validItems = form.value.items.filter(i => i.partSkuId)
  if (!validItems.length) {
    ElMessage.warning('请至少选择一个物品')
    return
  }

  const selectedPartSkuIds = validItems.map(i => i.partSkuId)
  const qtyMap = {}
  validItems.forEach(i => { qtyMap[i.partSkuId] = i.qty })

  submitting.value = true
  try {
    const res = await api.submitFacilityLog({
      module: moduleType.value,
      type: form.value.type,
      selectedPartSkuIds,
      qtyMap,
      remark: form.value.remark,
      factoryId: appStore.currentFactoryId || undefined,
    })
    if (res.ok) {
      ElMessage.success('提交成功')
      addDialogVisible.value = false
      await loadList()
    } else {
      ElMessage.error(res.error?.message || '提交失败')
    }
  } catch (err) {
    ElMessage.error('提交失败：' + (err.message || '未知错误'))
  } finally {
    submitting.value = false
  }
}

async function handleExport() {
  exporting.value = true
  try {
    const XLSX = await import('xlsx')
    const t = timeRange.value
    const tp = (t.mode === 'month' && t.yearMonths?.length === 1) ? { yearMonth: t.yearMonths[0] } : { yearMonths: t.yearMonths }
    const params = {
      ...tp,
      module: moduleType.value,
      page: 1,
      pageSize: 5000,
    }
    if (appStore.currentFactoryId) params.factoryId = appStore.currentFactoryId

    const res = await api.listReplacementLogs(params)
    if (!res.ok || !res.data.list.length) {
      ElMessage.warning('暂无数据可导出')
      return
    }

    let logs = res.data.list
    if (filterType.value) logs = logs.filter(l => l.type === filterType.value)

    const exportRows = []
    logs.forEach(log => {
      (log.items || []).forEach(item => {
        exportRows.push({
          '日期时间': dayjs(log.ts).format('YYYY-MM-DD HH:mm'),
          '月份': log.yearMonth,
          '类型': log.type,
          '物品名称': item.partNameSnapshot,
          '物品编号': item.partCodeSnapshot,
          '规格型号': item.specModelSnapshot || '',
          '数量': item.qty,
          '操作人': log.reporterNameSnapshot,
          '备注': log.remark || '',
        })
      })
    })

    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${moduleLabel.value}记录`)
    XLSX.writeFile(wb, `${moduleLabel.value}记录_${timeRange.value.label}.xlsx`)
    ElMessage.success('导出成功')
  } catch (err) {
    ElMessage.error('导出失败：' + (err.message || '未知错误'))
  } finally {
    exporting.value = false
  }
}

watch(() => route.name, () => {
  currentPage.value = 1
  loadList()
})

watch(timeRange, () => loadList(), { deep: true, immediate: true })
</script>

<style lang="scss" scoped>
.header-actions {
  display: flex;
  gap: 8px;
}

.summary-cards {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.summary-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px 24px;
  min-width: 150px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.summary-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}

.summary-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
}

.summary-blue { color: #409EFF; }
.summary-orange { color: #E6A23C; }

.item-line {
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.8;

  .qty-tag {
    font-size: 11px;
  }
  .spec-text {
    color: #909399;
    font-size: 12px;
  }
  .cost-text {
    color: #e6a23c;
    font-size: 12px;
    margin-left: 2px;
  }
}

.cost-value {
  color: #e6a23c;
  font-weight: 600;
}
.no-cost {
  color: #c0c4cc;
}

.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.add-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
</style>
