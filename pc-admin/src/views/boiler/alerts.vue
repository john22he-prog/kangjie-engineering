<template>
  <div class="page-container boiler-alerts">
    <div class="page-header">
      <h2>预警管理</h2>
      <div class="header-actions">
        <BoilerParkSelect @change="loadAlerts" />
        <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width:140px" @change="loadAlerts">
          <el-option label="待处理" value="triggered" />
          <el-option label="已确认" value="acknowledged" />
          <el-option label="已解决" value="resolved" />
        </el-select>
      
        <el-button type="primary" @click="entryRef?.open()"><el-icon><Edit /></el-icon>录入数据</el-button>
      </div>
    </div>

    <el-row :gutter="16" class="alert-stats">
      <el-col :xs="8" :md="6" v-for="s in statItems" :key="s.key">
        <div class="scard" :class="[s.cls, { active: statusFilter === s.key }]" @click="statusFilter = s.key; loadAlerts()">
          <div class="sval">{{ s.count }}</div>
          <div class="slbl">{{ s.label }}</div>
        </div>
      </el-col>
    </el-row>

    <el-table :data="alerts" v-loading="loading" stripe>
      <el-table-column label="级别" width="80">
        <template #default="{ row }">
          <el-tag :type="sevType(row.rule_severity)" size="small" effect="dark">{{ sevLabel(row.rule_severity) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="rule_name" label="规则名称" min-width="160" />
      <el-table-column label="触发值" width="120">
        <template #default="{ row }">
          <span class="alert-val">{{ row.metric_value }}</span>
          <span class="alert-op">{{ row.rule_operator }} {{ row.rule_threshold }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="stType(row.status)" size="small">{{ stLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="触发时间" width="170">
        <template #default="{ row }">{{ fmtTime(row.triggered_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'triggered'" link type="primary" @click="handleAck(row)">确认</el-button>
          <el-button v-if="row.status !== 'resolved'" link type="success" @click="openResolve(row)">解决</el-button>
          <el-tag v-if="row.status === 'resolved'" type="success" size="small">已解决 {{ fmtTime(row.resolved_at) }}</el-tag>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="resolveVisible" title="解决告警" width="480px" :close-on-click-modal="false">
      <el-form>
        <el-form-item label="处理说明">
          <el-input v-model="resolveNote" type="textarea" :rows="3" placeholder="请描述处理过程和结果" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resolveVisible = false">取消</el-button>
        <el-button type="primary" @click="handleResolve" :loading="resolving">确认解决</el-button>
      </template>
    </el-dialog>
    <BoilerEntryDialog ref="entryRef" @submitted="loadAlerts" />
  </div>
</template>

<script setup>
import BoilerParkSelect from '@/components/BoilerParkSelect.vue'
import BoilerEntryDialog from '@/components/BoilerEntryDialog.vue'
import { Edit } from '@element-plus/icons-vue'
import { ref, computed, onMounted } from 'vue'
import { api } from '@/utils/api'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'

const entryRef = ref(null)
const loading = ref(false)
const alerts = ref([])
const allAlerts = ref([])
const statusFilter = ref('')
const resolveVisible = ref(false)
const resolveNote = ref('')
const resolving = ref(false)
let resolveTarget = null

const statItems = computed(() => [
  { key: '', label: '全部', count: allAlerts.value.length, cls: '' },
  { key: 'triggered', label: '待处理', count: allAlerts.value.filter(a => a.status === 'triggered').length, cls: 'danger' },
  { key: 'acknowledged', label: '已确认', count: allAlerts.value.filter(a => a.status === 'acknowledged').length, cls: 'warning' },
])

function sevType(s) { return { critical: 'danger', warning: 'warning', info: 'info' }[s] || 'info' }
function sevLabel(s) { return { critical: '严重', warning: '警告', info: '提示' }[s] || s }
function stType(s) { return { triggered: 'danger', acknowledged: 'warning', resolved: 'success' }[s] || 'info' }
function stLabel(s) { return { triggered: '待处理', acknowledged: '已确认', resolved: '已解决' }[s] || s }
function fmtTime(t) { return t ? dayjs(t).format('MM-DD HH:mm') : '--' }

async function loadAlerts() {
  loading.value = true
  try {
    const res = await api.boilerListAlerts(statusFilter.value ? { status: statusFilter.value } : {})
    if (res.ok) { alerts.value = res.data.list; if (!statusFilter.value) allAlerts.value = [...res.data.list] }
  } finally { loading.value = false }
}

async function handleAck(row) {
  try {
    const res = await api.boilerAcknowledgeAlert(row.id)
    if (res.ok) { ElMessage.success('已确认'); row.status = 'acknowledged' }
  } catch { ElMessage.error('确认失败') }
}

function openResolve(row) { resolveTarget = row; resolveNote.value = ''; resolveVisible.value = true }

async function handleResolve() {
  if (!resolveTarget) return
  resolving.value = true
  try {
    const res = await api.boilerResolveAlert(resolveTarget.id, resolveNote.value)
    if (res.ok) { ElMessage.success('已解决'); resolveTarget.status = 'resolved'; resolveTarget.resolved_at = new Date().toISOString(); resolveVisible.value = false }
  } catch { ElMessage.error('解决失败') }
  finally { resolving.value = false }
}

onMounted(() => loadAlerts())
</script>

<style lang="scss" scoped>
.boiler-alerts {
  .header-actions { display: flex; gap: 12px; }
  .alert-stats { margin-bottom: 16px; }
  .scard {
    background: #fff; border-radius: 8px; padding: 14px 20px; cursor: pointer; text-align: center;
    box-shadow: 0 1px 4px rgba(0,0,0,.06); transition: all .2s; border: 2px solid transparent;
    &.active { border-color: #E65100; }
    &:hover { box-shadow: 0 2px 12px rgba(0,0,0,.1); }
    .sval { font-size: 28px; font-weight: 700; color: #303133; }
    .slbl { font-size: 13px; color: #909399; margin-top: 2px; }
    &.danger .sval { color: #F56C6C; }
    &.warning .sval { color: #E6A23C; }
  }
  .alert-val { font-weight: 600; color: #F56C6C; }
  .alert-op { font-size: 12px; color: #909399; margin-left: 6px; }
}
</style>
