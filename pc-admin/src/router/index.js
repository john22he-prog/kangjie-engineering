import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '数据看板', icon: 'DataAnalysis' },
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/users/index.vue'),
        meta: { title: '用户管理', icon: 'User', roles: ['Admin'] },
      },
      {
        path: 'assets',
        name: 'Assets',
        component: () => import('@/views/assets/index.vue'),
        meta: { title: '设备管理', icon: 'Monitor' },
      },
      {
        path: 'assets/:assetId/locations',
        name: 'AssetLocations',
        component: () => import('@/views/assets/locations.vue'),
        meta: { title: '部位与映射管理', icon: 'Monitor', hidden: true },
      },
      {
        path: 'parts',
        name: 'Parts',
        component: () => import('@/views/parts/index.vue'),
        meta: { title: '配件字典', icon: 'Box' },
      },
      {
        path: 'thresholds',
        name: 'Thresholds',
        component: () => import('@/views/thresholds/index.vue'),
        meta: { title: '阈值配置', icon: 'Warning' },
      },
      {
        path: 'records',
        name: 'Records',
        component: () => import('@/views/records/index.vue'),
        meta: { title: '更换记录', icon: 'Document' },
      },
      {
        path: 'alerts',
        name: 'Alerts',
        component: () => import('@/views/alerts/index.vue'),
        meta: { title: '报警管理', icon: 'Bell' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 路由守卫
router.beforeEach((to, from, next) => {
  document.title = `${to.meta.title || ''} - 康洁工程部管理后台`

  const authStore = useAuthStore()

  // 公开页面直接放行
  if (to.meta.public) {
    if (authStore.isLoggedIn) {
      return next('/dashboard')
    }
    return next()
  }

  // 未登录跳转登录
  if (!authStore.isLoggedIn) {
    return next('/login')
  }

  // 角色权限检查
  if (to.meta.roles && !to.meta.roles.includes(authStore.user?.role)) {
    ElMessage.error('无权访问该页面')
    return next('/dashboard')
  }

  next()
})

export default router
