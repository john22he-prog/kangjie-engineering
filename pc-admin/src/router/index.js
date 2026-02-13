import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  DataAnalysis, List, Bell, Monitor, SetUp,
  Notebook, User, OfficeBuilding, Box, Setting,
  TrendCharts,
} from '@element-plus/icons-vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/dashboard/index.vue'), meta: { title: '数据看板', icon: DataAnalysis } },
      { path: 'dashboard/ai-report', name: 'AIReport', component: () => import('@/views/dashboard/ai-report.vue'), meta: { title: 'AI 分析报告', icon: TrendCharts } },
      { path: 'records', name: 'Records', component: () => import('@/views/records/index.vue'), meta: { title: '更换记录', icon: List } },
      { path: 'alerts', name: 'Alerts', component: () => import('@/views/alerts/index.vue'), meta: { title: '报警管理', icon: Bell } },
      { path: 'assets', name: 'Assets', component: () => import('@/views/assets/index.vue'), meta: { title: '设备管理', icon: Monitor } },
      { path: 'assets/:assetId/locations', name: 'AssetLocations', component: () => import('@/views/assets/locations.vue'), props: true, meta: { title: '部位管理', hidden: true } },
      { path: 'parts', name: 'Parts', component: () => import('@/views/parts/index.vue'), meta: { title: '配件字典', icon: SetUp } },
      { path: 'thresholds', name: 'Thresholds', component: () => import('@/views/thresholds/index.vue'), meta: { title: '阈值管理', icon: Notebook } },
      { path: 'users', name: 'Users', component: () => import('@/views/users/index.vue'), meta: { title: '用户管理', icon: User, roles: ['Admin'] } },
      { path: 'factories', name: 'Factories', component: () => import('@/views/factories/index.vue'), meta: { title: '工厂管理', icon: OfficeBuilding, roles: ['Admin'] } },
      { path: 'inventory', name: 'Inventory', component: () => import('@/views/inventory/index.vue'), meta: { title: '库存管理', icon: Box } },
      { path: 'inventory/inbound', name: 'InventoryInbound', component: () => import('@/views/inventory/inbound.vue'), meta: { title: '入库登记', hidden: true } },
      { path: 'inventory/logs', name: 'InventoryLogs', component: () => import('@/views/inventory/logs.vue'), meta: { title: '出入库记录', hidden: true } },
      { path: 'settings/ai', name: 'AISettings', component: () => import('@/views/settings/ai.vue'), meta: { title: 'AI 设置', icon: Setting, roles: ['Admin'] } },
    ],
  },
]

const router = createRouter({
  history: import.meta.env.PROD ? createWebHashHistory() : createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isLoggedIn) {
    return next('/login')
  }
  if (to.meta.roles && !to.meta.roles.includes(auth.user?.role)) {
    return next('/dashboard')
  }
  next()
})

export default router
