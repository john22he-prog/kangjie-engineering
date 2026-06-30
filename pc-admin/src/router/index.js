import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { PERMISSIONS } from '@/utils/permissions'
import {
  DataAnalysis, List, Bell, Monitor, SetUp,
  Notebook, User, OfficeBuilding, Box, Setting,
  TrendCharts, House, Sunrise, HomeFilled, Clock,
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
    children: [
      { path: 'company', name: 'Company', component: () => import('@/views/company/index.vue'), meta: { title: '公司总览', icon: HomeFilled, hidden: true, permission: PERMISSIONS.MODULE_COMPANY } },
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/dashboard/index.vue'), meta: { title: '数据看板', icon: DataAnalysis, permission: PERMISSIONS.DASHBOARD_VIEW } },
      { path: 'dashboard/ai-report', name: 'AIReport', component: () => import('@/views/dashboard/ai-report.vue'), meta: { title: 'AI 分析报告', icon: TrendCharts, hidden: true, permission: PERMISSIONS.AI_USE } },
      { path: 'daily-timeline', name: 'DailyTimeline', component: () => import('@/views/dashboard/daily-timeline.vue'), meta: { title: '24小时事件记录', icon: Clock } },
      { path: 'records', name: 'Records', component: () => import('@/views/records/index.vue'), meta: { title: '更换记录', icon: List } },
      { path: 'alerts', name: 'Alerts', component: () => import('@/views/alerts/index.vue'), meta: { title: '报警管理', icon: Bell, permission: PERMISSIONS.ALERT_VIEW } },
      { path: 'assets', name: 'Assets', component: () => import('@/views/assets/index.vue'), meta: { title: '设备管理', icon: Monitor } },
      { path: 'assets/:assetId/locations', name: 'AssetLocations', component: () => import('@/views/assets/locations.vue'), props: true, meta: { title: '部位管理', hidden: true } },
      { path: 'parts', name: 'Parts', component: () => import('@/views/parts/index.vue'), meta: { title: '配件字典', icon: SetUp } },
      { path: 'thresholds', name: 'Thresholds', component: () => import('@/views/thresholds/index.vue'), meta: { title: '阈值管理', icon: Notebook, permission: PERMISSIONS.THRESHOLD_MANAGE } },
      { path: 'facility', name: 'Facility', component: () => import('@/views/facility/index.vue'), meta: { title: '厂务记录', icon: House } },
      { path: 'boiler-parts', name: 'Boiler', component: () => import('@/views/facility/index.vue'), meta: { title: '锅炉房记录', icon: Sunrise } },
      { path: 'boiler', name: 'BoilerDashboard', component: () => import('@/views/boiler/dashboard.vue'), meta: { title: '数据看板', icon: Sunrise, permission: PERMISSIONS.MODULE_BOILER } },
      { path: 'boiler/entry', name: 'BoilerEntry', component: () => import('@/views/boiler/records.vue'), meta: { title: '运行记录', hidden: true, permission: PERMISSIONS.MODULE_BOILER } },
      { path: 'boiler/records', name: 'BoilerRecords', component: () => import('@/views/boiler/records.vue'), meta: { title: '运行记录', permission: PERMISSIONS.MODULE_BOILER } },
      { path: 'boiler/trend', name: 'BoilerTrend', component: () => import('@/views/boiler/trend.vue'), meta: { title: '趋势分析', permission: PERMISSIONS.MODULE_BOILER } },
      { path: 'boiler/alerts', name: 'BoilerAlerts', component: () => import('@/views/boiler/alerts.vue'), meta: { title: '预警管理', permission: PERMISSIONS.MODULE_BOILER } },
      { path: 'boiler/customers', name: 'BoilerCustomers', component: () => import('@/views/boiler/customers.vue'), meta: { title: '客户用汽', permission: PERMISSIONS.MODULE_BOILER } },
      { path: 'boiler/settings', name: 'BoilerSettings', component: () => import('@/views/boiler/settings.vue'), meta: { title: '设备配置', permission: PERMISSIONS.MODULE_BOILER } },
      { path: 'boiler/ai-report', name: 'BoilerAIReport', component: () => import('@/views/boiler/ai-report.vue'), meta: { title: 'AI 分析', permission: PERMISSIONS.MODULE_BOILER } },
      { path: 'boiler/monthly', name: 'BoilerMonthly', component: () => import('@/views/boiler/monthly.vue'), meta: { title: '月度报表', permission: PERMISSIONS.MODULE_BOILER } },
      { path: 'boiler/fuel', name: 'BoilerFuel', component: () => import('@/views/boiler/fuel.vue'), meta: { title: '燃料管理', permission: PERMISSIONS.MODULE_BOILER } },
      { path: 'business/hotels', name: 'BusinessHotels', component: () => import('@/views/business/hotels.vue'), meta: { title: '客户档案', icon: OfficeBuilding, permission: PERMISSIONS.MODULE_BUSINESS } },
      { path: 'business/match', name: 'BusinessMatch', component: () => import('@/views/business/match.vue'), meta: { title: '片区匹配复核', icon: TrendCharts, permission: PERMISSIONS.MODULE_BUSINESS } },
      { path: 'users', name: 'Users', component: () => import('@/views/users/index.vue'), meta: { title: '用户管理', icon: User, permission: PERMISSIONS.USER_MANAGE } },
      { path: 'factories', name: 'Factories', component: () => import('@/views/factories/index.vue'), meta: { title: '工厂管理', icon: OfficeBuilding, permission: PERMISSIONS.FACTORY_MANAGE } },
      { path: 'inventory', name: 'Inventory', component: () => import('@/views/inventory/index.vue'), meta: { title: '库存管理', icon: Box } },
      { path: 'inventory/inbound', name: 'InventoryInbound', component: () => import('@/views/inventory/inbound.vue'), meta: { title: '入库登记', hidden: true, permission: PERMISSIONS.INVENTORY_MANAGE } },
      { path: 'inventory/logs', name: 'InventoryLogs', component: () => import('@/views/inventory/logs.vue'), meta: { title: '出入库记录', hidden: true } },
      { path: 'inspection', name: 'Inspection', component: () => import('@/views/inspection/index.vue'), meta: { title: '巡检管理', icon: List } },
      { path: 'settings/ai', name: 'AISettings', component: () => import('@/views/settings/ai.vue'), meta: { title: 'AI 设置', icon: Setting, permission: PERMISSIONS.SYSTEM_ADMIN } },
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

  if (to.path === '/') {
    if (auth.hasPermission(PERMISSIONS.MODULE_COMPANY)) {
      return next('/company')
    }
    return next('/dashboard')
  }

  if (to.meta.permission && !auth.hasPermission(to.meta.permission)) {
    return next('/dashboard')
  }

  next()
})

export default router
