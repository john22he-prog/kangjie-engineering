<template>
  <div class="page-container">
    <div class="page-header">
      <h2>片区匹配与复核</h2>
    </div>

    <el-tabs v-model="activeTab">
      <!-- 批量复核 -->
      <el-tab-pane label="批量匹配复核" name="review">
        <div class="toolbar">
          <el-button type="primary" :loading="reviewLoading" @click="loadReview">
            <el-icon><Refresh /></el-icon>重新匹配未绑定客户
          </el-button>
          <el-button
            v-if="canManage"
            type="success"
            :disabled="highCount === 0"
            :loading="bulkLoading"
            @click="onAcceptAllHigh"
          >一键接受高分（{{ highCount }}）</el-button>
          <div class="stat-group">
            <span>待复核 <b>{{ reviewStats.total }}</b></span>
            <span>建议匹配 <b class="c-blue">{{ reviewStats.matched }}</b></span>
            <span>高置信 <b class="c-green">{{ highCount }}</b></span>
          </div>
        </div>

        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="匹配维度：名称相似度(0.6) + 坐标距离(0.25) + 地址相似度(0.15)，缺失维度自动按比例重分配权重。一个内部客户仅绑定一个外部 POI（严格 1:1）。"
          style="margin: 8px 0 12px"
        />

        <el-table :data="reviewResults" v-loading="reviewLoading" stripe>
          <el-table-column label="内部客户" min-width="200">
            <template #default="{ row }">
              <div class="cell-title">{{ row.hotelName }}</div>
              <div class="cell-sub">{{ row.hotelAddress || '—' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="最佳 POI 候选" min-width="220">
            <template #default="{ row }">
              <template v-if="row.bestPoi">
                <div class="cell-title">{{ row.bestPoi.name }}</div>
                <div class="cell-sub">{{ row.bestPoi.address || '—' }}</div>
              </template>
              <span v-else class="text-muted">无候选</span>
            </template>
          </el-table-column>
          <el-table-column label="匹配度" width="110">
            <template #default="{ row }">
              <span v-if="row.matchScore">{{ Math.round(row.matchScore.total * 100) }}%</span>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="置信" width="100">
            <template #default="{ row }">
              <el-tag :type="levelTag(row.matchLevel)" size="small">{{ levelLabel(row.matchLevel) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="canManage && row.matchStatus === 'suggested'"
                size="small"
                type="primary"
                @click="onAccept(row)"
              >接受并绑定</el-button>
              <el-button
                v-if="row.matchStatus === 'suggested'"
                size="small"
                @click="onIgnore(row)"
              >忽略</el-button>
              <span v-if="row.matchStatus !== 'suggested'" class="text-muted">无建议</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 高德检索匹配 -->
      <el-tab-pane label="高德检索匹配" name="search">
        <div class="toolbar">
          <el-input v-model="searchKw" placeholder="关键词（如：酒店）" style="width: 200px" @keyup.enter="doSearch" />
          <el-input v-model="searchCity" placeholder="城市（如：昆明）" style="width: 140px" />
          <el-button type="primary" :loading="searchLoading" @click="doSearch">检索匹配</el-button>
          <div class="stat-group" v-if="searchStats">
            <span>共 <b>{{ searchStats.total }}</b></span>
            <span>已绑 <b class="c-gray">{{ searchStats.bound }}</b></span>
            <span>建议 <b class="c-blue">{{ searchStats.suggested }}</b></span>
            <span>未匹配 <b>{{ searchStats.unmatched }}</b></span>
            <span v-if="blindCount > 0">盲区客户 <b class="c-purple">{{ blindCount }}</b></span>
          </div>
        </div>

        <el-table :data="searchPois" v-loading="searchLoading" stripe>
          <el-table-column label="高德 POI" min-width="220">
            <template #default="{ row }">
              <div class="cell-title">{{ row.name }}</div>
              <div class="cell-sub">{{ row.address || '—' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="匹配状态" width="120">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.matchStatus)" size="small">{{ statusLabel(row.matchStatus) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="关联内部客户" min-width="180">
            <template #default="{ row }">
              <span v-if="row.matchStatus === 'bound'">{{ row.boundHotelName }}</span>
              <span v-else-if="row.matchStatus === 'suggested'">{{ row.suggestedHotelName }}</span>
              <span v-else class="text-muted">{{ row.bestCandidateName || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="匹配度" width="100">
            <template #default="{ row }">
              {{ row.matchScore ? Math.round(row.matchScore.total * 100) + '%' : '—' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="canManage && row.matchStatus === 'suggested'"
                size="small"
                type="primary"
                @click="onBindSuggested(row)"
              >绑定</el-button>
              <el-button
                v-if="canManage && row.matchStatus === 'bound'"
                size="small"
                type="warning"
                @click="onUnbindBound(row)"
              >解绑</el-button>
              <span v-if="row.matchStatus === 'unmatched'" class="text-muted">无建议</span>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="searchTotal > searchPois.length" class="load-more">
          <el-button :loading="searchLoading" @click="loadMorePois">加载更多 POI</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/utils/api'
import { useAuthStore } from '@/stores/auth'
import { PERMISSIONS } from '@/utils/permissions'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'

const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission(PERMISSIONS.BUSINESS_MANAGE))

const activeTab = ref('review')

// ===== 批量复核 =====
const reviewLoading = ref(false)
const bulkLoading = ref(false)
const reviewResults = ref([])
const reviewStats = reactive({ total: 0, matched: 0 })
const highCount = computed(() => reviewResults.value.filter(r => r.matchStatus === 'suggested' && r.matchLevel === 'high').length)

function levelTag(level) {
  return { high: 'success', medium: 'warning', bound: 'info', none: 'info' }[level] || 'info'
}
function levelLabel(level) {
  return { high: '强烈建议', medium: '建议', bound: '已绑定', none: '无' }[level] || '无'
}

async function loadReview() {
  reviewLoading.value = true
  try {
    const res = await api.bizBatchMatch({})
    if (res.ok) {
      reviewResults.value = res.data.results || []
      reviewStats.total = res.data.total || 0
      reviewStats.matched = res.data.matched || 0
    } else {
      ElMessage.error(res.error?.message || '匹配失败')
    }
  } finally {
    reviewLoading.value = false
  }
}

async function bindOne(row) {
  return api.bizBindPOI({
    poiId: row.bestPoi.id,
    poiName: row.bestPoi.name,
    hotelId: row.hotelId,
    hotelName: row.hotelName,
    poiData: row.bestPoi,
  })
}

async function onAccept(row) {
  const res = await bindOne(row)
  if (res.ok) {
    ElMessage.success('已绑定')
    reviewResults.value = reviewResults.value.filter(r => r.hotelId !== row.hotelId)
    reviewStats.matched = Math.max(0, reviewStats.matched - 1)
  } else {
    ElMessage.error(res.error?.message || '绑定失败')
  }
}

function onIgnore(row) {
  reviewResults.value = reviewResults.value.filter(r => r.hotelId !== row.hotelId)
}

async function onAcceptAllHigh() {
  const highs = reviewResults.value.filter(r => r.matchStatus === 'suggested' && r.matchLevel === 'high')
  if (highs.length === 0) return
  try {
    await ElMessageBox.confirm(`确认一键接受 ${highs.length} 条高置信建议并自动绑定？`, '批量绑定', { type: 'warning' })
  } catch { return }
  bulkLoading.value = true
  let ok = 0, fail = 0
  try {
    for (const row of highs) {
      const res = await bindOne(row)
      if (res.ok) ok++; else fail++
    }
    ElMessage.success(`完成：成功 ${ok} 条${fail ? `，失败 ${fail} 条` : ''}`)
    await loadReview()
  } finally {
    bulkLoading.value = false
  }
}

// ===== 高德检索匹配 =====
const searchLoading = ref(false)
const searchKw = ref('')
const searchCity = ref('昆明')
const searchPois = ref([])
const searchStats = ref(null)
const searchTotal = ref(0)
const searchPage = ref(1)
const blindCount = ref(0)
const PAGE_SIZE = 25

function statusTag(s) {
  return { bound: 'info', suggested: 'primary', unmatched: 'warning' }[s] || 'info'
}
function statusLabel(s) {
  return { bound: '已绑定', suggested: '建议匹配', unmatched: '未匹配' }[s] || s
}

async function doSearch() {
  if (!searchKw.value.trim()) return ElMessage.warning('请输入关键词')
  searchPage.value = 1
  searchPois.value = []
  await fetchSearch()
}

async function fetchSearch() {
  searchLoading.value = true
  try {
    const res = await api.bizSearchAndMatch({
      keywords: searchKw.value.trim(),
      city: searchCity.value.trim(),
      page: searchPage.value,
      pageSize: PAGE_SIZE,
    })
    if (res.ok) {
      const d = res.data
      if (searchPage.value === 1) searchPois.value = d.pois || []
      else searchPois.value = searchPois.value.concat(d.pois || [])
      searchStats.value = d.stats
      searchTotal.value = d.total || 0
      blindCount.value = d.blindCount || 0
    } else {
      ElMessage.error(res.error?.message || '检索失败')
    }
  } finally {
    searchLoading.value = false
  }
}

async function loadMorePois() {
  searchPage.value += 1
  await fetchSearch()
}

async function onBindSuggested(row) {
  const res = await api.bizBindPOI({
    poiId: row.id,
    poiName: row.name,
    hotelId: row.suggestedHotelId,
    hotelName: row.suggestedHotelName,
    poiData: row,
  })
  if (res.ok) {
    ElMessage.success('已绑定')
    row.matchStatus = 'bound'
    row.boundHotelName = row.suggestedHotelName
    if (searchStats.value) { searchStats.value.suggested--; searchStats.value.bound++ }
  } else {
    ElMessage.error(res.error?.message || '绑定失败')
  }
}

async function onUnbindBound(row) {
  try {
    await ElMessageBox.confirm(`确认解除「${row.name}」与「${row.boundHotelName}」的绑定？`, '解除绑定', { type: 'warning' })
  } catch { return }
  const res = await api.bizUnbindPOI({ poiId: row.id })
  if (res.ok) {
    ElMessage.success('已解绑')
    row.matchStatus = 'unmatched'
    if (searchStats.value) { searchStats.value.bound--; searchStats.value.unmatched++ }
  } else {
    ElMessage.error(res.error?.message || '解绑失败')
  }
}

onMounted(loadReview)
</script>

<style lang="scss" scoped>
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.stat-group {
  display: flex;
  gap: 16px;
  margin-left: auto;
  color: #606266;
  font-size: 13px;
  b { font-size: 15px; }
}
.c-blue { color: #409eff; }
.c-green { color: #67c23a; }
.c-gray { color: #909399; }
.c-purple { color: #8e44ad; }
.cell-title { font-weight: 500; }
.cell-sub { color: #909399; font-size: 12px; margin-top: 2px; }
.text-muted { color: #909399; font-size: 13px; }
.load-more {
  text-align: center;
  margin-top: 12px;
}
</style>
