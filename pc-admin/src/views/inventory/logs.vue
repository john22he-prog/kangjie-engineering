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
      <el-date-picker
        v-model="filterMonth"
        type="month"
        placeholder="选择月份"
        format="YYYY-MM"
        value-format="YYYY-MM"
        style="width: 160px"
        @change="loadData"
      />
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
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import dayjs from 'dayjs'

const appStore = useAppStore()
const loading = ref(false)
const logType = ref('inbound')
const filterMonth = ref(dayjs().format('YYYY-MM'))
const inboundList = ref([])
const outboundList = ref([])

function formatTime(ts) {
  return ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '-'
}

async function loadData() {
  loading.value = true
  try {
    const factoryId = appStore.currentFactoryId
    const ym = filterMonth.value

    if (logType.value === 'inbound') {
      const res = await api.listInboundLogs(factoryId, ym)
      if (res.ok) inboundList.value = res.data.list
    } else {
      const res = await api.listOutboundLogs(factoryId, ym)
      if (res.ok) outboundList.value = res.data.list
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
.filter-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
}
</style>
