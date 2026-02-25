<template>
  <div class="page-container daily-timeline">
    <div class="page-header">
      <h2>24 小时事件记录</h2>
      <div class="header-actions">
        <el-button-group>
          <el-button :type="isYesterday ? 'primary' : ''" @click="goYesterday">昨天</el-button>
          <el-button :type="isToday ? 'primary' : ''" @click="goToday">今天</el-button>
        </el-button-group>
        <el-date-picker
          v-model="currentDate"
          type="date"
          placeholder="选择日期"
          :disabled-date="disableFutureDate"
          value-format="YYYY-MM-DD"
          style="width: 160px;"
          @change="onDateChange"
        />
      </div>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stat-row">
      <el-col :xs="12" :sm="6" :md="5">
        <div class="stat-card">
          <div class="stat-icon icon-red">
            <el-icon :size="24"><WarningFilled /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value stat-danger">{{ summary.faultCount }}</div>
            <div class="stat-label">故障申报</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6" :md="5">
        <div class="stat-card">
          <div class="stat-icon icon-green">
            <el-icon :size="24"><SetUp /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value stat-success">{{ summary.replaceCount }}</div>
            <div class="stat-label">更换记录</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6" :md="5">
        <div class="stat-card">
          <div class="stat-icon icon-blue">
            <el-icon :size="24"><List /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value stat-primary">{{ summary.inspectionCount }}</div>
            <div class="stat-label">巡检记录</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6" :md="5">
        <div class="stat-card">
          <div class="stat-icon icon-purple">
            <el-icon :size="24"><Monitor /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ summary.assetCount }}</div>
            <div class="stat-label">涉及设备</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6" :md="4">
        <div class="stat-card">
          <div class="stat-icon icon-orange">
            <el-icon :size="24"><Clock /></el-icon>
          </div>
          <div class="stat-body">
            <div class="stat-value">{{ summary.totalEvents }}</div>
            <div class="stat-label">总事件数</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 24 小时分布条 -->
    <el-card shadow="never" class="hour-bar-card">
      <template #header>
        <span class="card-title">24 小时事件分布</span>
        <span class="card-hint">红 = 故障　绿 = 更换　蓝 = 巡检</span>
      </template>
      <div class="hour-bar">
        <div class="hour-track">
          <div
            v-for="(dot, i) in dots"
            :key="i"
            class="hour-dot"
            :class="dot.type"
            :style="{ left: dot.left + '%' }"
          >
            <el-tooltip :content="dot.tip" placement="top">
              <div class="dot-hitarea"></div>
            </el-tooltip>
          </div>
        </div>
        <div class="hour-labels">
          <span v-for="h in [0,3,6,9,12,15,18,21,24]" :key="h">{{ h }}:00</span>
        </div>
        <div class="hour-grid">
          <div v-for="h in [3,6,9,12,15,18,21]" :key="h" class="hour-grid-line" :style="{ left: (h / 24 * 100) + '%' }"></div>
        </div>
      </div>
    </el-card>

    <!-- 事件列表 -->
    <el-card shadow="never" class="event-list-card" v-loading="loading">
      <template #header>
        <div class="event-list-header">
          <span class="card-title">事件列表</span>
          <el-radio-group v-model="filterType" size="small">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="fault">故障申报</el-radio-button>
            <el-radio-button value="replace">更换记录</el-radio-button>
            <el-radio-button value="inspection">巡检记录</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <div v-if="filteredEvents.length > 0" class="event-table">
        <div
          v-for="event in filteredEvents"
          :key="event.id"
          class="event-row"
          :class="{ 'has-link': event.linkedNext }"
        >
          <div class="event-main" @click="event.expanded = !event.expanded">
            <span class="event-time">{{ event.time }}</span>
            <el-tag
              :type="tagType(event.type)"
              size="small"
              effect="plain"
            >
              {{ event.typeLabel }}
            </el-tag>
            <span class="event-asset">{{ event.assetName }}</span>
            <el-icon class="event-expand" :class="{ rotated: event.expanded }">
              <ArrowDown />
            </el-icon>
          </div>

          <el-collapse-transition>
            <div v-if="event.expanded" class="event-detail">
              <div class="detail-grid">
                <div class="detail-item" v-if="event.operator">
                  <span class="detail-label">{{ operatorLabel(event.type) }}</span>
                  <span class="detail-value">{{ event.operator }}</span>
                </div>
                <div class="detail-item" v-if="event.desc">
                  <span class="detail-label">描述</span>
                  <span class="detail-value">{{ event.desc }}</span>
                </div>
                <div class="detail-item" v-if="event.parts">
                  <span class="detail-label">更换配件</span>
                  <span class="detail-value">{{ event.parts }}</span>
                </div>
                <div class="detail-item" v-if="event.status">
                  <span class="detail-label">巡检结果</span>
                  <span class="detail-value">
                    <el-tag :type="event.status === '正常' ? 'success' : 'warning'" size="small">{{ event.status }}</el-tag>
                  </span>
                </div>
              </div>
            </div>
          </el-collapse-transition>

          <div v-if="event.linkedNext" class="event-link-line">
            <div class="link-dash"></div>
            <span class="link-label">同一设备</span>
          </div>
        </div>
      </div>

      <el-empty v-else-if="!loading" description="当天暂无事件记录" :image-size="120" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import dayjs from 'dayjs'
import {
  WarningFilled, SetUp, Monitor, Clock, ArrowDown, List,
} from '@element-plus/icons-vue'

const appStore = useAppStore()
const today = dayjs().format('YYYY-MM-DD')
const currentDate = ref(today)
const loading = ref(false)

const isToday = computed(() => currentDate.value === today)
const isYesterday = computed(() => currentDate.value === dayjs().subtract(1, 'day').format('YYYY-MM-DD'))

function disableFutureDate(date) {
  return date > new Date()
}

function goToday() {
  currentDate.value = today
  loadData()
}

function goYesterday() {
  currentDate.value = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
  loadData()
}

function onDateChange() {
  loadData()
}

function tagType(type) {
  if (type === 'fault') return 'danger'
  if (type === 'replace') return 'success'
  return ''
}

function operatorLabel(type) {
  if (type === 'fault') return '申报人'
  if (type === 'inspection') return '巡检人'
  return '操作人'
}

const filterType = ref('all')
const events = ref([])
const summary = reactive({ faultCount: 0, replaceCount: 0, inspectionCount: 0, assetCount: 0, totalEvents: 0 })
const dots = ref([])

const filteredEvents = computed(() => {
  if (filterType.value === 'all') return events.value
  return events.value.filter(e => e.type === filterType.value)
})

async function loadData() {
  loading.value = true
  try {
    const res = await api.getDailyTimeline(currentDate.value, appStore.currentFactoryId)
    if (!res.ok) return

    const list = (res.data.events || []).map(e => ({ ...e, expanded: false }))
    events.value = list

    const faultCount = list.filter(e => e.type === 'fault').length
    const replaceCount = list.filter(e => e.type === 'replace').length
    const inspectionCount = list.filter(e => e.type === 'inspection').length
    const assetSet = new Set(list.map(e => e.assetName))

    Object.assign(summary, {
      faultCount,
      replaceCount,
      inspectionCount,
      assetCount: assetSet.size,
      totalEvents: list.length,
    })

    dots.value = list.map(e => {
      const [h, m] = e.time.split(':').map(Number)
      return {
        type: e.type,
        left: +((h * 60 + m) / 1440 * 100).toFixed(1),
        tip: `${e.time} ${e.typeLabel} — ${e.assetName}`,
      }
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => loadData())
</script>

<style lang="scss" scoped>
.daily-timeline {
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 12px;

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
  }
}

.stat-row { margin-bottom: 16px; }

.stat-card {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .05);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.icon-red    { background: #fef0f0; color: #F56C6C; }
  &.icon-green  { background: #e6f9ee; color: #07C160; }
  &.icon-blue   { background: #ecf5ff; color: #409EFF; }
  &.icon-orange { background: #fdf6ec; color: #E6A23C; }
  &.icon-purple { background: #f0ecff; color: #7C3AED; }
}

.stat-body {
  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: #303133;
    line-height: 1.2;
    &.stat-danger  { color: #F56C6C; }
    &.stat-success { color: #07C160; }
    &.stat-primary { color: #409EFF; }
  }
  .stat-label {
    font-size: 13px;
    color: #909399;
    margin-top: 4px;
  }
}

.hour-bar-card { margin-bottom: 16px; }

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.card-hint {
  font-size: 12px;
  color: #c0c4cc;
  margin-left: 12px;
}

:deep(.el-card__header) {
  padding: 14px 20px;
  display: flex;
  align-items: center;
}

.hour-bar {
  position: relative;
  padding: 12px 0 0;
}

.hour-track {
  position: relative;
  height: 36px;
  background: linear-gradient(90deg, #f9fafb 0%, #f5f7fa 50%, #f9fafb 100%);
  border-radius: 18px;
  border: 1px solid #ebeef5;
}

.hour-dot {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  transition: transform 0.15s;
  box-shadow: 0 0 0 3px #fff, 0 1px 4px rgba(0, 0, 0, .15);

  &:hover {
    transform: translate(-50%, -50%) scale(1.5);
    z-index: 3;
  }

  &.fault      { background: #F56C6C; }
  &.replace    { background: #07C160; }
  &.inspection { background: #409EFF; }

  .dot-hitarea {
    width: 24px;
    height: 24px;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
}

.hour-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;

  span {
    font-size: 11px;
    color: #c0c4cc;
    min-width: 28px;
    text-align: center;
  }
}

.hour-grid {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 36px;
  pointer-events: none;
  border-radius: 18px;
  overflow: hidden;
}

.hour-grid-line {
  position: absolute;
  top: 0;
  width: 1px;
  height: 100%;
  background: rgba(0, 0, 0, 0.04);
}

.event-list-card { margin-bottom: 16px; }

.event-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.event-row {
  position: relative;

  &:not(:last-child) {
    border-bottom: 1px solid #f5f7fa;
  }

  &.has-link {
    border-bottom: none;
  }
}

.event-main {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover { background: #fafafa; }
}

.event-time {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  font-variant-numeric: tabular-nums;
  width: 56px;
  flex-shrink: 0;
}

.event-asset {
  flex: 1;
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.event-expand {
  color: #c0c4cc;
  transition: transform 0.2s;
  flex-shrink: 0;
  &.rotated { transform: rotate(180deg); }
}

.event-detail {
  padding: 0 12px 16px 88px;
}

.detail-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f9fafb;
  border-radius: 8px;
  padding: 14px 16px;
}

.detail-item {
  display: flex;
  gap: 12px;
  font-size: 13px;
  line-height: 1.6;
}

.detail-label {
  color: #909399;
  width: 64px;
  flex-shrink: 0;
}

.detail-value { color: #303133; }

.event-link-line {
  display: flex;
  align-items: center;
  padding: 0 12px 0 36px;
  height: 28px;
}

.link-dash {
  width: 2px;
  height: 28px;
  margin-right: 10px;
  background: repeating-linear-gradient(
    to bottom,
    #07C160 0px, #07C160 4px,
    transparent 4px, transparent 8px
  );
}

.link-label {
  font-size: 11px;
  color: #c0c4cc;
}

@media (max-width: 767px) {
  .daily-timeline .page-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .event-detail { padding-left: 12px; }
}
</style>
