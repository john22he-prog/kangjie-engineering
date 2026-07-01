<template>
  <div class="page-container">
    <div class="page-header">
      <h2>客户档案与绑定</h2>
      <div class="header-actions">
        <el-input
          v-model="filterText"
          placeholder="搜索名称/地址"
          clearable
          style="width: 220px"
          :prefix-icon="Search"
        />
        <el-button v-if="canManage" type="primary" @click="openAdd">
          <el-icon><Plus /></el-icon>新增客户
        </el-button>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="推荐使用「POI 建档」从高德地图选点录入，坐标精确、自动建立 1:1 绑定，匹配准确率更高。"
      style="margin-bottom: 12px"
    />

    <el-table :data="filteredList" v-loading="loading" stripe>
      <el-table-column prop="name" label="客户名称" min-width="180" />
      <el-table-column prop="address" label="地址" min-width="220" show-overflow-tooltip />
      <el-table-column prop="contact" label="联系人" width="110" />
      <el-table-column label="绑定状态" width="160">
        <template #default="{ row }">
          <el-tag v-if="row.amapPoiId" type="success" size="small">已绑 POI</el-tag>
          <el-tag v-else type="info" size="small">未绑定</el-tag>
          <el-tag v-if="row.geoLevel === 'POI' || row.locateSource === 'poi'" type="warning" size="small" style="margin-left: 4px">POI精确</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canManage && row.amapPoiId" size="small" type="warning" @click="onUnbind(row)">解绑</el-button>
          <el-button v-if="canManage" size="small" type="danger" @click="onDelete(row)">删除</el-button>
          <span v-if="!canManage" class="text-muted">仅查看</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增弹窗 -->
    <el-dialog v-model="dialogVisible" title="新增客户" width="640px" destroy-on-close>
      <el-radio-group v-model="addMode" style="margin-bottom: 16px">
        <el-radio-button label="poi">POI 建档（推荐）</el-radio-button>
        <el-radio-button label="manual">手动录入</el-radio-button>
      </el-radio-group>

      <!-- POI 建档 -->
      <div v-if="addMode === 'poi'">
        <div class="poi-search-bar">
          <el-input v-model="poiKeyword" placeholder="输入客户名称关键词" style="flex: 1" @keyup.enter="onSearchPoi" />
          <el-input v-model="poiCity" placeholder="城市(如 昆明)" style="width: 140px" />
          <el-button type="primary" :loading="poiLoading" @click="onSearchPoi">搜索</el-button>
        </div>
        <el-table :data="poiResults" v-loading="poiLoading" max-height="320" size="small" style="margin-top: 12px">
          <el-table-column prop="name" label="名称" min-width="160" />
          <el-table-column prop="address" label="地址" min-width="200" show-overflow-tooltip />
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="onPickPoi(row)">建档</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!poiLoading && poiSearched && poiResults.length === 0" description="无搜索结果" :image-size="60" />
      </div>

      <!-- 手动录入 -->
      <el-form v-else ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="客户名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入客户名称" />
        </el-form-item>
        <el-form-item label="地址" prop="address">
          <el-input v-model="form.address" placeholder="详细地址（用于地理编码定位）" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contact" placeholder="可选" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-if="addMode === 'manual'" type="primary" :loading="submitLoading" @click="onSubmitManual">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { PERMISSIONS } from '@/utils/permissions'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission(PERMISSIONS.BUSINESS_MANAGE))

const loading = ref(false)
const list = ref([])
const filterText = ref('')

const filteredList = computed(() => {
  const kw = filterText.value.trim()
  if (!kw) return list.value
  return list.value.filter(h => (h.name || '').includes(kw) || (h.address || '').includes(kw))
})

const dialogVisible = ref(false)
const addMode = ref('poi')

// POI 建档
const poiKeyword = ref('')
const poiCity = ref('昆明')
const poiResults = ref([])
const poiLoading = ref(false)
const poiSearched = ref(false)

// 手动录入
const submitLoading = ref(false)
const formRef = ref()
const form = reactive({ name: '', address: '', contact: '', remark: '' })
const formRules = {
  name: [{ required: true, message: '请输入客户名称', trigger: 'blur' }],
  address: [{ required: true, message: '请输入地址', trigger: 'blur' }],
}

function openAdd() {
  addMode.value = 'poi'
  poiKeyword.value = ''
  poiResults.value = []
  poiSearched.value = false
  Object.assign(form, { name: '', address: '', contact: '', remark: '' })
  dialogVisible.value = true
}

async function onSearchPoi() {
  if (!poiKeyword.value.trim()) return ElMessage.warning('请输入关键词')
  poiLoading.value = true
  poiSearched.value = true
  try {
    const res = await api.bizSearchPOI({ keywords: poiKeyword.value.trim(), city: poiCity.value.trim(), pageSize: 20 })
    if (res.ok) poiResults.value = res.data.pois || []
    else ElMessage.error(res.error?.message || '搜索失败')
  } finally {
    poiLoading.value = false
  }
}

async function onPickPoi(poi) {
  try {
    await ElMessageBox.confirm(`确认以「${poi.name}」建档并自动绑定该 POI？`, '确认建档', { type: 'warning' })
  } catch { return }
  const res = await api.bizSaveHotelFromPOI({ poi, autoBind: true })
  if (res.ok) {
    ElMessage.success('建档成功')
    dialogVisible.value = false
    loadList()
  } else {
    ElMessage.error(res.error?.message || '建档失败')
  }
}

async function onSubmitManual() {
  try { await formRef.value.validate() } catch { return }
  submitLoading.value = true
  try {
    const res = await api.bizSaveHotel({ ...form })
    if (res.ok) {
      ElMessage.success(res.data?.warning ? `保存成功（${res.data.warning}）` : '保存成功')
      dialogVisible.value = false
      loadList()
    } else {
      ElMessage.error(res.error?.message || '保存失败')
    }
  } finally {
    submitLoading.value = false
  }
}

async function onUnbind(row) {
  try {
    await ElMessageBox.confirm(`确认解除「${row.name}」与 POI 的绑定？`, '解除绑定', { type: 'warning' })
  } catch { return }
  const res = await api.bizUnbindPOI({ hotelId: row._id })
  if (res.ok) { ElMessage.success('已解绑'); loadList() }
  else ElMessage.error(res.error?.message || '解绑失败')
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除客户「${row.name}」？将同时解除其绑定。`, '删除客户', { type: 'warning' })
  } catch { return }
  const res = await api.bizDeleteHotel(row._id)
  if (res.ok) { ElMessage.success('已删除'); loadList() }
  else ElMessage.error(res.error?.message || '删除失败')
}

async function loadList() {
  loading.value = true
  try {
    const res = await api.bizListHotels({ pageSize: 500 })
    if (res.ok) list.value = res.data.list || []
    else ElMessage.error(res.error?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadList)
</script>

<style lang="scss" scoped>
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.poi-search-bar {
  display: flex;
  gap: 8px;
}
.text-muted {
  color: #909399;
  font-size: 13px;
}
</style>
