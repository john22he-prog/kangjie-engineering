<template>
  <div class="page-container">
    <div class="page-header">
      <h2>更换记录</h2>
      <div class="header-actions">
        <el-button @click="handleExport" :loading="exporting">
          <el-icon><Download /></el-icon>导出 Excel
        </el-button>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="filter-bar">
      <TimeRangeSelector v-model="timeRange" />
      <el-select v-model="filterAssetId" placeholder="设备筛选" clearable filterable style="width: 200px" @change="loadList">
        <el-option v-for="a in assets" :key="a.assetId" :label="`${a.assetName}`" :value="a.assetId" />
      </el-select>
      <el-select v-model="filterUserId" placeholder="工程师筛选" clearable filterable style="width: 160px" @change="loadList">
        <el-option v-for="u in engineers" :key="u.userId" :label="u.displayName" :value="u.userId" />
      </el-select>
      <el-select v-model="filterType" placeholder="类型" clearable style="width: 120px" @change="loadList">
        <el-option label="维修" value="维修" />
        <el-option label="预防" value="预防" />
        <el-option label="紧急" value="紧急" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 120px" @change="loadList">
        <el-option label="启用" value="active" />
        <el-option label="停用" value="disabled" />
      </el-select>
    </div>

    <!-- 记录表格 -->
    <el-table :data="list" v-loading="loading" stripe :row-class-name="rowClassName">
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.disabled ? 'info' : 'success'" size="small" effect="plain">
            {{ row.disabled ? '停用' : '启用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="日期时间" width="160">
        <template #default="{ row }">
          {{ formatTime(row.ts) }}
        </template>
      </el-table-column>
      <el-table-column prop="assetNameSnapshot" label="设备" width="130" />
      <el-table-column label="部位" width="100">
        <template #default="{ row }">
          {{ row.locationNameSnapshot || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="type" label="类型" width="70">
        <template #default="{ row }">
          <el-tag :type="typeTagType(row.type)" size="small">{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="配件明细" min-width="220">
        <template #default="{ row }">
          <div v-for="item in row.items" :key="item.partSkuId" class="item-line">
            <span>{{ item.partNameSnapshot }}</span>
            <span v-if="item.specModelSnapshot" class="spec-text">{{ item.specModelSnapshot }}</span>
            <el-tag size="small" type="info" class="qty-tag">x{{ item.qty }}</el-tag>
            <span v-if="item.unitCost" class="cost-text">¥{{ item.itemCost?.toFixed(2) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="配件金额" width="110">
        <template #default="{ row }">
          <span v-if="row.totalRepairCost > 0" class="cost-value">¥{{ row.totalRepairCost.toFixed(2) }}</span>
          <span v-else class="no-cost">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="reporterNameSnapshot" label="填报人" width="90" />
      <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
      <el-table-column label="图片" width="70">
        <template #default="{ row }">
          <el-button
            v-if="row.images?.length"
            size="small"
            text
            type="primary"
            @click="showImages(row)"
          >
            {{ row.images.length }}张
          </el-button>
          <span v-else class="no-img">-</span>
        </template>
      </el-table-column>
      <el-table-column v-if="canEdit" label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button
            type="primary"
            size="small"
            text
            @click="openEditItems(row)"
          >
            编辑配件
          </el-button>
          <el-popconfirm
            :title="row.disabled ? '确定启用该记录？启用后将恢复参与数据统计。' : '确定停用该记录？停用后将不参与数据统计。'"
            :confirm-button-text="row.disabled ? '启用' : '停用'"
            cancel-button-text="取消"
            @confirm="handleToggleStatus(row)"
          >
            <template #reference>
              <el-button
                :type="row.disabled ? 'success' : 'warning'"
                size="small"
                text
                :loading="row._toggling"
              >
                {{ row.disabled ? '启用' : '停用' }}
              </el-button>
            </template>
          </el-popconfirm>
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

    <!-- 图片预览弹窗 -->
    <el-dialog v-model="imageDialogVisible" title="照片查看" width="700px">
      <div v-if="imageLoading" style="text-align:center;padding:40px 0">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <p style="color:#909399;margin-top:8px">加载图片中…</p>
      </div>
      <div v-else class="image-grid">
        <div v-for="(img, idx) in currentImages" :key="idx" class="image-item">
          <el-image
            :src="img.url"
            :preview-src-list="currentImages.map(i => i.url)"
            :initial-index="idx"
            fit="cover"
            class="real-image"
            :preview-teleported="true"
          >
            <template #error>
              <div class="image-placeholder">
                <el-icon :size="32" color="#c0c4cc"><Picture /></el-icon>
                <span>加载失败</span>
              </div>
            </template>
          </el-image>
        </div>
      </div>
      <template #footer>
        <el-button @click="imageDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 编辑配件弹窗 -->
    <el-dialog v-model="editDialogVisible" title="编辑配件" width="640px" :close-on-click-modal="false">
      <div class="edit-info">
        <el-descriptions :column="2" size="small" border>
          <el-descriptions-item label="设备">{{ editingLog?.assetNameSnapshot }}</el-descriptions-item>
          <el-descriptions-item label="日期">{{ formatTime(editingLog?.ts) }}</el-descriptions-item>
        </el-descriptions>
      </div>

      <div class="edit-items-title">
        <span>配件列表</span>
        <el-button type="primary" size="small" text @click="addEditItem">+ 添加配件</el-button>
      </div>

      <div v-for="(item, idx) in editItems" :key="idx" class="edit-item-row">
        <el-select
          v-model="item.partSkuId"
          filterable
          placeholder="选择配件"
          style="flex: 1"
          @change="(val) => onPartSelect(idx, val)"
        >
          <el-option
            v-for="p in allParts"
            :key="p.partSkuId"
            :label="`${p.partName}${p.specModel ? ' (' + p.specModel + ')' : ''} [${p.partCode}]`"
            :value="p.partSkuId"
          />
        </el-select>
        <el-input-number v-model="item.qty" :min="1" :max="99" size="default" style="width: 110px" />
        <el-button type="danger" text size="small" @click="editItems.splice(idx, 1)" :disabled="editItems.length <= 1">
          删除
        </el-button>
      </div>

      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveEditItems" :loading="editSaving">
          保存修改
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
// XLSX 动态导入，按需加载
import dayjs from 'dayjs'
import TimeRangeSelector from '@/components/TimeRangeSelector.vue'

const appStore = useAppStore()
const authStore = useAuthStore()
const canEdit = computed(() => authStore.canEdit)
const loading = ref(false)
const exporting = ref(false)
const list = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = 20
const timeRange = ref({ mode: 'month', yearMonths: [dayjs().format('YYYY-MM')], label: dayjs().format('YYYY年MM月') })
const filterAssetId = ref('')
const filterUserId = ref('')
const filterType = ref('')
const filterStatus = ref('')
const assets = ref([])
const engineers = ref([])
const imageDialogVisible = ref(false)
const imageLoading = ref(false)
const currentImages = ref([])

function formatTime(ts) {
  return ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '-'
}

function typeTagType(type) {
  return { '维修': '', '预防': 'success', '紧急': 'danger' }[type] || 'info'
}

function rowClassName({ row }) {
  return row.disabled ? 'row-disabled' : ''
}

async function handleToggleStatus(row) {
  const newDisabled = !row.disabled
  row._toggling = true
  try {
    const res = await api.toggleLogStatus(row.logId, newDisabled)
    if (res.ok) {
      row.disabled = newDisabled
      ElMessage.success(newDisabled ? '已停用，该记录不再参与数据统计' : '已启用，该记录恢复参与数据统计')
    } else {
      ElMessage.error(res.error?.message || '操作失败')
    }
  } catch (err) {
    ElMessage.error('操作失败：' + (err.message || '未知错误'))
  } finally {
    row._toggling = false
  }
}

async function showImages(row) {
  const fileIds = row.images || []
  if (!fileIds.length) return
  imageDialogVisible.value = true
  imageLoading.value = true
  currentImages.value = []
  try {
    const res = await api.getFileUrls(fileIds)
    if (res.ok && res.data?.fileList) {
      currentImages.value = res.data.fileList
        .filter(f => f.tempFileURL)
        .map(f => ({ fileID: f.fileID, url: f.tempFileURL }))
    } else {
      ElMessage.warning('获取图片地址失败')
    }
  } catch (err) {
    ElMessage.error('获取图片失败：' + (err.message || '未知错误'))
  } finally {
    imageLoading.value = false
  }
}

async function handleExport() {
  exporting.value = true
  try {
    const XLSX = await import('xlsx')
    const t = timeRange.value
    const tp = (t.mode === 'month' && t.yearMonths?.length === 1) ? { yearMonth: t.yearMonths[0] } : { yearMonths: t.yearMonths }
    const params = { ...tp, page: 1, pageSize: 5000, module: 'equipment' }
    if (appStore.currentFactoryId) params.factoryId = appStore.currentFactoryId
    if (filterAssetId.value) params.assetId = filterAssetId.value
    if (filterUserId.value) params.userId = filterUserId.value
    if (filterStatus.value) params.status = filterStatus.value

    const res = await api.listReplacementLogs(params)
    if (!res.ok || !res.data.list.length) {
      ElMessage.warning('暂无数据可导出')
      return
    }

    let logs = res.data.list
    if (filterType.value) {
      logs = logs.filter(l => l.type === filterType.value)
    }

    const exportRows = []
    logs.forEach(log => {
      (log.items || []).forEach(item => {
        exportRows.push({
          '状态': log.disabled ? '停用' : '启用',
          '日期时间': dayjs(log.ts).format('YYYY-MM-DD HH:mm'),
          '月份': log.yearMonth,
          '设备名称': log.assetNameSnapshot,
          '设备编号': log.assetNoSnapshot,
          '部位': log.locationNameSnapshot || '',
          '更换类型': log.type,
          '配件名称': item.partNameSnapshot,
          '配件编号': item.partCodeSnapshot,
          '数量': item.qty,
          '填报人': log.reporterNameSnapshot,
          '备注': log.remark || '',
        })
      })
    })

    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '更换记录')
    XLSX.writeFile(wb, `更换记录_${timeRange.value.label}.xlsx`)
    ElMessage.success('导出成功')
  } catch (err) {
    ElMessage.error('导出失败：' + (err.message || '未知错误'))
  } finally {
    exporting.value = false
  }
}

async function loadList() {
  loading.value = true
  try {
    const t = timeRange.value
    const tp = (t.mode === 'month' && t.yearMonths?.length === 1) ? { yearMonth: t.yearMonths[0] } : { yearMonths: t.yearMonths }
    let filteredData = { ...tp, page: currentPage.value, pageSize, module: 'equipment' }
    if (appStore.currentFactoryId) filteredData.factoryId = appStore.currentFactoryId
    if (filterAssetId.value) filteredData.assetId = filterAssetId.value
    if (filterUserId.value) filteredData.userId = filterUserId.value
    if (filterStatus.value) filteredData.status = filterStatus.value

    const res = await api.listReplacementLogs(filteredData)
    if (res.ok) {
      let logs = res.data.list
      if (filterType.value) {
        logs = logs.filter(l => l.type === filterType.value)
      }
      list.value = logs
      total.value = res.data.total
    }
  } finally {
    loading.value = false
  }
}

async function loadBasicData() {
  const [aRes, uRes] = await Promise.all([api.listAssets(appStore.currentFactoryId), api.listUsers()])
  if (aRes.ok) assets.value = aRes.data.list
  if (uRes.ok) engineers.value = uRes.data.list.filter(u => u.role === 'Engineer')
}

// ===== 编辑配件 =====
const editDialogVisible = ref(false)
const editingLog = ref(null)
const editItems = ref([])
const editSaving = ref(false)
const allParts = ref([])

function openEditItems(row) {
  editingLog.value = row
  editItems.value = (row.items || []).map(item => ({
    partSkuId: item.partSkuId,
    partNameSnapshot: item.partNameSnapshot,
    partCodeSnapshot: item.partCodeSnapshot,
    specModelSnapshot: item.specModelSnapshot || '',
    qty: item.qty || 1
  }))
  editDialogVisible.value = true
  // 加载配件列表
  if (!allParts.value.length) {
    api.listParts(appStore.currentFactoryId).then(res => {
      if (res.ok) allParts.value = res.data.list || []
    })
  }
}

function addEditItem() {
  editItems.value.push({ partSkuId: '', qty: 1, partNameSnapshot: '', partCodeSnapshot: '', specModelSnapshot: '' })
}

function onPartSelect(idx, partSkuId) {
  const part = allParts.value.find(p => p.partSkuId === partSkuId)
  if (part) {
    editItems.value[idx].partNameSnapshot = part.partName
    editItems.value[idx].partCodeSnapshot = part.partCode
    editItems.value[idx].specModelSnapshot = part.specModel || ''
  }
}

async function handleSaveEditItems() {
  const validItems = editItems.value.filter(i => i.partSkuId)
  if (!validItems.length) {
    ElMessage.warning('请至少选择一个配件')
    return
  }
  editSaving.value = true
  try {
    const res = await api.editReplacementLogItems(editingLog.value.logId, validItems)
    if (res.ok) {
      ElMessage.success('配件修改成功，库存和成本已自动更新')
      editDialogVisible.value = false
      await loadList()
    } else {
      ElMessage.error(res.error?.message || '修改失败')
    }
  } catch (err) {
    ElMessage.error('操作失败：' + (err.message || '未知错误'))
  } finally {
    editSaving.value = false
  }
}

watch(timeRange, () => loadList(), { deep: true })

onMounted(async () => {
  await loadBasicData()
})
</script>

<style lang="scss" scoped>
.header-actions {
  display: flex;
  gap: 8px;
}

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

.no-img {
  color: #c0c4cc;
}

.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

// 停用行样式
:deep(.row-disabled) {
  td {
    color: #c0c4cc !important;
    background-color: #fafafa !important;
  }
  .el-tag {
    opacity: 0.6;
  }
}

  .edit-info {
    margin-bottom: 16px;
  }
  .edit-items-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    font-weight: 500;
    font-size: 14px;
    color: #303133;
  }
  .edit-item-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;

  .image-item {
    .real-image {
      width: 100%;
      height: 160px;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
    }

    .image-placeholder {
      width: 100%;
      height: 160px;
      background: #f5f7fa;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;

      span {
        font-size: 11px;
        color: #c0c4cc;
        word-break: break-all;
        text-align: center;
        padding: 0 8px;
      }
    }
  }
}
</style>
