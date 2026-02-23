<template>
  <div class="page-container">
    <div class="page-header">
      <h2>出入库记录</h2>
      <el-button @click="$router.push('/inventory')">返回库存列表</el-button>
    </div>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-radio-group v-model="logType" @change="loadData">
        <el-radio-button value="inbound">入库记录</el-radio-button>
        <el-radio-button value="outbound">出库记录</el-radio-button>
      </el-radio-group>
      <TimeRangeSelector v-model="timeRange" />
      <el-button
        :loading="exportLoading"
        @click="handleExport"
        :disabled="logType === 'inbound' ? !inboundList.length : !outboundList.length"
      >
        <el-icon><Download /></el-icon>
        导出 Excel
      </el-button>
    </div>

    <!-- 入库记录 -->
    <el-table v-if="logType === 'inbound'" :data="inboundList" v-loading="loading" stripe>
      <el-table-column label="时间" width="160">
        <template #default="{ row }">{{ formatTime(row.ts) }}</template>
      </el-table-column>
      <el-table-column prop="partNameSnapshot" label="配件名称" min-width="120" />
      <el-table-column prop="partCodeSnapshot" label="配件编号" width="140" />
      <el-table-column prop="qty" label="数量" width="80" />
      <el-table-column label="单价" width="100">
        <template #default="{ row }">¥{{ row.unitPrice?.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="总价" width="120">
        <template #default="{ row }">¥{{ row.totalPrice?.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="supplier" label="供应商" width="120" />
      <el-table-column prop="batchNo" label="批次号" width="120" />
      <el-table-column prop="operatorNameSnapshot" label="操作人" width="90" />
      <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
      <el-table-column v-if="isAdmin" label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-popconfirm title="确定删除此入库记录？库存数量将同步回退。" @confirm="handleDeleteInbound(row)">
            <template #reference>
              <el-button type="danger" link size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 出库记录 -->
    <el-table v-if="logType === 'outbound'" :data="outboundList" v-loading="loading" stripe>
      <el-table-column label="时间" width="160">
        <template #default="{ row }">{{ formatTime(row.ts) }}</template>
      </el-table-column>
      <el-table-column prop="partNameSnapshot" label="配件名称" min-width="120" />
      <el-table-column prop="partCodeSnapshot" label="配件编号" width="140" />
      <el-table-column prop="qty" label="数量" width="80" />
      <el-table-column label="单价" width="100">
        <template #default="{ row }">¥{{ row.unitCostAtTime?.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="总成本" width="120">
        <template #default="{ row }">¥{{ row.totalCost?.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="assetNameSnapshot" label="使用设备" width="140" />
      <el-table-column prop="reporterNameSnapshot" label="关联人" width="90" />
      <el-table-column v-if="isAdmin" label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-popconfirm title="确定删除此出库记录？库存数量将同步回退。" @confirm="handleDeleteOutbound(row)">
            <template #reference>
              <el-button type="danger" link size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import TimeRangeSelector from '@/components/TimeRangeSelector.vue'

const appStore = useAppStore()
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.isAdmin)
const loading = ref(false)
const exportLoading = ref(false)
const logType = ref('inbound')
const timeRange = ref({ mode: 'month', yearMonths: [dayjs().format('YYYY-MM')], label: dayjs().format('YYYY年MM月') })
const inboundList = ref([])
const outboundList = ref([])

function formatTime(ts) {
  return ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '-'
}

async function loadData() {
  loading.value = true
  try {
    const factoryId = appStore.currentFactoryId
    const t = timeRange.value
    const ym = (t.mode === 'month' && t.yearMonths?.length === 1) ? t.yearMonths[0] : undefined
    const yms = ym ? undefined : t.yearMonths

    if (logType.value === 'inbound') {
      const res = await api.listInboundLogs(factoryId, ym, yms)
      if (res.ok) inboundList.value = res.data.list
    } else {
      const res = await api.listOutboundLogs(factoryId, ym, yms)
      if (res.ok) outboundList.value = res.data.list
    }
  } finally {
    loading.value = false
  }
}

async function handleExport() {
  exportLoading.value = true
  try {
    const XLSX = await import('xlsx')
    const isInbound = logType.value === 'inbound'
    const data = isInbound ? inboundList.value : outboundList.value
    if (!data.length) {
      ElMessage.warning('暂无数据可导出')
      return
    }

    let rows
    if (isInbound) {
      rows = data.map(r => ({
        '时间': formatTime(r.ts),
        '配件名称': r.partNameSnapshot || '',
        '配件编号': r.partCodeSnapshot || '',
        '数量': r.qty ?? '',
        '单价': r.unitPrice?.toFixed(2) ?? '',
        '总价': r.totalPrice?.toFixed(2) ?? '',
        '供应商': r.supplier || '',
        '批次号': r.batchNo || '',
        '操作人': r.operatorNameSnapshot || '',
        '备注': r.remark || '',
      }))
    } else {
      rows = data.map(r => ({
        '时间': formatTime(r.ts),
        '配件名称': r.partNameSnapshot || '',
        '配件编号': r.partCodeSnapshot || '',
        '数量': r.qty ?? '',
        '单价': r.unitCostAtTime?.toFixed(2) ?? '',
        '总成本': r.totalCost?.toFixed(2) ?? '',
        '使用设备': r.assetNameSnapshot || '',
        '关联人': r.reporterNameSnapshot || '',
      }))
    }

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    const sheetName = isInbound ? '入库记录' : '出库记录'
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    const fileName = `${sheetName}_${timeRange.value.label}.xlsx`
    XLSX.writeFile(wb, fileName)
    ElMessage.success('导出成功')
  } catch (err) {
    ElMessage.error('导出失败：' + (err.message || '未知错误'))
  } finally {
    exportLoading.value = false
  }
}

async function handleDeleteInbound(row) {
  try {
    const res = await api.deleteInboundLog(row.inboundId)
    if (res.ok) {
      ElMessage.success('入库记录已删除')
      loadData()
    } else {
      ElMessage.error(res.error?.message || '删除失败')
    }
  } catch (e) {
    ElMessage.error('删除失败：' + (e.message || '未知错误'))
  }
}

async function handleDeleteOutbound(row) {
  try {
    const res = await api.deleteOutboundLog(row.outboundId)
    if (res.ok) {
      ElMessage.success('出库记录已删除')
      loadData()
    } else {
      ElMessage.error(res.error?.message || '删除失败')
    }
  } catch (e) {
    ElMessage.error('删除失败：' + (e.message || '未知错误'))
  }
}

watch(timeRange, () => loadData(), { deep: true })
</script>

<style lang="scss" scoped>
.filter-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
}
</style>
