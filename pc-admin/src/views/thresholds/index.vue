<template>
  <div class="page-container">
    <div class="page-header">
      <h2>阈值配置</h2>
      <el-button v-if="canEdit" type="primary" @click="openDialog()">
        <el-icon><Plus /></el-icon>新增阈值
      </el-button>
    </div>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-select v-model="filterAssetId" placeholder="选择设备" clearable filterable style="width: 220px">
        <el-option v-for="a in assets" :key="a.assetId" :label="`${a.assetName} (${a.assetId})`" :value="a.assetId" />
      </el-select>
      <el-input v-model="searchText" placeholder="搜索配件名称" clearable style="width: 200px" prefix-icon="Search" />
    </div>

    <!-- 表格 -->
    <el-table :data="filteredList" v-loading="loading" stripe>
      <el-table-column prop="assetName" label="设备名称" min-width="140" />
      <el-table-column prop="partName" label="配件名称" min-width="120" />
      <el-table-column prop="partCode" label="配件编号" width="140" />
      <el-table-column prop="thresholdMonthly" label="月度阈值" width="100">
        <template #default="{ row }">
          <span class="threshold-value">{{ row.thresholdMonthly }}</span>
        </template>
      </el-table-column>
      <el-table-column label="当月用量" width="100">
        <template #default="{ row }">
          <span :class="{ 'over-threshold': (row.currentMonthQty || 0) > row.thresholdMonthly }">
            {{ row.currentMonthQty || 0 }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="使用率" width="160">
        <template #default="{ row }">
          <el-progress
            :percentage="getUsagePercent(row)"
            :color="getProgressColor(row)"
            :stroke-width="10"
          />
        </template>
      </el-table-column>
      <el-table-column v-if="canEdit" label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-popconfirm title="确定删除该阈值配置？" @confirm="deleteThreshold(row.thresholdId)">
            <template #reference>
              <el-button size="small" type="danger" plain>删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑阈值' : '新增阈值'"
      width="480px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="设备" prop="assetId">
          <el-select v-model="form.assetId" :disabled="isEdit" filterable placeholder="选择设备" style="width: 100%">
            <el-option v-for="a in activeAssets" :key="a.assetId" :label="`${a.assetName} (${a.assetId})`" :value="a.assetId" />
          </el-select>
        </el-form-item>
        <el-form-item label="配件" prop="partSkuId">
          <el-select v-model="form.partSkuId" :disabled="isEdit" filterable placeholder="选择配件" style="width: 100%">
            <el-option v-for="p in activeParts" :key="p.partSkuId" :label="`${p.partName} (${p.partCode})`" :value="p.partSkuId" />
          </el-select>
        </el-form-item>
        <el-form-item label="月度阈值" prop="thresholdMonthly">
          <el-input-number v-model="form.thresholdMonthly" :min="1" :max="99999" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const authStore = useAuthStore()
const appStore = useAppStore()
const canEdit = computed(() => authStore.canEdit)
const currentFactoryId = computed(() => appStore.currentFactoryId)
const loading = ref(false)
const submitLoading = ref(false)
const list = ref([])
const assets = ref([])
const parts = ref([])
const filterAssetId = ref('')
const searchText = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref()

const form = reactive({
  assetId: '',
  partSkuId: '',
  thresholdMonthly: 10,
})

const formRules = {
  assetId: [{ required: true, message: '请选择设备', trigger: 'change' }],
  partSkuId: [{ required: true, message: '请选择配件', trigger: 'change' }],
  thresholdMonthly: [{ required: true, message: '请输入阈值', trigger: 'blur' }],
}

const activeAssets = computed(() => assets.value.filter(a => a.status === 'active'))
const activeParts = computed(() => parts.value.filter(p => p.active))

const filteredList = computed(() => {
  return list.value.filter(t => {
    if (filterAssetId.value && t.assetId !== filterAssetId.value) return false
    if (searchText.value) {
      const s = searchText.value.toLowerCase()
      if (!t.partName?.toLowerCase().includes(s)) return false
    }
    return true
  })
})

function getUsagePercent(row) {
  if (!row.thresholdMonthly || row.thresholdMonthly <= 0) return 0
  const qty = row.currentMonthQty || 0
  const pct = Math.round((qty / row.thresholdMonthly) * 100)
  return Math.min(100, isNaN(pct) ? 0 : pct)
}

function getProgressColor(row) {
  const pct = getUsagePercent(row)
  if (pct >= 100) return '#F56C6C'
  if (pct >= 80) return '#E6A23C'
  return '#07C160'
}

function openDialog(row) {
  if (row) {
    isEdit.value = true
    Object.assign(form, { assetId: row.assetId, partSkuId: row.partSkuId, thresholdMonthly: row.thresholdMonthly })
  } else {
    isEdit.value = false
    Object.assign(form, { assetId: '', partSkuId: '', thresholdMonthly: 10 })
  }
  dialogVisible.value = true
}

async function handleSubmit() {
  try { await formRef.value.validate() } catch { return }
  submitLoading.value = true
  try {
    const res = await api.upsertThreshold(form)
    if (res.ok) {
      ElMessage.success('保存成功')
      dialogVisible.value = false
      loadList()
    }
  } finally {
    submitLoading.value = false
  }
}

async function deleteThreshold(thresholdId) {
  const res = await api.deleteThreshold(thresholdId)
  if (res.ok) {
    ElMessage.success('已删除')
    loadList()
  }
}

async function loadList() {
  loading.value = true
  try {
    const res = await api.listThresholds(filterAssetId.value || undefined, currentFactoryId.value)
    if (res.ok) list.value = res.data.list
  } finally {
    loading.value = false
  }
}

async function loadBasicData() {
  const [aRes, pRes] = await Promise.all([
    api.listAssets(currentFactoryId.value),
    api.listParts(currentFactoryId.value),
  ])
  if (aRes.ok) assets.value = aRes.data.list
  if (pRes.ok) parts.value = pRes.data.list
}

watch(currentFactoryId, async () => {
  await loadBasicData()
  await loadList()
})

onMounted(async () => {
  await loadBasicData()
  await loadList()
})
</script>

<style lang="scss" scoped>
.threshold-value {
  font-weight: 600;
  color: #303133;
}

.over-threshold {
  color: #F56C6C;
  font-weight: 600;
}
</style>
