<template>
  <div class="page-container">
    <div class="page-header">
      <h2>报警管理</h2>
      <div class="header-actions">
        <el-button @click="handleExportAlerts" :loading="exportLoading">
          <el-icon><Download /></el-icon>导出 Excel
        </el-button>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 120px" @change="loadList">
        <el-option label="待处理" value="OPEN" />
        <el-option label="已确认" value="ACK" />
      </el-select>
      <TimeRangeSelector v-model="timeRange" />
      <el-select v-model="filterAssetId" placeholder="设备筛选" clearable filterable style="width: 200px" @change="loadList">
        <el-option v-for="a in assets" :key="a.assetId" :label="a.assetName" :value="a.assetId" />
      </el-select>
    </div>

    <!-- 报警表格 -->
    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'OPEN' ? 'danger' : 'success'" size="small" effect="dark">
            {{ row.status === 'OPEN' ? '待处理' : '已确认' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="报警时间" width="160">
        <template #default="{ row }">
          {{ formatTime(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column prop="yearMonth" label="月份" width="90" />
      <el-table-column prop="assetName" label="设备" min-width="130" />
      <el-table-column prop="partName" label="配件" min-width="120" />
      <el-table-column label="当前 / 阈值" width="130">
        <template #default="{ row }">
          <span class="threshold-info">
            <span class="current-qty" :class="{ over: row.currentQty > row.thresholdValue }">{{ row.currentQty }}</span>
            <span class="sep">/</span>
            <span class="threshold-val">{{ row.thresholdValue }}</span>
          </span>
        </template>
      </el-table-column>
      <el-table-column label="超出" width="100">
        <template #default="{ row }">
          <span v-if="row.currentQty > row.thresholdValue" class="over-amount">
            +{{ row.currentQty - row.thresholdValue }}
          </span>
          <span v-else class="within-threshold">未超出</span>
        </template>
      </el-table-column>
      <el-table-column label="阈值占比" width="130">
        <template #default="{ row }">
          <el-progress
            :percentage="Math.min(100, Math.round((row.currentQty / row.thresholdValue) * 100))"
            :color="row.currentQty > row.thresholdValue ? '#F56C6C' : '#E6A23C'"
            :stroke-width="8"
            :format="() => Math.round((row.currentQty / row.thresholdValue) * 100) + '%'"
          />
        </template>
      </el-table-column>
      <el-table-column label="确认信息" min-width="180">
        <template #default="{ row }">
          <template v-if="row.status === 'ACK'">
            <div class="ack-info">
              <div><strong>{{ row.ackByName }}</strong> 于 {{ formatTime(row.ackTs) }}</div>
              <div class="ack-note">{{ row.ackNote }}</div>
            </div>
          </template>
          <span v-else class="no-ack">-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'OPEN' && canAck"
            size="small"
            type="primary"
            @click="openAckDialog(row)"
          >
            确认
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-wrap">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="loadList"
      />
    </div>

    <!-- ACK 确认弹窗 -->
    <el-dialog v-model="ackDialogVisible" title="确认报警" width="480px" destroy-on-close>
      <div class="ack-detail" v-if="ackAlert">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="设备">{{ ackAlert.assetName }}</el-descriptions-item>
          <el-descriptions-item label="月份">{{ ackAlert.yearMonth }}</el-descriptions-item>
          <el-descriptions-item label="配件">{{ ackAlert.partName }}</el-descriptions-item>
          <el-descriptions-item label="当前/阈值">
            <span style="color: #F56C6C; font-weight: 600;">{{ ackAlert.currentQty }}</span>
            / {{ ackAlert.thresholdValue }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
      <el-form ref="ackFormRef" :model="ackForm" :rules="ackRules" label-width="80px" style="margin-top: 16px">
        <el-form-item label="确认说明" prop="ackNote">
          <el-input
            v-model="ackForm.ackNote"
            type="textarea"
            :rows="3"
            placeholder="请说明处理情况或原因分析（必填）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ackDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="ackLoading" @click="handleAck">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { api } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { ElMessage } from 'element-plus'
// XLSX 动态导入，按需加载
import dayjs from 'dayjs'
import TimeRangeSelector from '@/components/TimeRangeSelector.vue'

const authStore = useAuthStore()
const appStore = useAppStore()
const loading = ref(false)
const exportLoading = ref(false)
const list = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = 20
const filterStatus = ref('')
const timeRange = ref({ mode: 'month', yearMonths: [dayjs().format('YYYY-MM')], label: dayjs().format('YYYY年MM月') })
const filterAssetId = ref('')
const assets = ref([])

const ackDialogVisible = ref(false)
const ackAlert = ref(null)
const ackLoading = ref(false)
const ackFormRef = ref()
const ackForm = reactive({ ackNote: '' })
const ackRules = { ackNote: [{ required: true, message: '请输入确认说明', trigger: 'blur' }] }

const canAck = computed(() => authStore.canManage)

function formatTime(ts) {
  return ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '-'
}

function openAckDialog(row) {
  ackAlert.value = row
  ackForm.ackNote = ''
  ackDialogVisible.value = true
}

async function handleAck() {
  try { await ackFormRef.value.validate() } catch { return }
  ackLoading.value = true
  try {
    const res = await api.ackAlert(ackAlert.value.alertId, ackForm.ackNote)
    if (res.ok) {
      ElMessage.success('报警已确认')
      ackDialogVisible.value = false
      loadList()
    } else {
      ElMessage.error(res.error?.message || '操作失败')
    }
  } finally {
    ackLoading.value = false
  }
}

async function handleExportAlerts() {
  exportLoading.value = true
  try {
    const XLSX = await import('xlsx')
    const t = timeRange.value
    const tp = (t.mode === 'month' && t.yearMonths?.length === 1) ? { yearMonth: t.yearMonths[0] } : { yearMonths: t.yearMonths }
    const params = { ...tp, page: 1, pageSize: 5000 }
    if (filterStatus.value) params.status = filterStatus.value
    if (filterAssetId.value) params.assetId = filterAssetId.value

    const res = await api.listAlerts(params)
    if (!res.ok || !res.data.list.length) {
      ElMessage.warning('暂无数据可导出')
      return
    }

    const exportRows = res.data.list.map(a => ({
      '报警时间': formatTime(a.createdAt),
      '月份': a.yearMonth,
      '设备名称': a.assetName || a.assetId,
      '配件名称': a.partName || a.partSkuId,
      '阈值': a.thresholdValue,
      '当前累计': a.currentQty,
      '超出': a.currentQty > a.thresholdValue ? a.currentQty - a.thresholdValue : 0,
      '状态': a.status === 'OPEN' ? '待处理' : '已确认',
      '确认人': a.ackByName || '',
      '确认时间': a.ackTs ? formatTime(a.ackTs) : '',
      '确认说明': a.ackNote || '',
    }))

    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '报警记录')
    const filename = `报警记录_${timeRange.value.label}.xlsx`
    XLSX.writeFile(wb, filename)
    ElMessage.success('导出成功')
  } catch (err) {
    ElMessage.error('导出失败：' + (err.message || '未知错误'))
  } finally {
    exportLoading.value = false
  }
}

async function loadList() {
  loading.value = true
  try {
    const t = timeRange.value
    const tp = (t.mode === 'month' && t.yearMonths?.length === 1) ? { yearMonth: t.yearMonths[0] } : { yearMonths: t.yearMonths }
    const params = { ...tp, page: currentPage.value, pageSize }
    if (appStore.currentFactoryId) params.factoryId = appStore.currentFactoryId
    if (filterStatus.value) params.status = filterStatus.value
    if (filterAssetId.value) params.assetId = filterAssetId.value

    const res = await api.listAlerts(params)
    if (res.ok) {
      list.value = res.data.list
      total.value = res.data.total
    }
  } finally {
    loading.value = false
  }
}

async function loadAssets() {
  const res = await api.listAssets(appStore.currentFactoryId)
  if (res.ok) assets.value = res.data.list
}

watch(timeRange, () => loadList(), { deep: true })

onMounted(async () => {
  await loadAssets()
})
</script>

<style lang="scss" scoped>
.header-actions {
  display: flex;
  gap: 8px;
}

.threshold-info {
  .current-qty {
    font-weight: 600;
    font-size: 15px;
    color: #303133;
    &.over { color: #F56C6C; }
  }
  .sep {
    color: #c0c4cc;
    margin: 0 2px;
  }
  .threshold-val {
    color: #909399;
  }
}

.over-amount {
  color: #F56C6C;
  font-weight: 600;
  font-size: 14px;
}

.within-threshold {
  color: #c0c4cc;
  font-size: 13px;
}

.ack-info {
  font-size: 13px;
  line-height: 1.6;

  .ack-note {
    color: #909399;
    margin-top: 2px;
  }
}

.no-ack {
  color: #c0c4cc;
}

.ack-detail {
  margin-bottom: 8px;
}

.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
