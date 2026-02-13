<template>
  <div class="page-container">
    <div class="page-header">
      <h2>配件字典</h2>
      <div class="header-actions">
        <el-button type="danger" plain @click="handleCleanup" :loading="cleanupLoading">
          <el-icon><Delete /></el-icon>清理重复
        </el-button>
        <el-button @click="handleExportParts" :loading="exportLoading">
          <el-icon><Download /></el-icon>导出 Excel
        </el-button>
        <el-button @click="importDialogVisible = true">
          <el-icon><Upload /></el-icon>Excel 导入
        </el-button>
        <el-button type="primary" @click="openDialog()">
          <el-icon><Plus /></el-icon>新增配件
        </el-button>
      </div>
    </div>

    <!-- 数量汇总 -->
    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-number">{{ list.length }}</div>
        <div class="summary-label">配件总数</div>
      </div>
      <div class="summary-card summary-active">
        <div class="summary-number">{{ partsActiveCount }}</div>
        <div class="summary-label">启用中</div>
      </div>
      <div class="summary-card summary-inactive">
        <div class="summary-number">{{ partsInactiveCount }}</div>
        <div class="summary-label">已停用</div>
      </div>
      <div class="summary-card summary-source">
        <div class="summary-number">{{ partsSourceCount }}</div>
        <div class="summary-label">来源类型</div>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-input v-model="searchText" placeholder="搜索配件名称/编号" clearable style="width: 240px" prefix-icon="Search" />
      <el-select v-model="filterActive" placeholder="状态" clearable style="width: 120px">
        <el-option label="启用" :value="true" />
        <el-option label="停用" :value="false" />
      </el-select>
      <el-select v-model="filterSource" placeholder="来源" clearable style="width: 120px">
        <el-option label="手动" value="manual" />
        <el-option label="Excel" value="Excel" />
        <el-option label="ERP" value="ERP" />
      </el-select>
    </div>

    <!-- 表格 -->
    <el-table :data="filteredList" v-loading="loading" stripe>
      <el-table-column prop="partSkuId" label="SKU ID" width="120" />
      <el-table-column prop="partName" label="配件名称" min-width="130" />
      <el-table-column prop="partCode" label="配件编号" width="140" />
      <el-table-column prop="unit" label="单位" width="60" />
      <el-table-column prop="specModel" label="规格型号" width="120" />
      <el-table-column prop="active" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.active ? 'success' : 'info'" size="small">
            {{ row.active ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="source" label="来源" width="80">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.source }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑配件' : '新增配件'"
      width="500px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="SKU ID" prop="partSkuId">
          <el-input v-model="form.partSkuId" :disabled="isEdit" placeholder="留空自动生成" />
        </el-form-item>
        <el-form-item label="配件名称" prop="partName">
          <el-input v-model="form.partName" placeholder="如：液压油封" />
        </el-form-item>
        <el-form-item label="配件编号" prop="partCode">
          <el-input v-model="form.partCode" placeholder="如：HYD-SEAL-01" />
        </el-form-item>
        <el-form-item label="单位" prop="unit">
          <el-input v-model="form.unit" placeholder="如：个、米、片" />
        </el-form-item>
        <el-form-item label="规格型号">
          <el-input v-model="form.specModel" placeholder="可选" />
        </el-form-item>
        <el-form-item v-if="isEdit" label="状态">
          <el-switch v-model="form.active" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- Excel 导入弹窗 -->
    <el-dialog v-model="importDialogVisible" title="Excel 导入配件" width="600px" destroy-on-close>
      <el-steps :active="importStep" simple class="import-steps">
        <el-step title="上传文件" />
        <el-step title="预览校验" />
        <el-step title="导入结果" />
      </el-steps>

      <!-- Step 1: 上传 -->
      <div v-if="importStep === 0" class="import-body">
        <el-upload
          ref="uploadRef"
          drag
          accept=".xlsx,.xls,.csv"
          :auto-upload="false"
          :limit="1"
          :on-change="handleFileChange"
        >
          <el-icon class="el-icon--upload"><Upload /></el-icon>
          <div class="el-upload__text">拖拽文件到此处，或 <em>点击上传</em></div>
          <template #tip>
            <div class="el-upload__tip">
              支持 .xlsx / .xls / .csv 格式。<br />
              必填列：配件编号、配件名称、单位（支持中英文表头）
            </div>
          </template>
        </el-upload>
      </div>

      <!-- Step 2: 预览 -->
      <div v-if="importStep === 1" class="import-body">
        <el-alert
          v-if="importPreview.errors?.length"
          type="error"
          :closable="false"
          show-icon
          :title="`发现 ${importPreview.errors.length} 个错误，请修正后重新导入`"
        >
          <div class="error-list">
            <div v-for="(err, i) in importPreview.errors.slice(0, 10)" :key="i">
              第 {{ err.line }} 行：{{ err.msg }}
            </div>
            <div v-if="importPreview.errors.length > 10">... 等 {{ importPreview.errors.length }} 条错误</div>
          </div>
        </el-alert>
        <el-alert
          v-else
          type="success"
          :closable="false"
          show-icon
          :title="`校验通过！共 ${importPreview.valid} 条数据待导入`"
        />
        <el-table :data="importRows.slice(0, 20)" size="small" max-height="300" style="margin-top: 12px">
          <el-table-column prop="partSkuId" label="SKU ID" width="100" />
          <el-table-column prop="partName" label="名称" width="120" />
          <el-table-column prop="partCode" label="编号" width="120" />
          <el-table-column prop="unit" label="单位" width="60" />
          <el-table-column prop="specModel" label="规格" />
        </el-table>
        <div v-if="importRows.length > 20" class="preview-hint">
          仅展示前 20 条，共 {{ importRows.length }} 条
        </div>
      </div>

      <!-- Step 3: 结果 -->
      <div v-if="importStep === 2" class="import-body">
        <el-result
          icon="success"
          :title="`导入完成`"
          :sub-title="`新增 ${importResult.created} 条，更新 ${importResult.updated} 条`"
        />
      </div>

      <template #footer>
        <el-button v-if="importStep > 0 && importStep < 2" @click="importStep--">上一步</el-button>
        <el-button v-if="importStep === 0" type="primary" :disabled="!importFile" @click="handlePreview">
          下一步：预览校验
        </el-button>
        <el-button
          v-if="importStep === 1"
          type="primary"
          :disabled="!!importPreview.errors?.length"
          :loading="importLoading"
          @click="handleImportCommit"
        >
          确认导入
        </el-button>
        <el-button v-if="importStep === 2" type="primary" @click="finishImport">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/utils/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'

const loading = ref(false)
const submitLoading = ref(false)
const cleanupLoading = ref(false)
const list = ref([])
const searchText = ref('')
const filterActive = ref(null)
const filterSource = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const editPartSkuId = ref('')
const formRef = ref()

const form = reactive({
  partSkuId: '',
  partName: '',
  partCode: '',
  unit: '',
  specModel: '',
  active: true,
})

const formRules = {
  partName: [{ required: true, message: '请输入配件名称', trigger: 'blur' }],
  partCode: [{ required: true, message: '请输入配件编号', trigger: 'blur' }],
  unit: [{ required: true, message: '请输入单位', trigger: 'blur' }],
}

// 导出相关
const exportLoading = ref(false)

async function handleExportParts() {
  exportLoading.value = true
  try {
    if (!list.value.length) {
      ElMessage.warning('暂无数据可导出')
      return
    }
    const exportRows = list.value.map(p => ({
      'SKU ID': p.partSkuId,
      '配件名称': p.partName,
      '配件编号': p.partCode,
      '单位': p.unit,
      '规格型号': p.specModel || '',
      '状态': p.active ? '启用' : '停用',
      '来源': p.source || '',
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '配件字典')
    XLSX.writeFile(wb, '配件字典.xlsx')
    ElMessage.success('导出成功')
  } catch (err) {
    ElMessage.error('导出失败：' + (err.message || '未知错误'))
  } finally {
    exportLoading.value = false
  }
}

// 导入相关
const importDialogVisible = ref(false)
const importStep = ref(0)
const importFile = ref(null)
const importRows = ref([])
const importPreview = ref({})
const importResult = ref({})
const importLoading = ref(false)

// 数量汇总统计
const partsActiveCount = computed(() => list.value.filter(p => p.active !== false).length)
const partsInactiveCount = computed(() => list.value.filter(p => p.active === false).length)
const partsSourceCount = computed(() => {
  const sources = new Set()
  list.value.forEach(p => { if (p.source) sources.add(p.source) })
  return sources.size
})

const filteredList = computed(() => {
  return list.value.filter(p => {
    if (searchText.value) {
      const s = searchText.value.toLowerCase()
      if (!p.partName.toLowerCase().includes(s) && !p.partCode.toLowerCase().includes(s)) return false
    }
    if (filterActive.value !== null && filterActive.value !== '' && p.active !== filterActive.value) return false
    if (filterSource.value && p.source !== filterSource.value) return false
    return true
  })
})

function openDialog(row) {
  if (row) {
    isEdit.value = true
    editPartSkuId.value = row.partSkuId
    Object.assign(form, row)
  } else {
    isEdit.value = false
    editPartSkuId.value = ''
    Object.assign(form, { partSkuId: '', partName: '', partCode: '', unit: '', specModel: '', active: true })
  }
  dialogVisible.value = true
}

async function handleSubmit() {
  try { await formRef.value.validate() } catch { return }
  submitLoading.value = true
  try {
    let res
    if (isEdit.value) {
      res = await api.updatePart(editPartSkuId.value, {
        partName: form.partName,
        partCode: form.partCode,
        unit: form.unit,
        specModel: form.specModel,
        active: form.active,
      })
    } else {
      res = await api.createPart(form)
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

// ===== Excel 导入 =====
function handleFileChange(file) {
  importFile.value = file.raw
}

// 中文表头 → 英文字段名映射
const headerMap = {
  '配件编号': 'partCode',
  '配件名称': 'partName',
  '规格型号': 'specModel',
  '单位': 'unit',
  '配件SKU-ID': 'partSkuId',
  'SKU-ID': 'partSkuId',
  'partSkuId': 'partSkuId',
  'partName': 'partName',
  'partCode': 'partCode',
  'unit': 'unit',
  'specModel': 'specModel',
  '规格': 'specModel',
  '编号': 'partCode',
  '名称': 'partName',
  '单价': 'unitPrice',
  '分类': 'category',
}

function mapRow(row) {
  const mapped = {}
  for (const [key, value] of Object.entries(row)) {
    const fieldName = headerMap[key.trim()] || key
    mapped[fieldName] = value
  }
  // 如果没有 partSkuId，自动生成
  if (!mapped.partSkuId && mapped.partCode) {
    mapped.partSkuId = 'PSK-' + mapped.partCode
  }
  return mapped
}

async function handlePreview() {
  if (!importFile.value) return
  try {
    const data = await importFile.value.arrayBuffer()
    const workbook = XLSX.read(data, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json(sheet)
    // 映射中文表头为英文字段名
    const rows = rawRows.map(mapRow).filter(r => r.partCode || r.partName)
    importRows.value = rows

    const res = await api.importPartsPreview(rows)
    if (res.ok) {
      importPreview.value = res.data
      importStep.value = 1
    }
  } catch (err) {
    ElMessage.error('文件解析失败：' + err.message)
  }
}

async function handleImportCommit() {
  importLoading.value = true
  try {
    const res = await api.importPartsCommit(importRows.value)
    if (res.ok) {
      importResult.value = res.data
      importStep.value = 2
      loadList()
    }
  } finally {
    importLoading.value = false
  }
}

function finishImport() {
  importDialogVisible.value = false
  importStep.value = 0
  importFile.value = null
  importRows.value = []
  importPreview.value = {}
  importResult.value = {}
}

async function handleCleanup() {
  try {
    await ElMessageBox.confirm(
      '此操作将：\n1. 同名但不同规格的配件 → 重命名为"名称-规格"格式\n2. 完全重复的配件 → 仅保留第一条，其余标记为停用\n\n确定执行？',
      '清理重复配件',
      { confirmButtonText: '确定清理', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }

  cleanupLoading.value = true
  try {
    const res = await api.cleanupParts()
    if (res.ok) {
      const d = res.data
      let msg = `处理完成！\n重命名: ${d.renamed} 条\n停用重复: ${d.deleted} 条`
      ElMessageBox.alert(msg, '清理结果', { type: 'success' })
      loadList()
    } else {
      ElMessage.error(res.error?.message || '清理失败')
    }
  } catch (e) {
    ElMessage.error('清理失败: ' + (e.message || ''))
  } finally {
    cleanupLoading.value = false
  }
}

async function loadList() {
  loading.value = true
  try {
    const res = await api.listParts()
    if (res.ok) list.value = res.data.list
  } finally {
    loading.value = false
  }
}

onMounted(loadList)
</script>

<style lang="scss" scoped>
.header-actions {
  display: flex;
  gap: 8px;
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

  &.summary-source {
    background: #f4f4f5;
    border-color: #e9e9eb;
    .summary-number { color: #909399; }
  }
}

.import-steps {
  margin-bottom: 20px;
}

.import-body {
  min-height: 200px;
}

.error-list {
  font-size: 13px;
  line-height: 1.8;
  margin-top: 8px;
}

.preview-hint {
  text-align: center;
  color: #909399;
  font-size: 13px;
  padding: 8px 0;
}
</style>
