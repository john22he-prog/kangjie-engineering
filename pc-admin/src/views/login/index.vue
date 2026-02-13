<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <img src="/vite.svg" class="login-logo" />
        <h1>康洁工程部管理后台</h1>
        <p class="login-subtitle">设备配件更换记录与报警管理系统</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        size="large"
        @keyup.enter="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="用户名"
            prefix-icon="User"
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            prefix-icon="Lock"
            show-password
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            class="login-btn"
            :loading="loading"
            @click="handleLogin"
          >
            登 录
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-tips">
        <el-divider>开发模式测试账号</el-divider>
        <div class="test-accounts">
          <el-tag
            v-for="acc in testAccounts"
            :key="acc.username"
            :type="acc.type"
            class="test-tag"
            @click="fillAccount(acc)"
          >
            {{ acc.label }}：{{ acc.username }} / {{ acc.password }}
          </el-tag>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const router = useRouter()
const authStore = useAuthStore()
const formRef = ref()
const loading = ref(false)

const form = reactive({
  username: '',
  password: '',
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const testAccounts = [
  { label: '管理员', username: 'admin', password: 'admin123', type: 'danger' },
  { label: '主管', username: 'supervisor', password: 'super123', type: 'warning' },
]

function fillAccount(acc) {
  form.username = acc.username
  form.password = acc.password
}

async function handleLogin() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  loading.value = true
  try {
    const res = await authStore.login(form.username, form.password)
    if (res.ok) {
      ElMessage.success(`欢迎回来，${res.data.user.displayName}`)
      router.push('/dashboard')
    } else {
      ElMessage.error(res.error?.message || '登录失败')
    }
  } catch (err) {
    ElMessage.error('登录出错，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e0f9e8 0%, #f5f7fa 50%, #e8f4fd 100%);
}

.login-card {
  width: 420px;
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);

  .login-header {
    text-align: center;
    margin-bottom: 32px;

    .login-logo {
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
    }

    h1 {
      font-size: 22px;
      font-weight: 600;
      color: #303133;
      margin: 0 0 8px;
    }

    .login-subtitle {
      font-size: 14px;
      color: #909399;
      margin: 0;
    }
  }

  .login-btn {
    width: 100%;
    height: 44px;
    font-size: 16px;
  }

  .login-tips {
    margin-top: 16px;

    .test-accounts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;

      .test-tag {
        cursor: pointer;
        transition: transform 0.2s;

        &:hover {
          transform: scale(1.05);
        }
      }
    }
  }
}
</style>
