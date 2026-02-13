<template>
  <div class="page-container">
    <div class="page-header">
      <h2>设备管理</h2>
      <div class="header-actions">
        <el-button type="success" plain @click="downloadTemplate">
          <el-icon><Download /></el-icon>下载模板
        </el-button>
        <el-upload
          ref="uploadRef"
          accept=".xlsx,.xls"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="handleExcelUpload"
        >
          <el-button type="warning" plain>
            <el-icon><Upload /></el-icon>Excel 批量导入
          </el-button>
        </el-upload>
        <el-button type="primary" @click="openDialog()">
          <el-icon><Plus /></el-icon>新增设备
        </el-button>
      </div>
    </div>

    <!-- 数量汇总 -->
    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-number">{{ list.length }}</div>
        <div class="summary-label">设备总数</div>
      </div>
      <div class="summary-card summary-active">
        <div class="summary-number">{{ activeCount }}</div>
        <div class="summary-label">启用中</div>
      </div>
      <div class="summary-card summary-inactive">
        <div class="summary-number">{{ inactiveCount }}</div>
        <div class="summary-label">已停用</div>
      </div>
      <div class="summary-card summary-factory">
        <div class="summary-number">{{ factoryCount }}</div>
        <div class="summary-label">所属工厂</div>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-input v-model="searchText" placeholder="搜索设备名称/编号" clearable style="width: 240px" prefix-icon="Search" />
      <el-select v-model="filterFactory" placeholder="工厂筛选" clearable style="width: 160px">
        <el-option v-for="f in factoryOptions" :key="f" :label="f" :value="f" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 120px">
        <el-option label="启用" value="active" />
        <el-option label="停用" value="inactive" />
      </el-select>
    </div>

    <!-- 设备表格 -->
    <el-table :data="filteredList" v-loading="loading" stripe>
      <el-table-column prop="assetId" label="设备ID" width="120" />
      <el-table-column prop="assetName" label="设备名称" min-width="150" />
      <el-table-column prop="assetNo" label="设备编号" width="140" />
      <el-table-column label="所属工厂" width="140">
        <template #default="{ row }">
          {{ getFactoryName(row.factoryId) || row.workshop || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status === 'active' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建日期" width="120">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="primary" plain @click="goLocations(row)">
            部位管理
          </el-button>
          <el-button size="small" type="success" plain @click="showQrCode(row)">
            <el-icon><View /></el-icon>QR码
          </el-button>
          <el-button
            size="small"
            :type="row.status === 'active' ? 'warning' : 'success'"
            plain
            @click="toggleStatus(row)"
          >
            {{ row.status === 'active' ? '停用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑设备' : '新增设备'"
      width="520px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="设备ID" prop="assetId">
          <el-input v-model="form.assetId" :disabled="isEdit" placeholder="如 ZB-006，留空自动生成" />
        </el-form-item>
        <el-form-item label="设备名称" prop="assetName">
          <el-input v-model="form.assetName" placeholder="如 注塑机A-03" />
        </el-form-item>
        <el-form-item label="设备编号" prop="assetNo">
          <el-input v-model="form.assetNo" placeholder="如 EQ-2024-006" />
        </el-form-item>
        <el-form-item label="设备类型">
          <el-input v-model="form.deviceTypeId" placeholder="如 injection / press" />
        </el-form-item>
        <el-form-item label="所属工厂">
          <el-select v-model="form.factoryId" placeholder="请选择工厂" clearable style="width: 100%">
            <el-option
              v-for="f in allFactories"
              :key="f.factoryId"
              :label="f.factoryName"
              :value="f.factoryId"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- Excel 批量导入预览弹窗 -->
    <el-dialog
      v-model="importDialogVisible"
      title="Excel 批量导入 — 预览"
      width="900px"
      destroy-on-close
    >
      <!-- 错误提示 -->
      <div v-if="importErrors.length" class="import-errors">
        <el-alert type="error" :closable="false" show-icon>
          <template #title>有 {{ importErrors.length }} 行数据存在问题，请修正后重新上传</template>
          <template #default>
            <ul>
              <li v-for="(err, i) in importErrors.slice(0, 10)" :key="i">[{{ err.sheet }}] 第 {{ err.line }} 行：{{ err.msg }}</li>
              <li v-if="importErrors.length > 10">...还有 {{ importErrors.length - 10 }} 条错误</li>
            </ul>
          </template>
        </el-alert>
      </div>

      <!-- Tab 切换：设备 / 关联关系 -->
      <el-tabs v-model="importTab" style="margin-top: 12px;">
        <el-tab-pane label="设备信息" name="devices">
          <el-table :data="importPreview" stripe max-height="350" size="small">
            <el-table-column type="index" label="#" width="50" />
            <el-table-column prop="assetId" label="设备ID" width="110" />
            <el-table-column prop="assetName" label="设备名称" min-width="130" />
            <el-table-column prop="assetNo" label="设备编号" width="130" />
            <el-table-column prop="deviceTypeId" label="设备类型" width="110" />
            <el-table-column prop="factoryId" label="所属工厂ID" width="130" />
          </el-table>
          <div class="import-summary">
            设备：<strong>{{ importPreview.length }}</strong> 条
          </div>
        </el-tab-pane>
        <el-tab-pane label="部位-配件关联" name="associations">
          <el-table :data="importAssociations" stripe max-height="350" size="small">
            <el-table-column type="index" label="#" width="50" />
            <el-table-column prop="assetId" label="设备ID" width="110" />
            <el-table-column prop="assetName" label="设备名称" width="130" />
            <el-table-column prop="locationName" label="部位名称" width="130" />
            <el-table-column prop="partCode" label="配件编号" width="130" />
            <el-table-column prop="partName" label="配件名称" min-width="130" />
          </el-table>
          <div class="import-summary">
            关联：<strong>{{ importAssociations.length }}</strong> 条
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- 新配件提示 -->
      <el-alert
        v-if="importParts.length"
        type="info"
        :closable="false"
        show-icon
        style="margin-top: 12px;"
      >
        <template #title>
          检测到 {{ importParts.length }} 种新配件（来自配件字典Sheet），将自动导入到数据库
        </template>
      </el-alert>

      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="importLoading"
          :disabled="!importPreview.length && !importAssociations.length && !importParts.length"
          @click="handleImportConfirm"
        >
          确认导入（{{ importParts.length ? importParts.length + ' 配件 + ' : '' }}{{ importPreview.length }} 设备 + {{ importAssociations.length }} 关联）
        </el-button>
      </template>
    </el-dialog>

    <!-- QR码弹窗 -->
    <el-dialog v-model="qrDialogVisible" title="设备二维码" width="360px" align-center>
      <div class="qr-dialog-body">
        <canvas ref="qrCanvasRef" class="qr-canvas"></canvas>
        <p class="qr-factory">{{ qrFactoryName }}</p>
        <p class="qr-info">{{ qrAsset?.assetName }}</p>
        <p class="qr-sub">{{ qrAsset?.assetId }} · {{ qrAsset?.assetNo }}</p>
      </div>
      <template #footer>
        <el-button type="primary" @click="downloadQr">下载二维码</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import QRCode from 'qrcode'
import * as XLSX from 'xlsx'

const router = useRouter()
const loading = ref(false)
const submitLoading = ref(false)
const list = ref([])
const searchText = ref('')
const filterFactory = ref('')
const filterStatus = ref('')
const allFactories = ref([])  // 工厂列表
const dialogVisible = ref(false)
const isEdit = ref(false)
const editAssetId = ref('')
const formRef = ref()
const qrDialogVisible = ref(false)
const qrCanvasRef = ref()
const qrAsset = ref(null)
const qrFactoryName = ref('')

const form = reactive({
  assetId: '',
  assetName: '',
  assetNo: '',
  deviceTypeId: '',
  factoryId: '',
})

const formRules = {
  assetName: [{ required: true, message: '请输入设备名称', trigger: 'blur' }],
  assetNo: [{ required: true, message: '请输入设备编号', trigger: 'blur' }],
}

// 数量汇总统计
const activeCount = computed(() => list.value.filter(a => a.status === 'active').length)
const inactiveCount = computed(() => list.value.filter(a => a.status !== 'active').length)
const factoryCount = computed(() => {
  const ids = new Set()
  list.value.forEach(a => {
    if (a.factoryId) ids.add(a.factoryId)
    else if (a.workshop) ids.add(a.workshop)
  })
  return ids.size
})

// 工厂筛选选项（从设备数据和工厂列表中提取）
const factoryOptions = computed(() => {
  const nameSet = new Set()
  allFactories.value.forEach(f => nameSet.add(f.factoryName))
  // 也从设备的 workshop 字段提取（兼容旧数据）
  list.value.forEach(a => {
    const name = getFactoryName(a.factoryId) || a.workshop
    if (name) nameSet.add(name)
  })
  return Array.from(nameSet)
})

// 工厂ID→名称映射
function getFactoryName(factoryId) {
  if (!factoryId) return ''
  const f = allFactories.value.find(f => f.factoryId === factoryId)
  return f ? f.factoryName : ''
}

const filteredList = computed(() => {
  return list.value.filter(a => {
    if (searchText.value) {
      const s = searchText.value.toLowerCase()
      if (!a.assetName.toLowerCase().includes(s) && !a.assetNo.toLowerCase().includes(s)) return false
    }
    if (filterFactory.value) {
      const displayName = getFactoryName(a.factoryId) || a.workshop || ''
      if (displayName !== filterFactory.value) return false
    }
    if (filterStatus.value && a.status !== filterStatus.value) return false
    return true
  })
})

function formatDate(ts) {
  return ts ? dayjs(ts).format('YYYY-MM-DD') : '-'
}

function openDialog(row) {
  if (row) {
    isEdit.value = true
    editAssetId.value = row.assetId
    Object.assign(form, { assetId: row.assetId, assetName: row.assetName, assetNo: row.assetNo, deviceTypeId: row.deviceTypeId || '', factoryId: row.factoryId || '' })
  } else {
    isEdit.value = false
    editAssetId.value = ''
    Object.assign(form, { assetId: '', assetName: '', assetNo: '', deviceTypeId: '', factoryId: appStore.currentFactoryId || '' })
  }
  dialogVisible.value = true
}

async function handleSubmit() {
  try { await formRef.value.validate() } catch { return }
  submitLoading.value = true
  try {
    let res
    if (isEdit.value) {
      res = await api.updateAsset(editAssetId.value, {
        assetName: form.assetName,
        assetNo: form.assetNo,
        deviceTypeId: form.deviceTypeId,
        factoryId: form.factoryId,
      })
    } else {
      res = await api.createAsset(form)
    }
    if (res.ok) {
      ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
      dialogVisible.value = false
      loadList()
    } else {
      ElMessage.error(res.error?.message || '操作失败')
    }
  } finally {
    submitLoading.value = false
  }
}

async function toggleStatus(row) {
  const newStatus = row.status === 'active' ? 'inactive' : 'active'
  try {
    await ElMessageBox.confirm(
      `确定要${newStatus === 'active' ? '启用' : '停用'}设备 "${row.assetName}" 吗？`,
      '确认操作'
    )
    const res = await api.setAssetStatus(row.assetId, newStatus)
    if (res.ok) {
      ElMessage.success('操作成功')
      loadList()
    }
  } catch {}
}

function goLocations(row) {
  router.push(`/assets/${row.assetId}/locations`)
}

async function showQrCode(row) {
  qrAsset.value = row
  qrFactoryName.value = getFactoryName(row.factoryId) || row.workshop || ''
  qrDialogVisible.value = true
  await nextTick()
  if (qrCanvasRef.value) {
    QRCode.toCanvas(qrCanvasRef.value, row.assetId, {
      width: 200,
      margin: 2,
      color: { dark: '#1d1e1f', light: '#ffffff' },
    })
  }
}

function downloadQr() {
  if (!qrCanvasRef.value) return
  const link = document.createElement('a')
  link.download = `QR-${qrAsset.value.assetId}.png`
  link.href = qrCanvasRef.value.toDataURL()
  link.click()
}

const appStore = useAppStore()

// ===== Excel 批量导入（含设备-部位-配件关联） =====
const uploadRef = ref()
const importDialogVisible = ref(false)
const importLoading = ref(false)
const importPreview = ref([])        // Sheet1: 设备信息
const importAssociations = ref([])   // Sheet2: 部位-配件关联
const importErrors = ref([])
const importTab = ref('devices')

// 缓存配件和设备数据（用于模板生成和导入校验）
const cachedParts = ref([])
const cachedAssets = ref([])
const importParts = ref([])       // Sheet3: 待导入的新配件

// 加载配件和设备数据
async function loadRefData() {
  const [partsRes, assetsRes] = await Promise.all([
    api.listParts(),
    api.listAssets(appStore.currentFactoryId),
  ])
  if (partsRes.ok) cachedParts.value = partsRes.data.list.filter(p => p.active !== false)
  if (assetsRes.ok) cachedAssets.value = assetsRes.data.list
}

// 下载动态 Excel 模板（含3个Sheet：设备信息、部位-配件关联、配件字典参考）
async function downloadTemplate() {
  ElMessage.info('正在生成模板，请稍候...')
  await loadRefData()

  const wb = XLSX.utils.book_new()

  // ---- Sheet 1：设备信息 ----
  const sheet1Data = [
    ['设备ID（选填）', '设备名称（必填）', '设备编号（必填）', '设备类型', '所属工厂ID（必填）'],
    ['ZB-006', '注塑机A-03', 'EQ-2024-006', 'injection', appStore.currentFactoryId || 'F-001'],
    ['', '烘干机3号', 'EQ-2024-007', 'dryer', appStore.currentFactoryId || 'F-001'],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data)
  ws1['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws1, '1-设备信息')

  // ---- Sheet 2：设备-部位-配件关联 ----
  const sheet2Header = [
    '设备ID（必填，对应Sheet1或已有设备）',
    '设备名称（参考，可不填）',
    '部位名称（必填）',
    '配件编号（必填，对应配件字典）',
    '配件名称（参考，可不填）',
  ]
  const sheet2Example = [
    ['ZB-006', '注塑机A-03', '合模单元', 'HYD-SEAL-01', '液压油封'],
    ['ZB-006', '注塑机A-03', '合模单元', 'GUIDE-BLK-01', '导轨滑块'],
    ['ZB-006', '注塑机A-03', '射出单元', 'HEAT-RING-01', '加热圈'],
    ['ZB-006', '注塑机A-03', '液压系统', 'FILTER-01', '滤芯'],
  ]
  // 如果已有设备，也将它们的现有关联展示为示例
  const ws2 = XLSX.utils.aoa_to_sheet([sheet2Header, ...sheet2Example])
  ws2['!cols'] = [{ wch: 40 }, { wch: 18 }, { wch: 16 }, { wch: 30 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws2, '2-部位配件关联')

  // ---- Sheet 3：配件字典参考（只读参考，从数据库实时拉取） ----
  const sheet3Header = ['配件编号', '配件名称', '规格型号', '单位', '配件SKU-ID']
  const sheet3Rows = cachedParts.value.map(p => [p.partCode, p.partName, p.specModel || '', p.unit, p.partSkuId])
  const ws3 = XLSX.utils.aoa_to_sheet([sheet3Header, ...sheet3Rows])
  ws3['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 8 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws3, '3-配件字典(参考)')

  // ---- Sheet 4：已有设备参考（只读参考） ----
  if (cachedAssets.value.length > 0) {
    const sheet4Header = ['设备ID', '设备名称', '设备编号', '设备类型', '所属工厂', '状态']
    const sheet4Rows = cachedAssets.value.map(a => [
      a.assetId, a.assetName, a.assetNo, a.deviceTypeId || '',
      getFactoryName(a.factoryId) || a.workshop || '',
      a.status === 'active' ? '启用' : '停用',
    ])
    const ws4 = XLSX.utils.aoa_to_sheet([sheet4Header, ...sheet4Rows])
    ws4['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 8 }]
    XLSX.utils.book_append_sheet(wb, ws4, '4-已有设备(参考)')
  }

  XLSX.writeFile(wb, `设备批量导入模板_${dayjs().format('YYYYMMDD')}.xlsx`)
  ElMessage.success('模板已下载，包含配件字典和已有设备参考数据')
}

// 处理 Excel 文件上传（解析三个Sheet：设备、关联、配件）
async function handleExcelUpload(file) {
  // 确保有配件数据用于校验
  if (!cachedParts.value.length) await loadRefData()

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' })
      const errors = []
      const validDevices = []
      const validAssociations = []
      const newParts = []

      const sheetNames = wb.SheetNames

      // ---- 解析 Sheet 3：配件字典（如果存在） ----
      // 先解析配件，这样后面关联校验可以用到
      const partCodeMap = {}
      // 先把数据库里已有的配件放入映射表
      cachedParts.value.forEach(p => { partCodeMap[p.partCode] = p })

      // 尝试找到配件字典 Sheet（排除"部位配件关联"Sheet）
      const partsSheetIdx = sheetNames.findIndex(n => (n.includes('字典') || n.includes('配件')) && !n.includes('部位') && !n.includes('关联'))
      if (partsSheetIdx >= 0) {
        const ws3 = wb.Sheets[sheetNames[partsSheetIdx]]
        const rows3 = XLSX.utils.sheet_to_json(ws3, { header: 1 })
        for (let i = 1; i < rows3.length; i++) {
          const row = rows3[i]
          if (!row || row.length === 0 || row.every(c => !c)) continue
          const partCode = String(row[0] || '').trim()
          const partName = String(row[1] || '').trim()
          if (!partCode || !partName) continue

          // 如果数据库里还没有这个配件，加入待导入列表
          if (!partCodeMap[partCode]) {
            const partSkuId = String(row[4] || '').trim() || ('PSK-' + Date.now() + '-' + i)
            const part = {
              partCode,
              partName,
              specModel: String(row[2] || '').trim(),
              unit: String(row[3] || '').trim() || '个',
              partSkuId,
            }
            partCodeMap[partCode] = part
            newParts.push(part)
          }
        }
      }

      // ---- 构建工厂名称→ID映射（用于自动转换） ----
      const factoryNameToId = {}
      allFactories.value.forEach(f => {
        factoryNameToId[f.factoryName] = f.factoryId
        factoryNameToId[f.factoryId] = f.factoryId  // ID本身也映射
      })

      // 智能解析工厂值：支持工厂名称或工厂ID
      function resolveFactoryId(val) {
        if (!val) return appStore.currentFactoryId || ''
        const v = String(val).trim()
        // 优先按名称匹配，再按ID匹配
        return factoryNameToId[v] || v
      }

      // ---- 解析 Sheet 1：设备信息 ----
      const ws1 = wb.Sheets[sheetNames[0]]
      if (ws1) {
        const rows = XLSX.utils.sheet_to_json(ws1, { header: 1 })

        // 智能检测列格式：检查第一行表头判断是 5 列还是 6 列
        const header = rows[0] || []
        const headerStr = header.map(h => String(h || '')).join('|')
        // 旧格式有6列：设备ID, 设备名称, 设备编号, 设备类型, 车间/区域, 所属工厂ID
        // 新格式有5列：设备ID, 设备名称, 设备编号, 设备类型, 所属工厂ID
        const hasWorkshopCol = headerStr.includes('车间') || header.length >= 6
        const factoryColIdx = hasWorkshopCol ? 5 : 4

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (!row || row.length === 0 || row.every(c => !c)) continue
          const assetName = String(row[1] || '').trim()
          const assetNo = String(row[2] || '').trim()
          if (!assetName) { errors.push({ sheet: '设备信息', line: i + 1, msg: '设备名称为空' }); continue }
          if (!assetNo) { errors.push({ sheet: '设备信息', line: i + 1, msg: '设备编号为空' }); continue }
          validDevices.push({
            assetId: String(row[0] || '').trim(),
            assetName,
            assetNo,
            deviceTypeId: String(row[3] || '').trim(),
            factoryId: resolveFactoryId(row[factoryColIdx]),
          })
        }
      }

      // ---- 解析 Sheet 2：部位-配件关联 ----
      // 找到关联 Sheet（名称包含"部位"或"关联"）
      const assocSheetIdx = sheetNames.findIndex(n => n.includes('部位') || n.includes('关联'))
      const ws2 = assocSheetIdx >= 0 ? wb.Sheets[sheetNames[assocSheetIdx]] : (sheetNames.length >= 2 ? wb.Sheets[sheetNames[1]] : null)
      if (ws2) {
        const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1 })

        for (let i = 1; i < rows2.length; i++) {
          const row = rows2[i]
          if (!row || row.length === 0 || row.every(c => !c)) continue
          const assetId = String(row[0] || '').trim()
          const assetName = String(row[1] || '').trim()
          const locationName = String(row[2] || '').trim()
          const partCode = String(row[3] || '').trim()
          const partName = String(row[4] || '').trim()

          if (!assetId) { errors.push({ sheet: '部位配件', line: i + 1, msg: '设备ID为空' }); continue }
          if (!locationName) { errors.push({ sheet: '部位配件', line: i + 1, msg: '部位名称为空' }); continue }
          if (!partCode) { errors.push({ sheet: '部位配件', line: i + 1, msg: '配件编号为空' }); continue }

          // 校验配件编号（同时匹配数据库已有 + Excel Sheet3 中的新配件）
          const matchedPart = partCodeMap[partCode]
          if (!matchedPart) {
            errors.push({ sheet: '部位配件', line: i + 1, msg: `配件编号 "${partCode}" 在配件字典和 Excel 中都不存在` })
            continue
          }

          validAssociations.push({
            assetId,
            assetName: assetName || assetId,
            locationName,
            partCode,
            partName: partName || matchedPart.partName,
            partSkuId: matchedPart.partSkuId,
          })
        }
      }

      importPreview.value = validDevices
      importAssociations.value = validAssociations
      importParts.value = newParts
      importErrors.value = errors
      importTab.value = validDevices.length > 0 ? 'devices' : 'associations'
      importDialogVisible.value = true
    } catch (err) {
      ElMessage.error('Excel 文件解析失败：' + (err.message || '未知错误'))
    }
  }
  reader.readAsArrayBuffer(file.raw)
}

// 确认导入（配件 → 设备 → 关联关系）
async function handleImportConfirm() {
  importLoading.value = true
  let partSuccess = 0, partFail = 0
  let deviceSuccess = 0, deviceFail = 0
  let assocSuccess = 0, assocFail = 0
  try {
    // 步骤 -1：自动创建不存在的工厂
    const factoryNames = new Set()
    importPreview.value.forEach(d => { if (d.factoryId) factoryNames.add(d.factoryId) })
    for (const nameOrId of factoryNames) {
      // 检查是否已存在（按ID或按名称）
      const exists = allFactories.value.find(f => f.factoryId === nameOrId || f.factoryName === nameOrId)
      if (!exists) {
        // 自动创建工厂
        const res = await api.createFactory({ factoryName: nameOrId })
        if (res.ok) {
          const newFactoryId = res.data.factoryId
          // 把设备中的工厂名称替换为真实的工厂ID
          importPreview.value.forEach(d => {
            if (d.factoryId === nameOrId) d.factoryId = newFactoryId
          })
          allFactories.value.push({ factoryId: newFactoryId, factoryName: nameOrId })
          ElMessage.success(`自动创建工厂：${nameOrId}`)
        }
      } else {
        // 已存在，把工厂名称替换为真实的工厂ID
        importPreview.value.forEach(d => {
          if (d.factoryId === nameOrId && nameOrId !== exists.factoryId) {
            d.factoryId = exists.factoryId
          }
        })
      }
    }

    // 步骤 0：先导入新配件（来自 Sheet3）
    if (importParts.value.length > 0) {
      ElMessage.info(`正在导入 ${importParts.value.length} 种新配件...`)
      for (const part of importParts.value) {
        const res = await api.createPart(part)
        if (res.ok) {
          partSuccess++
          // 更新 partSkuId（后端可能生成了新的ID）
          if (res.data?.partSkuId) part.partSkuId = res.data.partSkuId
        } else {
          // 如果是重复，也算成功（可能已经存在）
          if (res.error?.code === 'DUPLICATE') partSuccess++
          else partFail++
        }
      }
    }

    // 步骤 1：导入设备
    if (importPreview.value.length > 0) {
      ElMessage.info(`正在导入 ${importPreview.value.length} 台设备...`)
      for (const item of importPreview.value) {
        const res = await api.createAsset(item)
        if (res.ok) deviceSuccess++
        else {
          if (res.error?.code === 'DUPLICATE') deviceSuccess++ // 已存在也算成功
          else deviceFail++
        }
      }
    }

    // 步骤 2：导入部位-配件关联
    if (importAssociations.value.length > 0) {
      ElMessage.info(`正在导入 ${importAssociations.value.length} 条关联关系...`)
      // 按 assetId + locationName 分组，先创建部位，再创建映射
      const locationGroups = {}
      for (const assoc of importAssociations.value) {
        const key = `${assoc.assetId}||${assoc.locationName}`
        if (!locationGroups[key]) {
          locationGroups[key] = {
            assetId: assoc.assetId,
            locationName: assoc.locationName,
            parts: [],
          }
        }
        locationGroups[key].parts.push(assoc)
      }

      for (const group of Object.values(locationGroups)) {
        const locRes = await api.upsertLocation({
          assetId: group.assetId,
          locationName: group.locationName,
          sortOrder: 0,
        })
        if (!locRes.ok) {
          assocFail += group.parts.length
          continue
        }
        const locationId = locRes.data.locationId

        for (const part of group.parts) {
          const mapRes = await api.upsertLocationPartMap({
            assetId: group.assetId,
            locationId,
            partSkuId: part.partSkuId,
          })
          if (mapRes.ok) assocSuccess++
          else assocFail++
        }
      }
    }

    const msgs = []
    if (importParts.value.length > 0) {
      msgs.push(`配件：成功 ${partSuccess}${partFail ? `，失败 ${partFail}` : ''}`)
    }
    if (importPreview.value.length > 0) {
      msgs.push(`设备：成功 ${deviceSuccess}${deviceFail ? `，失败 ${deviceFail}` : ''}`)
    }
    if (importAssociations.value.length > 0) {
      msgs.push(`关联：成功 ${assocSuccess}${assocFail ? `，失败 ${assocFail}` : ''}`)
    }
    ElMessage.success('导入完成！' + msgs.join('；'))
    importDialogVisible.value = false
    loadList()
  } catch (err) {
    ElMessage.error('导入过程出错：' + (err.message || '未知错误'))
  } finally {
    importLoading.value = false
  }
}

async function loadFactories() {
  try {
    const res = await api.listFactories()
    if (res.ok) allFactories.value = res.data.list || []
  } catch (e) {
    console.error('loadFactories error', e)
  }
}

async function loadList() {
  loading.value = true
  try {
    const res = await api.listAssets(appStore.currentFactoryId)
    if (res.ok) list.value = res.data.list
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadList(), loadFactories()])
})
</script>

<style lang="scss" scoped>
.page-header {
  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

.summary-cards {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.summary-card {
  flex: 1;
  background: #f0f9ff;
  border-radius: 8px;
  padding: 16px 20px;
  text-align: center;
  border: 1px solid #e0f0ff;
  transition: transform 0.2s;

  &:hover {
    transform: translateY(-2px);
  }

  .summary-number {
    font-size: 28px;
    font-weight: 700;
    color: #409eff;
    line-height: 1.2;
  }

  .summary-label {
    font-size: 13px;
    color: #909399;
    margin-top: 4px;
  }

  &.summary-active {
    background: #f0f9eb;
    border-color: #e1f3d8;
    .summary-number { color: #67c23a; }
  }

  &.summary-inactive {
    background: #fef0f0;
    border-color: #fde2e2;
    .summary-number { color: #f56c6c; }
  }

  &.summary-factory {
    background: #fdf6ec;
    border-color: #faecd8;
    .summary-number { color: #e6a23c; }
  }
}

.import-errors {
  ul {
    margin: 8px 0 0;
    padding-left: 20px;
    font-size: 13px;
    color: #606266;
  }
}

.import-summary {
  font-size: 14px;
  color: #606266;
}

.qr-dialog-body {
  text-align: center;
  padding: 20px 0;

  .qr-canvas {
    display: block;
    margin: 0 auto;
  }

  .qr-factory {
    margin-top: 16px;
    font-size: 14px;
    color: #07C160;
    font-weight: 500;
  }

  .qr-info {
    margin-top: 6px;
    font-size: 18px;
    font-weight: 600;
    color: #303133;
  }

  .qr-sub {
    font-size: 13px;
    color: #909399;
    margin-top: 4px;
  }
}
</style>
