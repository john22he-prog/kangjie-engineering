<template>
  <div class="page-container">
    <div class="page-header">
      <h2>用户管理</h2>
      <el-button type="primary" @click="openDialog()">
        <el-icon><Plus /></el-icon>新增用户
      </el-button>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-input v-model="searchText" placeholder="搜索用户名/姓名" clearable style="width: 220px" prefix-icon="Search" />
      <el-select v-model="filterRole" placeholder="角色筛选" clearable style="width: 140px">
        <el-option label="管理员" value="Admin" />
        <el-option label="主管" value="Supervisor" />
        <el-option label="工程师" value="Engineer" />
        <el-option label="查看员" value="Viewer" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 120px">
        <el-option label="启用" value="active" />
        <el-option label="禁用" value="disabled" />
      </el-select>
    </div>

    <!-- 用户表格 -->
    <el-table :data="filteredList" v-loading="loading" stripe>
      <el-table-column prop="username" label="用户名" width="120" />
      <el-table-column prop="displayName" label="姓名" width="120" />
      <el-table-column prop="role" label="角色" width="100">
        <template #default="{ row }">
          <el-tag :type="roleTagType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="factoryId" label="管辖工厂" width="120">
        <template #default="{ row }">
          <span v-if="row.role === 'Supervisor'">{{ factoryNameMap[row.factoryId] || row.factoryId || '—' }}</span>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status === 'active' ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="openid" label="微信绑定" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.openid" type="success" size="small">已绑定</el-tag>
          <el-tag v-else type="info" size="small">未绑定</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="canPcLogin" label="PC登录" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.canPcLogin" type="success" size="small">是</el-tag>
          <el-tag v-else type="info" size="small">否</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button
            size="small"
            :type="row.status === 'active' ? 'warning' : 'success'"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'active' ? '禁用' : '启用' }}
          </el-button>
          <el-button
            v-if="row.openid"
            size="small"
            type="danger"
            plain
            @click="handleUnbind(row)"
          >
            解绑微信
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑用户' : '新增用户'"
      width="480px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="isEdit" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="姓名" prop="displayName">
          <el-input v-model="form.displayName" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" style="width: 100%">
            <el-option label="管理员" value="Admin" />
            <el-option label="主管" value="Supervisor" />
            <el-option label="工程师" value="Engineer" />
            <el-option label="查看员" value="Viewer" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.role === 'Supervisor'" label="管辖工厂" prop="factoryId">
          <el-select v-model="form.factoryId" placeholder="主管仅看该工厂全厂数据" clearable style="width: 100%">
            <el-option v-for="f in factoryOptions" :key="f.factoryId" :label="f.factoryName" :value="f.factoryId" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!isEdit" label="密码" prop="password">
          <el-input v-model="form.password" type="password" placeholder="留空则无PC端登录权限" show-password />
        </el-form-item>
        <el-form-item label="PC登录">
          <el-switch v-model="form.canPcLogin" />
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
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/utils/api'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const submitLoading = ref(false)
const list = ref([])
const searchText = ref('')
const filterRole = ref('')
const filterStatus = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const editUserId = ref('')
const formRef = ref()

const form = reactive({
  username: '',
  displayName: '',
  role: 'Engineer',
  factoryId: '',
  password: '',
  canPcLogin: false,
})
const factoryOptions = ref([])
const factoryNameMap = computed(() => {
  const m = {}
  factoryOptions.value.forEach(f => { m[f.factoryId] = f.factoryName })
  return m
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  displayName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
}

const filteredList = computed(() => {
  return list.value.filter(u => {
    if (searchText.value) {
      const s = searchText.value.toLowerCase()
      if (!u.username.toLowerCase().includes(s) && !u.displayName.toLowerCase().includes(s)) return false
    }
    if (filterRole.value && u.role !== filterRole.value) return false
    if (filterStatus.value && u.status !== filterStatus.value) return false
    return true
  })
})

function roleLabel(role) {
  return { Admin: '管理员', Supervisor: '主管', Engineer: '工程师', Viewer: '查看员' }[role] || role
}

function roleTagType(role) {
  return { Admin: 'danger', Supervisor: 'warning', Engineer: '', Viewer: 'info' }[role] || ''
}

function openDialog(row) {
  if (row) {
    isEdit.value = true
    editUserId.value = row.userId
    Object.assign(form, { username: row.username, displayName: row.displayName, role: row.role, factoryId: row.factoryId || '', password: '', canPcLogin: row.canPcLogin })
  } else {
    isEdit.value = false
    editUserId.value = ''
    Object.assign(form, { username: '', displayName: '', role: 'Engineer', factoryId: '', password: '', canPcLogin: false })
  }
  dialogVisible.value = true
}

async function handleSubmit() {
  try { await formRef.value.validate() } catch { return }
  submitLoading.value = true
  try {
    let res
    if (isEdit.value) {
      res = await api.updateUser(editUserId.value, {
        displayName: form.displayName,
        role: form.role,
        factoryId: form.role === 'Supervisor' ? form.factoryId : undefined,
        canPcLogin: form.canPcLogin,
      })
    } else {
      res = await api.createUser(form)
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
  try {
    await ElMessageBox.confirm(
      `确定要${row.status === 'active' ? '禁用' : '启用'}用户 "${row.displayName}" 吗？`,
      '确认操作'
    )
    const res = await api.disableUser(row.userId)
    if (res.ok) {
      ElMessage.success('操作成功')
      loadList()
    }
  } catch {}
}

async function handleUnbind(row) {
  try {
    await ElMessageBox.confirm(`确定要解除 "${row.displayName}" 的微信绑定吗？`, '确认解绑')
    const res = await api.unbindOpenid(row.userId)
    if (res.ok) {
      ElMessage.success('已解绑')
      loadList()
    }
  } catch {}
}

async function loadList() {
  loading.value = true
  try {
    const res = await api.listUsers()
    if (res.ok) list.value = res.data.list
  } finally {
    loading.value = false
  }
}

async function loadFactoryOptions() {
  const res = await api.listFactories()
  if (res.ok && res.data?.list) factoryOptions.value = res.data.list
}

onMounted(() => {
  loadList()
  loadFactoryOptions()
})
</script>
