<template>
  <div class="page-container">
    <div class="page-header">
      <h2>库存管理</h2>
      <div class="header-actions">
        <el-button @click="$router.push('/inventory/logs')">出入库记录</el-button>
        <el-button v-if="canEdit" type="primary" @click="$router.push('/inventory/inbound')">
          <el-icon><Plus /></el-icon>配件入库
        </el-button>
      </div>
    </div>

    <!-- 库存概览 -->
    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-label">库存总价值</div>
        <div class="summary-value">¥{{ summary.totalInventoryValue?.toLocaleString() || '0' }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">库存品种</div>
        <div class="summary-value">{{ list.length }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">当月入库</div>
        <div class="summary-value summary-green">¥{{ summary.totalInboundValue?.toLocaleString() || '0' }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">当月出库</div>
        <div class="summary-value summary-red">¥{{ summary.totalOutboundValue?.toLocaleString() || '0' }}</div>
      </div>
      <div class="summary-card" v-if="summary.lowStockCount > 0">
        <div class="summary-label">低库存预警</div>
        <div class="summary-value summary-warn">{{ summary.lowStockCount }}</div>
      </div>
    </div>

    <!-- 当月配件使用金额（从高到低） -->
    <div class="cost-section" v-if="usageCostList.length > 0">
      <h3 class="section-title">当月配件使用金额（从高到低）</h3>
      <el-table :data="usageCostList" stripe size="small">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="partName" label="配件名称" min-width="140" />
        <el-table-column prop="partCode" label="配件编号" width="130" />
        <el-table-column prop="specModel" label="规格型号" width="120" />
        <el-table-column label="使用数量" width="90">
          <template #default="{ row }">
            {{ row.qty }} {{ row.unit || '个' }}
          </template>
        </el-table-column>
        <el-table-column label="使用金额" width="120" sortable :sort-method="sortByCost">
          <template #default="{ row }">
            <span class="cost-value">¥{{ row.totalCost?.toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="占比" width="80">
          <template #default="{ row }">
            {{ row.percentage }}%
          </template>
        </el-table-column>
      </el-table>
      <div class="cost-total-row">
        总使用金额: <strong>¥{{ totalUsageCost.toLocaleString() }}</strong>
      </div>
    </div>

    <!-- 搜索 / 筛选 / 排序 -->
    <div class="filter-bar">
      <el-input v-model="searchText" placeholder="搜索配件名称/编号" clearable style="width: 240px" prefix-icon="Search" />
      <el-select v-model="filterLowStock" placeholder="库存状态" clearable style="width: 140px">
        <el-option label="低库存" value="low" />
        <el-option label="正常" value="normal" />
      </el-select>
      <el-select v-model="sortField" placeholder="排序方式" clearable style="width: 160px">
        <el-option label="库存数量（升序）" value="qty_asc" />
        <el-option label="库存数量（降序）" value="qty_desc" />
        <el-option label="库存价值（升序）" value="value_asc" />
        <el-option label="库存价值（降序）" value="value_desc" />
      </el-select>
    </div>

    <!-- 库存表格 -->
    <el-table :data="filteredList" v-loading="loading" stripe :row-class-name="tableRowClassName">
      <el-table-column prop="partNameSnapshot" label="配件名称" min-width="130" />
      <el-table-column prop="partCodeSnapshot" label="配件编号" width="140" />
      <el-table-column prop="specModelSnapshot" label="规格型号" width="120" />
      <el-table-column prop="unitSnapshot" label="单位" width="60" />
      <el-table-column label="库存数量" width="120">
        <template #default="{ row }">
          <span :class="{ 'low-stock-text': isLowStock(row) }">
            {{ row.currentQty }}
          </span>
          <el-tag v-if="isLowStock(row)" type="danger" size="small" class="low-tag">低</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="平均单价" width="100">
        <template #default="{ row }">
          ¥{{ row.avgUnitCost?.toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column label="库存价值" width="120">
        <template #default="{ row }">
          ¥{{ row.totalCostValue?.toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column label="低库存阈值" width="110">
        <template #default="{ row }">
          {{ row.lowStockThreshold }}
        </template>
      </el-table-column>
      <el-table-column v-if="canEdit" label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openEditPart(row)">编辑</el-button>
          <el-button size="small" link @click="editThreshold(row)">设置阈值</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 编辑配件弹窗 -->
    <el-dialog v-model="editPartDialogVisible" title="编辑配件" width="480px">
      <el-form :model="editPartForm" label-width="100px">
        <el-form-item label="配件编号">
          <span class="readonly-text">{{ editPartForm.partCode }}</span>
        </el-form-item>
        <el-form-item label="配件名称">
          <el-input v-model="editPartForm.partName" placeholder="请输入配件名称" />
        </el-form-item>
        <el-form-item label="规格型号">
          <el-input v-model="editPartForm.specModel" placeholder="请输入规格型号" />
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="editPartForm.unit" placeholder="如：个、根、套" style="width: 120px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editPartDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editPartSaving" @click="saveEditPart">保存</el-button>
      </template>
    </el-dialog>

    <!-- 设置阈值弹窗 -->
    <el-dialog v-model="thresholdDialogVisible" title="设置低库存阈值" width="400px">
      <el-form label-width="100px">
        <el-form-item label="配件">{{ editItem?.partNameSnapshot }}</el-form-item>
        <el-form-item label="当前库存">{{ editItem?.currentQty }}</el-form-item>
        <el-form-item label="低库存阈值">
          <el-input-number v-model="newThreshold" :min="0" :max="9999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="thresholdDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveThreshold">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const authStore = useAuthStore()
const canEdit = computed(() => authStore.canEdit)

const appStore = useAppStore()
const loading = ref(false)
const list = ref([])
const summary = ref({})
const thresholdDialogVisible = ref(false)
const editItem = ref(null)
const newThreshold = ref(10)
const usageCostList = ref([])
const totalUsageCost = ref(0)

const searchText = ref('')
const filterLowStock = ref('')
const sortField = ref('')

const editPartDialogVisible = ref(false)
const editPartSaving = ref(false)
const editPartForm = ref({ partSkuId: '', partCode: '', partName: '', specModel: '', unit: '' })

function isLowStock(row) {
  return row.lowStockThreshold > 0 && row.currentQty <= row.lowStockThreshold
}

function tableRowClassName({ row }) {
  return isLowStock(row) ? 'low-stock-row' : ''
}

const filteredList = computed(() => {
  let result = [...list.value]
  if (searchText.value) {
    const s = searchText.value.toLowerCase()
    result = result.filter(r =>
      (r.partNameSnapshot || '').toLowerCase().includes(s) ||
      (r.partCodeSnapshot || '').toLowerCase().includes(s)
    )
  }
  if (filterLowStock.value === 'low') {
    result = result.filter(r => isLowStock(r))
  } else if (filterLowStock.value === 'normal') {
    result = result.filter(r => !isLowStock(r))
  }
  if (sortField.value === 'qty_asc') result.sort((a, b) => a.currentQty - b.currentQty)
  else if (sortField.value === 'qty_desc') result.sort((a, b) => b.currentQty - a.currentQty)
  else if (sortField.value === 'value_asc') result.sort((a, b) => (a.totalCostValue || 0) - (b.totalCostValue || 0))
  else if (sortField.value === 'value_desc') result.sort((a, b) => (b.totalCostValue || 0) - (a.totalCostValue || 0))
  return result
})

async function loadData() {
  loading.value = true
  try {
    const factoryId = appStore.currentFactoryId
    const [invRes, sumRes, costRes] = await Promise.all([
      api.listInventory(factoryId),
      api.getInventorySummary(factoryId),
      api.getPartUsageCostList(factoryId)
    ])
    if (invRes.ok) list.value = invRes.data.list
    if (sumRes.ok) summary.value = sumRes.data
    if (costRes.ok) {
      usageCostList.value = costRes.data.list || []
      totalUsageCost.value = costRes.data.totalCost || 0
    }
  } finally {
    loading.value = false
  }
}

function sortByCost(a, b) {
  return b.totalCost - a.totalCost
}

function openEditPart(row) {
  editPartForm.value = {
    partSkuId: row.partSkuId,
    partCode: row.partCodeSnapshot || '',
    partName: row.partNameSnapshot || '',
    specModel: row.specModelSnapshot || '',
    unit: row.unitSnapshot || '',
  }
  editPartDialogVisible.value = true
}

async function saveEditPart() {
  const { partSkuId, partName, specModel, unit } = editPartForm.value
  if (!partName.trim()) {
    ElMessage.warning('配件名称不能为空')
    return
  }
  editPartSaving.value = true
  try {
    const res = await api.updatePart(partSkuId, { partName: partName.trim(), specModel: specModel.trim(), unit: unit.trim() })
    if (res.ok) {
      ElMessage.success('配件信息已更新')
      editPartDialogVisible.value = false
      loadData()
    } else {
      ElMessage.error(res.error?.message || '更新失败')
    }
  } finally {
    editPartSaving.value = false
  }
}

function editThreshold(row) {
  editItem.value = row
  newThreshold.value = row.lowStockThreshold
  thresholdDialogVisible.value = true
}

async function saveThreshold() {
  const res = await api.updateInventoryThreshold(editItem.value.inventoryId, newThreshold.value)
  if (res.ok) {
    ElMessage.success('阈值已更新')
    thresholdDialogVisible.value = false
    loadData()
  } else {
    ElMessage.error(res.error?.message || '更新失败')
  }
}

onMounted(loadData)
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
  min-width: 160px;
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

.summary-green { color: #67C23A; }
.summary-red { color: #F56C6C; }
.summary-warn { color: #E6A23C; }

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
}

.low-stock-text {
  color: #fff;
  font-weight: 700;
}

.low-tag {
  margin-left: 4px;
}

.cost-section {
  margin-top: 32px;
  margin-bottom: 24px;
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 16px;
}

.cost-value {
  font-weight: 600;
  color: #E6A23C;
}

.cost-total-row {
  margin-top: 12px;
  text-align: right;
  font-size: 14px;
  color: #606266;

  strong {
    font-size: 18px;
    color: #303133;
  }
}

.readonly-text {
  color: #909399;
  font-size: 14px;
}

:deep(.low-stock-row) {
  td.el-table__cell {
    background-color: #fde2e2 !important;
  }

  &:hover > td.el-table__cell {
    background-color: #fbc4c4 !important;
  }

  .low-stock-text {
    color: #c45656;
    font-weight: 700;
  }

  .el-tag--danger {
    font-weight: 700;
  }
}
</style>
