<template>
  <el-container class="main-layout">
    <!-- 侧边栏 -->
    <el-aside :width="sidebarCollapsed ? '64px' : '220px'" class="sidebar">
      <div class="logo-area">
        <img src="/vite.svg" class="logo-icon" />
        <span v-show="!sidebarCollapsed" class="logo-text">康洁工程部</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="sidebarCollapsed"
        :router="true"
        background-color="#1d1e1f"
        text-color="#bfcbd9"
        active-text-color="#ffffff"
        class="sidebar-menu"
      >
        <template v-for="route in menuRoutes" :key="route.path">
          <el-menu-item :index="'/' + route.path">
            <el-icon><component :is="route.meta.icon" /></el-icon>
            <template #title>{{ route.meta.title }}</template>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>

    <!-- 右侧内容区 -->
    <el-container class="right-container">
      <!-- 顶部栏 -->
      <el-header class="header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="appStore.toggleSidebar">
            <Fold v-if="!sidebarCollapsed" />
            <Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentRoute.meta?.title">
              {{ currentRoute.meta.title }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <!-- 工厂选择器 -->
          <el-select
            v-if="appStore.factories.length > 0"
            :model-value="appStore.currentFactoryId"
            @change="onFactoryChange"
            :disabled="!authStore.canSwitchFactory"
            placeholder="选择工厂"
            style="width: 160px; margin-right: 16px;"
            size="default"
          >
            <el-option
              v-for="f in appStore.factories"
              :key="f.factoryId"
              :label="f.factoryName"
              :value="f.factoryId"
            />
          </el-select>

          <el-dropdown trigger="click" @command="handleCommand">
            <span class="user-info">
              <el-avatar :size="32" class="user-avatar">
                {{ authStore.user?.displayName?.charAt(0) || 'U' }}
              </el-avatar>
              <span class="user-name">{{ authStore.user?.displayName }}</span>
              <el-tag size="small" :type="roleTagType" class="role-tag">
                {{ roleLabel }}
              </el-tag>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 主内容 -->
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const appStore = useAppStore()

const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)
const currentRoute = computed(() => route)
const activeMenu = computed(() => '/' + route.path.split('/').filter(Boolean).slice(0, 1).join('/'))

// 过滤出菜单路由（排除 hidden 的）
const menuRoutes = computed(() => {
  const mainRoute = router.options.routes.find(r => r.path === '/')
  if (!mainRoute?.children) return []
  return mainRoute.children.filter(r => !r.meta?.hidden).filter(r => {
    // 角色过滤
    if (r.meta?.roles) {
      return r.meta.roles.includes(authStore.user?.role)
    }
    return true
  })
})

const roleLabel = computed(() => {
  const map = { Admin: '管理员', Supervisor: '主管', Management: '管理层', Engineer: '工程师', Viewer: '查看员' }
  return map[authStore.user?.role] || authStore.user?.role
})

const roleTagType = computed(() => {
  const map = { Admin: 'danger', Supervisor: 'warning', Management: 'success', Engineer: '', Viewer: 'info' }
  return map[authStore.user?.role] || ''
})

function onFactoryChange(factoryId) {
  const factory = appStore.factories.find(f => f.factoryId === factoryId)
  if (factory) {
    appStore.setCurrentFactory(factory.factoryId, factory.factoryName)
    // Trigger a page reload to refresh data with new factory context
    router.go(0)
  }
}

function handleCommand(cmd) {
  if (cmd === 'logout') {
    authStore.logout()
    router.push('/login')
  }
}

// Load factories on mount
onMounted(() => {
  appStore.loadFactories()
})
</script>

<style lang="scss" scoped>
.main-layout {
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  background: #1d1e1f;
  transition: width 0.3s;
  overflow: hidden;

  .logo-area {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border-bottom: 1px solid #333;
    padding: 0 16px;
    overflow: hidden;

    .logo-icon {
      width: 32px;
      height: 32px;
      flex-shrink: 0;
    }

    .logo-text {
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
    }
  }

  .sidebar-menu {
    border-right: none;

    :deep(.el-menu-item.is-active) {
      background: var(--kj-primary) !important;
      border-radius: 0;
    }

    :deep(.el-menu-item:hover) {
      background: #333 !important;
    }
  }
}

.right-container {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  height: 60px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  z-index: 10;

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;

    .collapse-btn {
      font-size: 20px;
      cursor: pointer;
      color: #606266;

      &:hover {
        color: var(--kj-primary);
      }
    }
  }

  .header-right {
    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      color: #606266;

      .user-avatar {
        background: var(--kj-primary);
        color: #fff;
        font-size: 14px;
      }

      .user-name {
        font-size: 14px;
      }

      .role-tag {
        margin-left: 4px;
      }
    }
  }
}

.main-content {
  background: var(--kj-bg);
  overflow-y: auto;
}
</style>
