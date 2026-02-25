<template>
  <div class="page-container boiler-records">
    <div class="page-header">
      <h2>运行记录</h2>
      <div class="header-actions">
        <BoilerParkSelect @change="loadRecords" />
        <el-button @click="exportExcel" :disabled="records.length===0">
          <el-icon><Download /></el-icon>导出 Excel
        </el-button>
        <el-button type="primary" @click="entryRef?.open()">
          <el-icon><Plus /></el-icon>录入数据
        </el-button>
      </div>
    </div>

    <el-table :data="records" v-loading="loading" stripe row-key="id" class="record-table" :row-class-name="rowClassName">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="expand-content">
            <div class="expand-section" v-if="row.boilers?.length">
              <div class="expand-title">锅炉明细</div>
              <div class="expand-grid">
                <div v-for="b in row.boilers" :key="b.name" class="expand-item">
                  <span class="expand-name">{{ b.name }}</span>
                  <span class="expand-metric">用电 <b>{{ b.electricity?.toLocaleString() }}</b> 度</span>
                  <span class="expand-metric">产汽 <b>{{ b.steam_production }}</b> 吨</span>
                </div>
              </div>
            </div>
            <div class="expand-section" v-if="row.customers?.length">
              <div class="expand-title">客户用汽</div>
              <div class="expand-grid">
                <div v-for="c in row.customers" :key="c.name" class="expand-item">
                  <span class="expand-name">{{ c.name }}</span>
                  <span class="expand-metric">用汽 <b>{{ c.steam_usage }}</b> 吨</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="record_date" label="日期" width="115" fixed />
      <el-table-column label="总产汽" width="90" align="right">
        <template #default="{ row, $index }">
          <span :class="getChangeClass(row, $index, 'total_steam_production')">{{ row.total_steam_production ?? '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="总用电" width="90" align="right">
        <template #default="{ row, $index }">
          <span :class="getChangeClass(row, $index, 'total_electricity')">{{ row.total_electricity?.toLocaleString() ?? '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="总用汽" width="90" align="right">
        <template #default="{ row }">{{ row.total_steam_usage ?? '--' }}</template>
      </el-table-column>
      <el-table-column label="燃料" width="80" align="right">
        <template #default="{ row, $index }">
          <span :class="getChangeClass(row, $index, 'fuel_consumed')">{{ row.fuel_consumed ?? '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="用水" width="80" align="right">
        <template #default="{ row, $index }">
          <span :class="getChangeClass(row, $index, 'water_usage')">{{ row.water_usage ?? '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="进柴" width="70" align="right">
        <template #default="{ row }">{{ row.fuel_intake || '--' }}</template>
      </el-table-column>
      <el-table-column label="库存天" width="80" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.fuel_stock_days != null && row.fuel_stock_days < 5" type="danger" size="small">{{ row.fuel_stock_days }}</el-tag>
          <span v-else>{{ row.fuel_stock_days ?? '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="总成本(元)" width="100" align="right" v-if="hasPrices">
        <template #default="{ row }">
          <span class="num-normal">{{ calcRowCost(row)?.total?.toLocaleString() ?? '--' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="吨汽成本" width="90" align="right" v-if="hasPrices">
        <template #default="{ row }">
          <span class="num-normal">¥{{ calcRowCost(row)?.perSteam ?? '--' }}</span>
        </template>
      </el-table-column>
      <!-- 每台锅炉列 -->
      <el-table-column v-for="bn in boilerNames" :key="bn" :label="bn" align="center">
        <el-table-column :label="'电(度)'" width="85" align="right">
          <template #default="{ row }">
            <span class="sub-val">{{ getBoilerVal(row, bn, 'electricity') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="'汽(吨)'" width="80" align="right">
          <template #default="{ row }">
            <span class="sub-val">{{ getBoilerVal(row, bn, 'steam_production') }}</span>
          </template>
        </el-table-column>
      </el-table-column>
      <!-- 每个客户列 -->
      <el-table-column v-for="cn in customerNames" :key="cn" :label="cn + '用汽'" width="90" align="right">
        <template #default="{ row }">
          <span class="sub-val">{{ getCustomerVal(row, cn) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="showDetail(row)">详情</el-button>
          <el-button v-if="canDeleteRecord" link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrap">
      <el-pagination v-model:current-page="currentPage" :page-size="pageSize" :total="total"
        layout="total, prev, pager, next" @current-change="loadRecords" />
    </div>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="运行记录详情" width="680px">
      <div v-if="detailData" v-loading="detailLoading">
        <div class="detail-header">
          <span class="detail-date">{{ detailData.record_date }}</span>
          <span class="detail-park">锅炉房运行情况</span>
        </div>
        <h4>锅炉运行</h4>
        <el-table :data="detailData.boilers || []" stripe size="small">
          <el-table-column prop="name" label="锅炉" width="120" />
          <el-table-column prop="electricity" label="用电量（度）" align="right">
            <template #default="{ row }">{{ row.electricity?.toLocaleString() ?? '--' }}</template>
          </el-table-column>
          <el-table-column prop="steam_production" label="产汽量（吨）" align="right" />
        </el-table>
        <h4 style="margin-top: 20px">客户用汽</h4>
        <el-table :data="detailData.customers || []" stripe size="small">
          <el-table-column prop="name" label="客户" width="120" />
          <el-table-column prop="steam_usage" label="用汽量（吨）" align="right" />

        </el-table>
        <h4 style="margin-top: 20px">资源消耗</h4>
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="当日燃料">{{ detailData.fuel_consumed ?? '--' }} 吨</el-descriptions-item>
          <el-descriptions-item label="当日用水">{{ detailData.water_usage ?? '--' }} 吨</el-descriptions-item>
          <el-descriptions-item label="当日进柴">{{ detailData.fuel_intake || '无' }}</el-descriptions-item>
          <el-descriptions-item label="燃料库存">{{ detailData.summary?.fuel_stock_estimate ?? '--' }} 吨</el-descriptions-item>
          <el-descriptions-item label="预计可用">
            <span :class="{ 'text-danger': detailData.summary?.fuel_stock_days < 5 }">{{ detailData.summary?.fuel_stock_days ?? '--' }} 天</span>
          </el-descriptions-item>
          <el-descriptions-item label="损耗率">{{ detailData.summary?.steam_loss_rate ?? '--' }}%</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>

    <BoilerEntryDialog ref="entryRef" @submitted="loadRecords" />
  </div>
</template>

<script setup>
import BoilerParkSelect from '@/components/BoilerParkSelect.vue'
import BoilerEntryDialog from '@/components/BoilerEntryDialog.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { PERMISSIONS, hasPermission } from '@/utils/permissions'
import { api } from '@/utils/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Download } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'

const appStore = useAppStore()
const authStore = useAuthStore()
const canDeleteRecord = computed(() => hasPermission(authStore.user?.permissions || [], PERMISSIONS.RECORD_DELETE))
const entryRef = ref(null)
const loading = ref(false)
const records = ref([])
const currentPage = ref(1)
const pageSize = 20
const total = ref(0)
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref(null)
const prices = ref({ fuel: 0, electricity: 0, water: 0 })
const hasPrices = computed(() => prices.value.fuel > 0 || prices.value.electricity > 0 || prices.value.water > 0)

function calcRowCost(row) {
  const p = prices.value
  if (!hasPrices.value) return null
  const fuelCost = (row.fuel_consumed || 0) * (p.fuel || 0)
  const elecCost = (row.total_electricity || 0) * (p.electricity || 0)
  const waterCost = (row.water_usage || 0) * (p.water || 0)
  const total = Math.round(fuelCost + elecCost + waterCost)
  const steam = row.total_steam_production || 0
  const perSteam = steam > 0 ? +(total / steam).toFixed(1) : null
  return { total, perSteam }
}

function exportExcel() {
  const rows = records.value.map(r => {
    const rc = calcRowCost(r)
    const obj = {
      '日期': r.record_date,
      '总产汽(吨)': r.total_steam_production,
      '总用电(度)': r.total_electricity,
      '总用汽(吨)': r.total_steam_usage,
      '燃料(吨)': r.fuel_consumed,
      '用水(吨)': r.water_usage,
      '进柴(吨)': r.fuel_intake || '',
      '库存天数': r.fuel_stock_days ?? '',
    }
    boilerNames.value.forEach(bn => {
      obj[bn + ' 用电(度)'] = getBoilerVal(r, bn, 'electricity')
      obj[bn + ' 产汽(吨)'] = getBoilerVal(r, bn, 'steam_production')
    })
    customerNames.value.forEach(cn => { obj[cn + ' 用汽(吨)'] = getCustomerVal(r, cn) })
    if (hasPrices.value) {
      obj['总成本(元)'] = rc?.total ?? ''
      obj['吨汽成本(元)'] = rc?.perSteam ?? ''
    }
    return obj
  })
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '运行记录')
  XLSX.writeFile(wb, '锅炉运行记录.xlsx')
  ElMessage.success('导出成功')
}

const FALLBACK_BOILERS = [
  { name: '6T锅炉', electricity: 0, steam_production: 0 },
  { name: '4T锅炉', electricity: 0, steam_production: 0 },
]
const FALLBACK_CUSTOMERS = [
  { name: '金龙', steam_usage: 0 },
  { name: '银丰', steam_usage: 0 },
]

const boilerNames = computed(() => {
  const names = new Set()
  records.value.forEach(r => r.boilers?.forEach(b => names.add(b.name)))
  if (names.size === 0) FALLBACK_BOILERS.forEach(b => names.add(b.name))
  return [...names]
})

const customerNames = computed(() => {
  const names = new Set()
  records.value.forEach(r => r.customers?.forEach(c => names.add(c.name)))
  if (names.size === 0) FALLBACK_CUSTOMERS.forEach(c => names.add(c.name))
  return [...names]
})

function getBoilerVal(row, name, field) {
  const b = row.boilers?.find(x => x.name === name)
  if (!b) return '--'
  const v = b[field]
  return v != null ? (field === 'electricity' ? v.toLocaleString() : v) : '--'
}

function getCustomerVal(row, name) {
  const c = row.customers?.find(x => x.name === name)
  return c?.steam_usage ?? '--'
}

function rollingAvg(index, field, window = 7) {
  const vals = []
  for (let i = index + 1; i < Math.min(index + 1 + window, records.value.length); i++) {
    const v = records.value[i]?.[field]
    if (v != null) vals.push(v)
  }
  return vals.length >= 2 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

function getChangeClass(row, index, field) {
  const avg = rollingAvg(index, field)
  if (avg == null || row[field] == null || avg === 0) return 'num-normal'
  const change = (row[field] - avg) / avg
  if (change > 0.15) return 'num-warn'
  if (change < -0.15) return 'num-good'
  return 'num-normal'
}

function rowClassName({ row, rowIndex }) {
  const fields = ['total_electricity', 'fuel_consumed', 'water_usage']
  for (const f of fields) {
    const avg = rollingAvg(rowIndex, f)
    if (avg && row[f] && avg > 0 && (row[f] - avg) / avg > 0.2) return 'row-alert'
  }
  return ''
}


async function loadRecords() {
  loading.value = true
  try {
    const factoryId = appStore.currentFactoryId || undefined
    const [res, cfgRes] = await Promise.all([
      api.boilerListRecords({ page: currentPage.value, pageSize, factoryId }),
      api.boilerGetConfig(factoryId || ''),
    ])
    if (res.ok) { records.value = res.data.list; total.value = res.data.total }
    if (cfgRes.ok && cfgRes.data?.prices) prices.value = cfgRes.data.prices
  } finally { loading.value = false }
}

async function showDetail(row) {
  detailVisible.value = true; detailLoading.value = true
  try {
    const res = await api.boilerGetRecordDetail(row.id)
    if (res.ok) detailData.value = res.data
  } finally { detailLoading.value = false }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除 ${row.record_date} 的运行记录？删除后不可恢复。`, '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch { return }
  try {
    const res = await api.boilerDeleteRecord(row.id)
    if (res.ok) { ElMessage.success('已删除'); await loadRecords() }
    else ElMessage.error(res.error?.message || '删除失败')
  } catch (err) { ElMessage.error('删除失败：' + (err.message || '未知错误')) }
}

onMounted(() => loadRecords())
</script>

<style lang="scss" scoped>
.boiler-records {
  .header-actions { display: flex; gap: 8px; }
  .pagination-wrap { margin-top: 16px; display: flex; justify-content: flex-end; }

  .num-normal { font-weight: 600; color: #303133; }
  .num-warn { font-weight: 700; color: #F56C6C; }
  .num-good { font-weight: 600; color: #67C23A; }
  .sub-val { font-size: 13px; color: #606266; }

  :deep(.row-alert) { background-color: #fef0f0 !important; }
  :deep(.row-alert:hover > td) { background-color: #fde2e2 !important; }

  .expand-content {
    padding: 8px 16px 8px 48px;
    display: flex; gap: 32px; flex-wrap: wrap;
  }
  .expand-section { min-width: 200px; }
  .expand-title { font-size: 12px; color: #909399; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; }
  .expand-grid { display: flex; flex-wrap: wrap; gap: 16px; }
  .expand-item {
    display: flex; gap: 12px; align-items: center;
    background: #f5f7fa; border-radius: 6px; padding: 6px 12px; font-size: 13px;
    .expand-name { font-weight: 600; color: #303133; min-width: 50px; }
    .expand-metric { color: #606266; b { color: #303133; } }
  }

  .detail-header {
    display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px;
    .detail-date { font-size: 18px; font-weight: 700; color: #303133; }
    .detail-park { font-size: 14px; color: #909399; }
  }
  .text-danger { color: #F56C6C; font-weight: 600; }
  h4 { font-size: 14px; color: #606266; margin-bottom: 8px; }

  
}
</style>
