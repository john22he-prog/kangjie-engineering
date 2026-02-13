<template>
  <div class="page-container">
    <div class="page-header">
      <h2>工厂管理</h2>
      <div class="header-actions">
        <el-button type="primary" @click="openDialog()">
          <el-icon><Plus /></el-icon>新增工厂
        </el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="factoryCode" label="工厂编号" width="120" />
      <el-table-column prop="factoryName" label="工厂名称" min-width="160" />
      <el-table-column prop="address" label="地址" min-width="200" />
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status === 'active' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button
            size="small"
            :type="row.status === 'active' ? 'warning' : 'success'"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'active' ? '停用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑工厂' : '新增工厂'" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="工厂编号" prop="factoryCode">
          <el-input v-model="form.factoryCode" :disabled="isEdit" placeholder="如 SH、BJ" />
        </el-form-item>
        <el-form-item label="工厂名称" prop="factoryName">
          <el-input v-model="form.factoryName" placeholder="如 上海工厂" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="form.address" placeholder="可选" />
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
import { ref, reactive, onMounted } from 'vue'
import { api } from '@/utils/api'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const submitLoading = ref(false)
const list = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editFactoryId = ref('')
const formRef = ref()

const form = reactive({
  factoryCode: '',
  factoryName: '',
  address: '',
})

const formRules = {
  factoryCode: [{ required: true, message: '请输入工厂编号', trigger: 'blur' }],
  factoryName: [{ required: true, message: '请输入工厂名称', trigger: 'blur' }],
}

function openDialog(row) {
  if (row) {
    isEdit.value = true
    editFactoryId.value = row.factoryId
    Object.assign(form, { factoryCode: row.factoryCode, factoryName: row.factoryName, address: row.address || '' })
  } else {
    isEdit.value = false
    editFactoryId.value = ''
    Object.assign(form, { factoryCode: '', factoryName: '', address: '' })
  }
  dialogVisible.value = true
}

async function handleSubmit() {
  try { await formRef.value.validate() } catch { return }
  submitLoading.value = true
  try {
    let res
    if (isEdit.value) {
      res = await api.updateFactory(editFactoryId.value, {
        factoryName: form.factoryName,
        factoryCode: form.factoryCode,
        address: form.address,
      })
    } else {
      res = await api.createFactory(form)
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
  const res = await api.updateFactory(row.factoryId, { status: newStatus })
  if (res.ok) {
    ElMessage.success('状态已更新')
    loadList()
  } else {
    ElMessage.error(res.error?.message || '操作失败')
  }
}

async function loadList() {
  loading.value = true
  try {
    const res = await api.listFactories()
    if (res.ok) list.value = res.data.list
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
}
</style>
