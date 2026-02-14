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
      <el-table-column prop="factoryId" label="所属工厂" width="120">
        <template #default="{ row }">
          <span v-if="row.factoryId">{{ factoryNameMap[row.factoryId] || row.factoryId }}</span>
          <el-tag v-else type="warning" size="small" effect="plain">未分配</el-tag>
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
      <el-table-column label="操作" width="340" fixed="right">
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
          <el-button
            v-if="authStore.isAdmin && row.userId !== authStore.user?.userId"
            size="small"
            type="danger"
            @click="handleDelete(row)"
          >
            删除
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
          <!-- 角色权限说明 -->
          <div class="role-desc">
            <el-alert
              :title="roleDescriptions[form.role]?.title || ''"
              :description="roleDescriptions[form.role]?.desc || ''"
              type="info"
              :closable="false"
              show-icon
              style="margin-top: 8px;"
            />
          </div>
        </el-form-item>
        <el-form-item label="所属工厂" prop="factoryId">
          <el-select v-model="form.factoryId" placeholder="选择该用户所属的工厂" clearable style="width: 100%">
            <el-option v-for="f in factoryOptions" :key="f.factoryId" :label="f.factoryName" :value="f.factoryId" />
          </el-select>
          <div v-if="form.role === 'Supervisor'" class="field-hint">主管只能查看和管理所属工厂的数据</div>
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
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

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

// 角色权限说明
const roleDescriptions = {
  Admin: {
    title: '管理员 — 最高权限',
    desc: '可管理所有工厂数据、用户账号、设备配件、阈值报警、库存、AI设置等全部功能。可切换查看不同工厂，可查看成本数据和AI报告汇总。',
  },
  Supervisor: {
    title: '主管 — 本厂管理',
    desc: '仅能查看和管理所绑定工厂的数据（更换记录、报警、设备、库存等）。可查看成本数据和AI报告。不可管理用户和工厂。',
  },
  Engineer: {
    title: '工程师 — 小程序操作',
    desc: '通过小程序扫码录入更换记录，查看设备信息。无法登录PC端管理后台。',
  },
  Viewer: {
    title: '查看员 — 只读查看',
    desc: '可登录PC端查看所有数据（看板、记录、报表、库存等），可生成AI报告。但不能进行编辑、新增、删除等操作。',
  },
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
        factoryId: form.factoryId || '',
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

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确定要永久删除用户 "${row.displayName}（${row.username}）" 吗？此操作不可恢复！`,
      '确认删除',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
    const res = await api.deleteUser(row.userId)
    if (res.ok) {
      ElMessage.success('用户已删除')
      loadList()
    } else {
      ElMessage.error(res.error?.message || '删除失败')
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

<style scoped>
.field-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  margin-top: 4px;
}
</style>
