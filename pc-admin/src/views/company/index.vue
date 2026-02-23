<template>
  <div class="page-container company-overview">
    <div class="page-header">
      <h2>公司总览</h2>
      <div class="header-right-info">
        <span class="factory-hint">{{ currentFactoryLabel }}</span>
        <span class="month-hint">{{ currentMonth }}</span>
      </div>
    </div>

    <!-- 关键数据摘要 -->
    <h3 class="section-title">关键数据摘要</h3>
    <el-row :gutter="16" class="stat-row">
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon icon-green">
            <el-icon :size="24"><Document /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ stats.totalLogs }}</div>
            <div class="stat-label">总更换次数</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon icon-blue">
            <el-icon :size="24"><Box /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ stats.totalPartsQty }}</div>
            <div class="stat-label">配件消耗总量</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon icon-red">
            <el-icon :size="24"><Warning /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value" :class="{ 'text-warning': stats.openAlerts > 0 }">
              {{ stats.openAlerts }}
            </div>
            <div class="stat-label">待处理报警</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon icon-orange">
            <el-icon :size="24"><Bell /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ stats.totalAlerts }}</div>
            <div class="stat-label">总报警数</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 跨部门统计（预留） -->
    <h3 class="section-title">跨部门统计</h3>
    <el-card shadow="never" class="cross-dept-placeholder">
      <el-empty description="更多部门接入后，将在此展示跨部门汇总数据" :image-size="120" />
    </el-card>
    <!-- 部门状态卡片 -->
    <h3 class="section-title">部门状态</h3>
    <el-row :gutter="16" class="dept-row">
      <!-- 工程部 -->
      <el-col :xs="24" :sm="12">
        <el-card shadow="hover" class="dept-card" @click="$router.push('/dashboard')">
          <div class="dept-header">
            <div class="dept-icon dept-icon-eng">
              <el-icon :size="28"><Monitor /></el-icon>
            </div>
            <div class="dept-info">
              <span class="dept-name">工程部</span>
              <el-tag
                :type="stats.openAlerts > 0 ? 'warning' : 'success'"
                size="small"
                round
              >
                {{ stats.openAlerts > 0 ? `${stats.openAlerts} 条报警待处理` : '运行正常' }}
              </el-tag>
            </div>
          </div>
          <div class="dept-metrics">
            <div class="metric-item">
              <span class="metric-value">{{ stats.totalLogs }}</span>
              <span class="metric-label">本月更换</span>
            </div>
            <div class="metric-item">
              <span class="metric-value" :class="{ 'text-warning': stats.openAlerts > 0 }">
                {{ stats.openAlerts }}
              </span>
              <span class="metric-label">待处理报警</span>
            </div>
            <div class="metric-item">
              <span class="metric-value">{{ stats.totalPartsQty }}</span>
              <span class="metric-label">配件消耗</span>
            </div>
            <div class="metric-item">
              <span class="metric-value money">¥{{ formatMoney(stats.inventoryValue) }}</span>
              <span class="metric-label">库存金额</span>
            </div>
            <div class="metric-item">
              <span class="metric-value money">¥{{ formatMoney(stats.usageCost) }}</span>
              <span class="metric-label">本月使用金额</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 锅炉房（预留） -->
      <el-col :xs="24" :sm="12">
        <el-card shadow="never" class="dept-card dept-card-placeholder">
          <div class="dept-header">
            <div class="dept-icon dept-icon-boiler">
              <el-icon :size="28"><Sunrise /></el-icon>
            </div>
            <div class="dept-info">
              <span class="dept-name">锅炉房</span>
              <el-tag type="info" size="small" round>即将接入</el-tag>
            </div>
          </div>
          <div class="placeholder-body">
            <el-empty description="数据对接中，敬请期待" :image-size="80" />
          </div>
        </el-card>
      </el-col>

      <!-- 生产部（预留） -->
      <el-col :xs="24" :sm="12">
        <el-card shadow="never" class="dept-card dept-card-placeholder">
          <div class="dept-header">
            <div class="dept-icon dept-icon-prod">
              <el-icon :size="28"><SetUp /></el-icon>
            </div>
            <div class="dept-info">
              <span class="dept-name">生产部</span>
              <el-tag type="info" size="small" round>即将接入</el-tag>
            </div>
          </div>
          <div class="placeholder-body">
            <el-empty description="数据对接中，敬请期待" :image-size="80" />
          </div>
        </el-card>
      </el-col>

      <!-- 运输部（预留） -->
      <el-col :xs="24" :sm="12">
        <el-card shadow="never" class="dept-card dept-card-placeholder">
          <div class="dept-header">
            <div class="dept-icon dept-icon-trans">
              <el-icon :size="28"><Van /></el-icon>
            </div>
            <div class="dept-info">
              <span class="dept-name">运输部</span>
              <el-tag type="info" size="small" round>即将接入</el-tag>
            </div>
          </div>
          <div class="placeholder-body">
            <el-empty description="数据对接中，敬请期待" :image-size="80" />
          </div>
        </el-card>
      </el-col>

      <!-- 综合办（预留） -->
      <el-col :xs="24" :sm="12">
        <el-card shadow="never" class="dept-card dept-card-placeholder">
          <div class="dept-header">
            <div class="dept-icon dept-icon-admin">
              <el-icon :size="28"><OfficeBuilding /></el-icon>
            </div>
            <div class="dept-info">
              <span class="dept-name">综合办</span>
              <el-tag type="info" size="small" round>即将接入</el-tag>
            </div>
          </div>
          <div class="placeholder-body">
            <el-empty description="数据对接中，敬请期待" :image-size="80" />
          </div>
        </el-card>
      </el-col>

      <!-- 财务（预留） -->
      <el-col :xs="24" :sm="12">
        <el-card shadow="never" class="dept-card dept-card-placeholder">
          <div class="dept-header">
            <div class="dept-icon dept-icon-finance">
              <el-icon :size="28"><Coin /></el-icon>
            </div>
            <div class="dept-info">
              <span class="dept-name">财务</span>
              <el-tag type="info" size="small" round>即将接入</el-tag>
            </div>
          </div>
          <div class="placeholder-body">
            <el-empty description="数据对接中，敬请期待" :image-size="80" />
          </div>
        </el-card>
      </el-col>
    </el-row>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import {
  Monitor, Sunrise, Document, Box, Warning, Bell,
  SetUp, Van, OfficeBuilding, Coin,
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const appStore = useAppStore()

const currentMonth = ref(dayjs().format('YYYY年MM月'))

const currentFactoryLabel = computed(() => {
  if (!appStore.currentFactoryId) return '全部工厂（汇总）'
  return appStore.currentFactoryName || '当前工厂'
})

const stats = ref({
  totalLogs: 0,
  totalPartsQty: 0,
  totalAlerts: 0,
  openAlerts: 0,
  inventoryValue: 0,
  usageCost: 0,
})

function formatMoney(val) {
  if (val >= 10000) return (val / 10000).toFixed(1) + '万'
  return val.toLocaleString()
}

async function loadData() {
  try {
    const ym = dayjs().format('YYYY-MM')
    const fid = appStore.currentFactoryId || ''

    const [dashRes, invRes, costRes] = await Promise.all([
      api.getDashboardStats({ yearMonth: ym, factoryId: fid }),
      api.listInventory(fid),
      api.getPartUsageCostList(fid, ym),
    ])

    const d = dashRes.ok ? dashRes.data : {}
    const invList = invRes.ok ? (invRes.data.list || []) : []
    const inventoryValue = invList.reduce((s, i) => s + (i.totalCostValue || 0), 0)
    const usageCost = costRes.ok ? (costRes.data.totalCost || 0) : 0

    stats.value = {
      totalLogs: d.totalLogs || 0,
      totalPartsQty: d.totalPartsQty || 0,
      totalAlerts: d.totalAlerts || 0,
      openAlerts: d.openAlerts || 0,
      inventoryValue: Math.round(inventoryValue * 100) / 100,
      usageCost: Math.round(usageCost * 100) / 100,
    }
  } catch (e) {
    console.error('Company overview loadData error', e)
  }
}

watch(() => appStore.currentFactoryId, loadData)
onMounted(loadData)
</script>

<style lang="scss" scoped>
.company-overview {
  max-width: 1200px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h2 {
    margin: 0;
    font-size: 22px;
  }

  .header-right-info {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .factory-hint {
    color: #303133;
    font-size: 14px;
    font-weight: 500;
  }

  .month-hint {
    color: #909399;
    font-size: 14px;
  }
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 24px 0 12px;
  color: #303133;
}

.dept-row {
  margin-bottom: 8px;
}

.dept-card {
  cursor: pointer;
  transition: box-shadow 0.2s;
  margin-bottom: 16px;

  .dept-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 20px;
  }

  .dept-icon {
    width: 52px;
    height: 52px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    flex-shrink: 0;
  }

  .dept-icon-eng {
    background: linear-gradient(135deg, #07C160, #06AD56);
  }

  .dept-icon-boiler {
    background: linear-gradient(135deg, #FF976A, #F56C6C);
  }

  .dept-icon-prod {
    background: linear-gradient(135deg, #409EFF, #337ecc);
  }

  .dept-icon-trans {
    background: linear-gradient(135deg, #67C23A, #4e9a2e);
  }

  .dept-icon-admin {
    background: linear-gradient(135deg, #909399, #6d7278);
  }

  .dept-icon-finance {
    background: linear-gradient(135deg, #E6A23C, #cf8a1e);
  }

  .dept-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .dept-name {
    font-size: 18px;
    font-weight: 600;
    color: #303133;
  }

  .dept-metrics {
    display: flex;
    justify-content: space-around;
    padding-top: 16px;
    border-top: 1px solid #f0f0f0;
    text-align: center;

    .metric-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .metric-value {
      font-size: 24px;
      font-weight: 700;
      color: #303133;
    }

    .metric-label {
      font-size: 12px;
      color: #909399;
    }

    .metric-value.money {
      font-size: 18px;
      color: #409EFF;
    }
  }
}

.dept-card-placeholder {
  cursor: default;
  opacity: 0.7;

  .placeholder-body {
    padding: 10px 0;
  }
}

.stat-row {
  margin-bottom: 8px;
}

.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  margin-bottom: 16px;

  .stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    flex-shrink: 0;
  }

  .icon-green { background: linear-gradient(135deg, #07C160, #06AD56); }
  .icon-blue { background: linear-gradient(135deg, #409EFF, #337ecc); }
  .icon-red { background: linear-gradient(135deg, #F56C6C, #e04b4b); }
  .icon-orange { background: linear-gradient(135deg, #E6A23C, #cf8a1e); }

  .stat-body {
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: #303133;
    }
    .stat-label {
      font-size: 13px;
      color: #909399;
      margin-top: 2px;
    }
  }
}

.text-warning {
  color: #E6A23C !important;
}

.cross-dept-placeholder {
  margin-bottom: 24px;
}
</style>
