<template>
  <div class="page-container">
    <div class="page-header">
      <h2>设备管理</h2>
      <el-button type="primary" @click="openDialog()">
        <el-icon><Plus /></el-icon>新增设备
      </el-button>
    </div>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-input v-model="searchText" placeholder="搜索设备名称/编号" clearable style="width: 240px" prefix-icon="Search" />
      <el-select v-model="filterWorkshop" placeholder="车间筛选" clearable style="width: 140px">
        <el-option v-for="w in workshops" :key="w" :label="w" :value="w" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 120px">
        <el-option label="启用" value="active" />
        <el-option label="停用" value="inactive" />
      </el-select>
    </div>

    <!-- 设备表格 -->
    <el-table :data="filteredList" v-loading="loading" stripe>
      <el-table-column prop="assetId" label="设备ID" width="120" />
      <el-table-column prop="assetName" label="设备名称" min-width="150" />
      <el-table-column prop="assetNo" label="设备编号" width="140" />
      <el-table-column prop="workshop" label="车间/区域" width="120" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status === 'active' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建日期" width="120">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="primary" plain @click="goLocations(row)">
            部位管理
          </el-button>
          <el-button size="small" type="success" plain @click="showQrCode(row)">
            <el-icon><View /></el-icon>QR码
          </el-button>
          <el-button
            size="small"
            :type="row.status === 'active' ? 'warning' : 'success'"
            plain
            @click="toggleStatus(row)"
          >
            {{ row.status === 'active' ? '停用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑设备' : '新增设备'"
      width="520px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="设备ID" prop="assetId">
          <el-input v-model="form.assetId" :disabled="isEdit" placeholder="如 ZB-006，留空自动生成" />
        </el-form-item>
        <el-form-item label="设备名称" prop="assetName">
          <el-input v-model="form.assetName" placeholder="如 注塑机A-03" />
        </el-form-item>
        <el-form-item label="设备编号" prop="assetNo">
          <el-input v-model="form.assetNo" placeholder="如 EQ-2024-006" />
        </el-form-item>
        <el-form-item label="设备类型">
          <el-input v-model="form.deviceTypeId" placeholder="如 injection / press" />
        </el-form-item>
        <el-form-item label="车间/区域">
          <el-input v-model="form.workshop" placeholder="如 A车间" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- QR码弹窗 -->
    <el-dialog v-model="qrDialogVisible" title="设备二维码" width="360px" align-center>
      <div class="qr-dialog-body">
        <canvas ref="qrCanvasRef" class="qr-canvas"></canvas>
        <p class="qr-info">{{ qrAsset?.assetName }}</p>
        <p class="qr-sub">{{ qrAsset?.assetId }}</p>
      </div>
      <template #footer>
        <el-button type="primary" @click="downloadQr">下载二维码</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import QRCode from 'qrcode'

const router = useRouter()
const loading = ref(false)
const submitLoading = ref(false)
const list = ref([])
const searchText = ref('')
const filterWorkshop = ref('')
const filterStatus = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const editAssetId = ref('')
const formRef = ref()
const qrDialogVisible = ref(false)
const qrCanvasRef = ref()
const qrAsset = ref(null)

const form = reactive({
  assetId: '',
  assetName: '',
  assetNo: '',
  deviceTypeId: '',
  workshop: '',
})

const formRules = {
  assetName: [{ required: true, message: '请输入设备名称', trigger: 'blur' }],
  assetNo: [{ required: true, message: '请输入设备编号', trigger: 'blur' }],
}

const workshops = computed(() => {
  const set = new Set(list.value.map(a => a.workshop).filter(Boolean))
  return Array.from(set)
})

const filteredList = computed(() => {
  return list.value.filter(a => {
    if (searchText.value) {
      const s = searchText.value.toLowerCase()
      if (!a.assetName.toLowerCase().includes(s) && !a.assetNo.toLowerCase().includes(s)) return false
    }
    if (filterWorkshop.value && a.workshop !== filterWorkshop.value) return false
    if (filterStatus.value && a.status !== filterStatus.value) return false
    return true
  })
})

function formatDate(ts) {
  return ts ? dayjs(ts).format('YYYY-MM-DD') : '-'
}

function openDialog(row) {
  if (row) {
    isEdit.value = true
    editAssetId.value = row.assetId
    Object.assign(form, { assetId: row.assetId, assetName: row.assetName, assetNo: row.assetNo, deviceTypeId: row.deviceTypeId || '', workshop: row.workshop || '' })
  } else {
    isEdit.value = false
    editAssetId.value = ''
    Object.assign(form, { assetId: '', assetName: '', assetNo: '', deviceTypeId: '', workshop: '' })
  }
  dialogVisible.value = true
}

async function handleSubmit() {
  try { await formRef.value.validate() } catch { return }
  submitLoading.value = true
  try {
    let res
    if (isEdit.value) {
      res = await api.updateAsset(editAssetId.value, {
        assetName: form.assetName,
        assetNo: form.assetNo,
        deviceTypeId: form.deviceTypeId,
        workshop: form.workshop,
      })
    } else {
      res = await api.createAsset(form)
    }
    if (res.ok) {
      ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
      dialogVisible.value = false
      loadList()
    } else {
      ElMessage.error(res.error?.message || '操作失败')
    }
  } finally {
    submitLoading.value = false
  }
}

async function toggleStatus(row) {
  const newStatus = row.status === 'active' ? 'inactive' : 'active'
  try {
    await ElMessageBox.confirm(
      `确定要${newStatus === 'active' ? '启用' : '停用'}设备 "${row.assetName}" 吗？`,
      '确认操作'
    )
    const res = await api.setAssetStatus(row.assetId, newStatus)
    if (res.ok) {
      ElMessage.success('操作成功')
      loadList()
    }
  } catch {}
}

function goLocations(row) {
  router.push(`/assets/${row.assetId}/locations`)
}

async function showQrCode(row) {
  qrAsset.value = row
  qrDialogVisible.value = true
  await nextTick()
  if (qrCanvasRef.value) {
    QRCode.toCanvas(qrCanvasRef.value, row.assetId, {
      width: 200,
      margin: 2,
      color: { dark: '#1d1e1f', light: '#ffffff' },
    })
  }
}

function downloadQr() {
  if (!qrCanvasRef.value) return
  const link = document.createElement('a')
  link.download = `QR-${qrAsset.value.assetId}.png`
  link.href = qrCanvasRef.value.toDataURL()
  link.click()
}

const appStore = useAppStore()

async function loadList() {
  loading.value = true
  try {
    const res = await api.listAssets(appStore.currentFactoryId)
    if (res.ok) list.value = res.data.list
  } finally {
    loading.value = false
  }
}

onMounted(loadList)
</script>

<style lang="scss" scoped>
.qr-dialog-body {
  text-align: center;
  padding: 20px 0;

  .qr-canvas {
    display: block;
    margin: 0 auto;
  }

  .qr-info {
    margin-top: 12px;
    font-size: 16px;
    font-weight: 600;
    color: #303133;
  }

  .qr-sub {
    font-size: 14px;
    color: #909399;
    margin-top: 4px;
  }
}
</style>
