<template>
  <div class="page-container">
    <div class="page-header">
      <div class="header-left">
        <el-button @click="$router.back()" text>
          <el-icon><ArrowLeft /></el-icon>返回设备列表
        </el-button>
        <h2>{{ assetInfo?.assetName || assetId }} — 部位与映射管理</h2>
      </div>
      <div class="header-actions">
        <el-button @click="openCopyDialog">
          <el-icon><CopyDocument /></el-icon>从其他设备复制
        </el-button>
        <el-button type="primary" @click="openLocDialog()">
          <el-icon><Plus /></el-icon>新增部位
        </el-button>
      </div>
    </div>

    <!-- 部位列表 -->
    <el-row :gutter="20">
      <el-col :span="10">
        <el-card>
          <template #header>
            <span class="card-title">部位列表</span>
          </template>
          <div v-loading="locLoading">
            <div
              v-for="loc in locations"
              :key="loc.locationId"
              class="loc-item"
              :class="{ active: selectedLoc?.locationId === loc.locationId }"
              @click="selectLocation(loc)"
            >
              <div class="loc-info">
                <span class="loc-name">{{ loc.locationName }}</span>
                <el-tag v-if="!loc.active" type="info" size="small">已停用</el-tag>
              </div>
              <div class="loc-actions">
                <el-button size="small" text @click.stop="openLocDialog(loc)">
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-popconfirm title="确定删除该部位及其映射？" @confirm="deleteLoc(loc.locationId)">
                  <template #reference>
                    <el-button size="small" text type="danger" @click.stop>
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
            <el-empty v-if="!locations.length" description="暂无部位，请新增" :image-size="60" />
          </div>
        </el-card>
      </el-col>

      <!-- 映射管理（选中部位后显示） -->
      <el-col :span="14">
        <el-card v-if="selectedLoc">
          <template #header>
            <div class="map-header">
              <span class="card-title">「{{ selectedLoc.locationName }}」可用配件</span>
              <el-button type="primary" size="small" @click="openMapDialog">
                <el-icon><Plus /></el-icon>添加配件
              </el-button>
            </div>
          </template>
          <el-table :data="currentMaps" v-loading="mapLoading" stripe size="small">
            <el-table-column prop="partName" label="配件名称" min-width="120" />
            <el-table-column prop="partCode" label="配件编号" width="140" />
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-popconfirm title="确定移除该映射？" @confirm="deleteMap(row.mapId)">
                  <template #reference>
                    <el-button size="small" text type="danger">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!currentMaps.length && !mapLoading" description="暂无配件映射" :image-size="60" />
        </el-card>
        <el-card v-else>
          <el-empty description="请选择左侧部位查看配件映射" :image-size="100" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 新增/编辑部位弹窗 -->
    <el-dialog v-model="locDialogVisible" :title="isLocEdit ? '编辑部位' : '新增部位'" width="400px" destroy-on-close>
      <el-form ref="locFormRef" :model="locForm" :rules="locRules" label-width="80px">
        <el-form-item label="部位名称" prop="locationName">
          <el-input v-model="locForm.locationName" placeholder="如：合模单元" />
        </el-form-item>
        <el-form-item label="排序号">
          <el-input-number v-model="locForm.sortOrder" :min="0" :max="999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="locDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="locSubmitLoading" @click="handleLocSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 添加配件映射弹窗 -->
    <el-dialog v-model="mapDialogVisible" title="添加配件到此部位" width="480px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="选择配件">
          <el-select
            v-model="selectedPartSkuIds"
            multiple
            filterable
            placeholder="搜索并选择配件"
            style="width: 100%"
          >
            <el-option
              v-for="p in availableParts"
              :key="p.partSkuId"
              :label="`${p.partName} (${p.partCode})`"
              :value="p.partSkuId"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="mapDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="mapSubmitLoading" @click="handleMapSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 复制部位弹窗 -->
    <el-dialog v-model="copyDialogVisible" title="从其他设备复制部位" width="420px" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item label="源设备">
          <el-select v-model="copyFromAssetId" filterable placeholder="选择源设备" style="width: 100%">
            <el-option
              v-for="a in otherAssets"
              :key="a.assetId"
              :label="`${a.assetName} (${a.assetId})`"
              :value="a.assetId"
            />
          </el-select>
        </el-form-item>
        <el-alert type="warning" :closable="false" show-icon>
          将复制源设备的所有部位及配件映射到当前设备
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="copyDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="copyLoading" @click="handleCopy">确定复制</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { ElMessage } from 'element-plus'

const route = useRoute()
const assetId = route.params.assetId
const assetInfo = ref(null)

// 部位相关
const locLoading = ref(false)
const locations = ref([])
const selectedLoc = ref(null)
const locDialogVisible = ref(false)
const isLocEdit = ref(false)
const locSubmitLoading = ref(false)
const locFormRef = ref()
const locForm = reactive({ locationId: '', locationName: '', sortOrder: 0 })
const locRules = { locationName: [{ required: true, message: '请输入部位名称', trigger: 'blur' }] }

// 映射相关
const mapLoading = ref(false)
const allMaps = ref([])
const allParts = ref([])
const mapDialogVisible = ref(false)
const mapSubmitLoading = ref(false)
const selectedPartSkuIds = ref([])

// 复制
const copyDialogVisible = ref(false)
const copyFromAssetId = ref('')
const copyLoading = ref(false)
const allAssets = ref([])

const currentMaps = computed(() => {
  if (!selectedLoc.value) return []
  return allMaps.value.filter(m => m.locationId === selectedLoc.value.locationId)
})

const availableParts = computed(() => {
  const usedIds = new Set(currentMaps.value.map(m => m.partSkuId))
  return allParts.value.filter(p => p.active && !usedIds.has(p.partSkuId))
})

const otherAssets = computed(() => allAssets.value.filter(a => a.assetId !== assetId && a.status === 'active'))

function selectLocation(loc) {
  selectedLoc.value = loc
}

function openLocDialog(loc) {
  if (loc) {
    isLocEdit.value = true
    Object.assign(locForm, { locationId: loc.locationId, locationName: loc.locationName, sortOrder: loc.sortOrder })
  } else {
    isLocEdit.value = false
    Object.assign(locForm, { locationId: '', locationName: '', sortOrder: locations.value.length + 1 })
  }
  locDialogVisible.value = true
}

async function handleLocSubmit() {
  try { await locFormRef.value.validate() } catch { return }
  locSubmitLoading.value = true
  try {
    const res = await api.upsertLocation({
      locationId: isLocEdit.value ? locForm.locationId : undefined,
      assetId,
      locationName: locForm.locationName,
      sortOrder: locForm.sortOrder,
    })
    if (res.ok) {
      ElMessage.success(isLocEdit.value ? '更新成功' : '创建成功')
      locDialogVisible.value = false
      await loadLocations()
    }
  } finally {
    locSubmitLoading.value = false
  }
}

async function deleteLoc(locationId) {
  const res = await api.deleteLocation(locationId)
  if (res.ok) {
    ElMessage.success('已删除')
    if (selectedLoc.value?.locationId === locationId) selectedLoc.value = null
    await loadLocations()
    await loadMaps()
  }
}

function openMapDialog() {
  selectedPartSkuIds.value = []
  mapDialogVisible.value = true
}

async function handleMapSubmit() {
  if (!selectedPartSkuIds.value.length) {
    ElMessage.warning('请选择至少一个配件')
    return
  }
  mapSubmitLoading.value = true
  try {
    for (const partSkuId of selectedPartSkuIds.value) {
      await api.upsertLocationPartMap({
        assetId,
        locationId: selectedLoc.value.locationId,
        partSkuId,
      })
    }
    ElMessage.success('添加成功')
    mapDialogVisible.value = false
    await loadMaps()
  } finally {
    mapSubmitLoading.value = false
  }
}

async function deleteMap(mapId) {
  const res = await api.deleteLocationPartMap(mapId)
  if (res.ok) {
    ElMessage.success('已移除')
    await loadMaps()
  }
}

function openCopyDialog() {
  copyFromAssetId.value = ''
  copyDialogVisible.value = true
}

async function handleCopy() {
  if (!copyFromAssetId.value) {
    ElMessage.warning('请选择源设备')
    return
  }
  copyLoading.value = true
  try {
    const res = await api.copyLocations(copyFromAssetId.value, assetId)
    if (res.ok) {
      ElMessage.success(`复制成功：${res.data.copiedLocations} 个部位，${res.data.copiedMaps} 条映射`)
      copyDialogVisible.value = false
      await loadLocations()
      await loadMaps()
    }
  } finally {
    copyLoading.value = false
  }
}

async function loadLocations() {
  locLoading.value = true
  try {
    const res = await api.listLocations(assetId)
    if (res.ok) locations.value = res.data.list
  } finally {
    locLoading.value = false
  }
}

async function loadMaps() {
  mapLoading.value = true
  try {
    const res = await api.listLocationPartMap(assetId)
    if (res.ok) allMaps.value = res.data.list
  } finally {
    mapLoading.value = false
  }
}

const appStore = useAppStore()

async function loadAssetInfo() {
  const res = await api.listAssets(appStore.currentFactoryId)
  if (res.ok) {
    allAssets.value = res.data.list
    assetInfo.value = res.data.list.find(a => a.assetId === assetId)
  }
}

async function loadParts() {
  const res = await api.listParts()
  if (res.ok) allParts.value = res.data.list
}

onMounted(async () => {
  await Promise.all([loadAssetInfo(), loadLocations(), loadMaps(), loadParts()])
})
</script>

<style lang="scss" scoped>
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
}

.map-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.loc-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;

  &:hover {
    background: #f5f7fa;
  }

  &.active {
    background: #e0f9e8;
    border-color: var(--kj-primary);
  }

  .loc-info {
    display: flex;
    align-items: center;
    gap: 8px;

    .loc-name {
      font-size: 14px;
      font-weight: 500;
    }
  }

  .loc-actions {
    display: flex;
    gap: 4px;
  }
}
</style>
