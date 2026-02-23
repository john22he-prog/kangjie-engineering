<template>
  <el-container class="main-layout">
    <!-- 侧边栏（PC） -->
    <el-aside v-if="!isMobile" :width="sidebarCollapsed ? '64px' : '220px'" class="sidebar">
      <div class="logo-area">
        <img src="/vite.svg" class="logo-icon" />
        <span v-show="!sidebarCollapsed" class="logo-text">云南康洁</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :default-openeds="defaultOpeneds"
        :collapse="sidebarCollapsed"
        :router="false"
        background-color="#1d1e1f"
        text-color="#bfcbd9"
        active-text-color="#ffffff"
        class="sidebar-menu"
        @select="onMenuSelect"
      >
        <template v-if="isGroupedSidebar">
          <!-- 总览 -->
          <el-menu-item index="/company">
            <el-icon><HomeFilled /></el-icon>
            <template #title>总览</template>
          </el-menu-item>

          <!-- 工程部 -->
          <el-sub-menu index="dept-eng">
            <template #title>
              <el-icon><Monitor /></el-icon>
              <span>工程部</span>
            </template>
            <el-menu-item index="/dashboard">数据看板</el-menu-item>
            <el-menu-item index="/records">更换记录</el-menu-item>
            <el-menu-item index="/alerts">报警管理</el-menu-item>
            <el-menu-item index="/assets">设备管理</el-menu-item>
            <el-menu-item index="/parts">配件字典</el-menu-item>
            <el-menu-item index="/thresholds">阈值管理</el-menu-item>
            <el-menu-item index="/inventory">库存管理</el-menu-item>
          </el-sub-menu>

          <!-- 锅炉房 -->
          <el-sub-menu index="dept-boiler" disabled>
            <template #title>
              <el-icon><Sunrise /></el-icon>
              <span>锅炉房</span>
              <el-tag v-if="!sidebarCollapsed" size="small" type="info" class="menu-tag">即将接入</el-tag>
            </template>
          </el-sub-menu>


          <!-- 生产部 -->
          <el-sub-menu index="dept-prod" disabled>
            <template #title>
              <el-icon><SetUp /></el-icon>
              <span>生产部</span>
              <el-tag v-if="!sidebarCollapsed" size="small" type="info" class="menu-tag">即将接入</el-tag>
            </template>
          </el-sub-menu>

          <!-- 运输部 -->
          <el-sub-menu index="dept-trans" disabled>
            <template #title>
              <el-icon><Van /></el-icon>
              <span>运输部</span>
              <el-tag v-if="!sidebarCollapsed" size="small" type="info" class="menu-tag">即将接入</el-tag>
            </template>
          </el-sub-menu>

          <!-- 综合办 -->
          <el-sub-menu index="dept-admin" disabled>
            <template #title>
              <el-icon><OfficeBuilding /></el-icon>
              <span>综合办</span>
              <el-tag v-if="!sidebarCollapsed" size="small" type="info" class="menu-tag">即将接入</el-tag>
            </template>
          </el-sub-menu>

          <!-- 财务 -->
          <el-sub-menu index="dept-finance" disabled>
            <template #title>
              <el-icon><Coin /></el-icon>
              <span>财务</span>
              <el-tag v-if="!sidebarCollapsed" size="small" type="info" class="menu-tag">即将接入</el-tag>
            </template>
          </el-sub-menu>

          <!-- 系统管理 -->
          <el-sub-menu index="system">
            <template #title>
              <el-icon><Setting /></el-icon>
              <span>系统管理</span>
            </template>
            <el-menu-item index="/users">用户管理</el-menu-item>
            <el-menu-item index="/factories">工厂管理</el-menu-item>
            <el-menu-item index="/settings/ai">AI 设置</el-menu-item>
          </el-sub-menu>
        </template>

        <!-- 非管理层：扁平菜单 -->
        <template v-else>
          <template v-for="route in flatMenuRoutes" :key="route.path">
            <el-menu-item :index="'/' + route.path">
              <el-icon><component :is="route.meta.icon" /></el-icon>
              <template #title>{{ route.meta.title }}</template>
            </el-menu-item>
          </template>
        </template>
      </el-menu>
    </el-aside>

    <!-- 移动端：抽屉菜单 -->
    <el-drawer
      v-model="drawerVisible"
      direction="ltr"
      size="280px"
      :with-header="false"
      class="mobile-drawer"
      @closed="drawerVisible = false"
    >
      <div class="drawer-sidebar">
        <div class="logo-area">
          <img src="/vite.svg" class="logo-icon" />
          <span class="logo-text">云南康洁</span>
        </div>
        <el-menu
          :default-active="activeMenu"
          :default-openeds="defaultOpeneds"
          :router="false"
          background-color="#1d1e1f"
          text-color="#bfcbd9"
          active-text-color="#ffffff"
          class="sidebar-menu"
          @select="(idx) => { onMenuSelect(idx); drawerVisible = false }"
        >
          <template v-if="isGroupedSidebar">
            <el-menu-item index="/company">
              <el-icon><HomeFilled /></el-icon>
              <template #title>总览</template>
            </el-menu-item>

            <el-sub-menu index="dept-eng">
              <template #title>
                <el-icon><Monitor /></el-icon>
                <span>工程部</span>
              </template>
              <el-menu-item index="/dashboard">数据看板</el-menu-item>
              <el-menu-item index="/records">更换记录</el-menu-item>
              <el-menu-item index="/alerts">报警管理</el-menu-item>
              <el-menu-item index="/assets">设备管理</el-menu-item>
              <el-menu-item index="/parts">配件字典</el-menu-item>
              <el-menu-item index="/thresholds">阈值管理</el-menu-item>
              <el-menu-item index="/inventory">库存管理</el-menu-item>
            </el-sub-menu>

            <el-sub-menu index="dept-boiler" disabled>
              <template #title>
                <el-icon><Sunrise /></el-icon>
                <span>锅炉房</span>
                <el-tag size="small" type="info" class="menu-tag">即将接入</el-tag>
              </template>
            </el-sub-menu>


            <!-- 生产部 -->
            <el-sub-menu index="dept-prod" disabled>
              <template #title>
                <el-icon><SetUp /></el-icon>
                <span>生产部</span>
                <el-tag size="small" type="info" class="menu-tag">即将接入</el-tag>
              </template>
            </el-sub-menu>

            <!-- 运输部 -->
            <el-sub-menu index="dept-trans" disabled>
              <template #title>
                <el-icon><Van /></el-icon>
                <span>运输部</span>
                <el-tag size="small" type="info" class="menu-tag">即将接入</el-tag>
              </template>
            </el-sub-menu>

            <!-- 综合办 -->
            <el-sub-menu index="dept-admin" disabled>
              <template #title>
                <el-icon><OfficeBuilding /></el-icon>
                <span>综合办</span>
                <el-tag size="small" type="info" class="menu-tag">即将接入</el-tag>
              </template>
            </el-sub-menu>

            <!-- 财务 -->
            <el-sub-menu index="dept-finance" disabled>
              <template #title>
                <el-icon><Coin /></el-icon>
                <span>财务</span>
                <el-tag size="small" type="info" class="menu-tag">即将接入</el-tag>
              </template>
            </el-sub-menu>

            <el-sub-menu index="system">
              <template #title>
                <el-icon><Setting /></el-icon>
                <span>系统管理</span>
              </template>
              <el-menu-item index="/users">用户管理</el-menu-item>
              <el-menu-item index="/factories">工厂管理</el-menu-item>
              <el-menu-item index="/settings/ai">AI 设置</el-menu-item>
            </el-sub-menu>
          </template>

          <template v-else>
            <template v-for="route in flatMenuRoutes" :key="route.path">
              <el-menu-item :index="'/' + route.path">
                <el-icon><component :is="route.meta.icon" /></el-icon>
                <template #title>{{ route.meta.title }}</template>
              </el-menu-item>
            </template>
          </template>
        </el-menu>
      </div>
    </el-drawer>

    <!-- 右侧内容区 -->
    <el-container class="right-container">
      <el-header class="header" :class="{ 'header-mobile': isMobile }">
        <div class="header-left">
          <el-icon v-if="isMobile" class="collapse-btn" @click="drawerVisible = true">
            <Menu />
          </el-icon>
          <template v-else>
            <el-icon class="collapse-btn" @click="appStore.toggleSidebar">
              <Fold v-if="!sidebarCollapsed" />
              <Expand v-else />
            </el-icon>
          </template>
          <el-breadcrumb v-show="!isMobile" separator="/">
            <el-breadcrumb-item :to="{ path: isGroupedSidebar ? '/company' : '/' }">
              {{ isGroupedSidebar ? '总览' : '首页' }}
            </el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentGroup && currentRoute.path !== '/company'">
              {{ currentGroup }}
            </el-breadcrumb-item>
            <el-breadcrumb-item v-if="currentRoute.meta?.title && currentRoute.path !== '/company'">
              {{ currentRoute.meta.title }}
            </el-breadcrumb-item>
          </el-breadcrumb>
          <span v-show="isMobile" class="mobile-title">{{ currentRoute.meta?.title || '首页' }}</span>
        </div>
        <div class="header-right">
          <el-select
            v-if="appStore.factories.length > 0"
            :model-value="appStore.currentFactoryId"
            @change="onFactoryChange"
            :disabled="!authStore.canSwitchFactory"
            placeholder="选择工厂"
            style="width: 180px; margin-right: 16px;"
            size="default"
          >
            <el-option
              v-if="authStore.canSwitchFactory"
              key="__all__"
              label="全部工厂（汇总）"
              value=""
            />
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

      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import {
  Menu, Fold, Expand, ArrowDown, SwitchButton,
  HomeFilled, Monitor, Sunrise, Setting, SetUp, Van, OfficeBuilding, Coin,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const appStore = useAppStore()

const MOBILE_BREAKPOINT = 768
const isMobile = ref(window.innerWidth < MOBILE_BREAKPOINT)
const drawerVisible = ref(false)

function checkMobile() {
  isMobile.value = window.innerWidth < MOBILE_BREAKPOINT
}

onMounted(() => {
  window.addEventListener('resize', checkMobile)
  appStore.loadFactories()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', checkMobile)
})

const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)
const currentRoute = computed(() => route)

const isGroupedSidebar = computed(() => {
  const role = authStore.user?.role
  return role === 'Admin' || role === 'Management'
})

// 工程部路由路径
const engPaths = ['/dashboard', '/records', '/alerts', '/assets', '/parts', '/thresholds', '/inventory']
// 系统管理路由路径
const sysPaths = ['/users', '/factories', '/settings']

const activeMenu = computed(() => {
  const p = '/' + route.path.split('/').filter(Boolean).slice(0, 1).join('/')
  // 把 /settings 下的路由映射成完整路径
  if (route.path.startsWith('/settings/')) return route.path
  return p
})

const defaultOpeneds = computed(() => {
  const p = activeMenu.value
  const opened = []
  if (engPaths.some(ep => p.startsWith(ep))) opened.push('dept-eng')
  if (sysPaths.some(sp => p.startsWith(sp))) opened.push('system')
  return opened
})

const currentGroup = computed(() => {
  const p = activeMenu.value
  if (engPaths.some(ep => p.startsWith(ep))) return '工程部'
  if (sysPaths.some(sp => p.startsWith(sp))) return '系统管理'
  return ''
})

// 非管理层的扁平菜单
const flatMenuRoutes = computed(() => {
  const mainRoute = router.options.routes.find(r => r.path === '/')
  if (!mainRoute?.children) return []
  return mainRoute.children
    .filter(r => !r.meta?.hidden && r.path !== 'company')
    .filter(r => {
      if (r.meta?.roles) return r.meta.roles.includes(authStore.user?.role)
      return true
    })
})

function onMenuSelect(index) {
  if (index.startsWith('/')) router.push(index)
}

const roleLabel = computed(() => {
  const map = { Admin: '管理员', Supervisor: '主管', Management: '管理层', Engineer: '工程师', Viewer: '查看员' }
  return map[authStore.user?.role] || authStore.user?.role
})

const roleTagType = computed(() => {
  const map = { Admin: 'danger', Supervisor: 'warning', Management: 'success', Engineer: '', Viewer: 'info' }
  return map[authStore.user?.role] || ''
})

function onFactoryChange(factoryId) {
  if (factoryId === '') {
    appStore.setCurrentFactory('', '全部工厂')
    router.go(0)
  } else {
    const factory = appStore.factories.find(f => f.factoryId === factoryId)
    if (factory) {
      appStore.setCurrentFactory(factory.factoryId, factory.factoryName)
      router.go(0)
    }
  }
}

function handleCommand(cmd) {
  if (cmd === 'logout') {
    authStore.logout()
    router.push('/login')
  }
}
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

    :deep(.el-sub-menu__title:hover) {
      background: #333 !important;
    }

    :deep(.el-sub-menu .el-menu-item) {
      padding-left: 52px !important;
      min-width: 0;
    }

    :deep(.el-sub-menu.is-disabled .el-sub-menu__title) {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}

.menu-tag {
  margin-left: 8px;
  vertical-align: middle;
  transform: scale(0.85);
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

.header-mobile {
  padding: 0 12px;

  .header-left {
    gap: 12px;
  }

  .mobile-title {
    font-size: 16px;
    font-weight: 600;
    color: #303133;
  }

  .header-right :deep(.el-select) {
    width: 120px !important;
    margin-right: 8px !important;
  }

  .user-name {
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.mobile-drawer :deep(.el-drawer__body) {
  padding: 0;
  overflow: hidden;
  background: #1d1e1f;
}

.drawer-sidebar {
  height: 100%;
  background: #1d1e1f;

  .logo-area {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border-bottom: 1px solid #333;
    padding: 0 16px;
  }

  .logo-icon {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
  }

  .logo-text {
    font-size: 16px;
    font-weight: 600;
    color: #fff;
  }

  .sidebar-menu {
    border-right: none;

    :deep(.el-menu-item.is-active) {
      background: var(--kj-primary) !important;
    }
    :deep(.el-menu-item:hover) {
      background: #333 !important;
    }
    :deep(.el-sub-menu__title:hover) {
      background: #333 !important;
    }
    :deep(.el-sub-menu .el-menu-item) {
      padding-left: 52px !important;
    }
    :deep(.el-sub-menu.is-disabled .el-sub-menu__title) {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}
</style>
