<template>
  <div class="page-container">
    <div class="page-header">
      <h2>配件入库</h2>
      <el-button @click="$router.push('/inventory')">返回库存列表</el-button>
    </div>

    <div class="inbound-form-card">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px" style="max-width: 600px">
        <el-form-item label="配件" prop="partSkuId">
          <div style="display: flex; gap: 8px; width: 100%">
            <el-select
              v-model="form.partSkuId"
              filterable
              placeholder="搜索并选择配件"
              style="flex: 1"
            >
              <el-option
                v-for="p in parts"
                :key="p.partSkuId"
                :label="`${p.partName} (${p.partCode})`"
                :value="p.partSkuId"
              />
            </el-select>
            <el-button @click="showNewPartDialog">+ 新增</el-button>
          </div>
        </el-form-item>
        <el-form-item label="入库数量" prop="qty">
          <el-input-number v-model="form.qty" :min="1" :max="99999" />
        </el-form-item>
        <el-form-item label="单价(元)" prop="unitPrice">
          <el-input-number v-model="form.unitPrice" :min="0" :precision="2" :step="1" />
        </el-form-item>
        <el-form-item label="总价">
          <span class="total-price">¥{{ (form.qty * form.unitPrice).toFixed(2) }}</span>
        </el-form-item>
        <el-form-item label="供应商">
          <el-input v-model="form.supplier" placeholder="可选" />
        </el-form-item>
        <el-form-item label="批次号">
          <el-input v-model="form.batchNo" placeholder="可选" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">确认入库</el-button>
        </el-form-item>
      </el-form>
    </div>
    <!-- 新增配件弹窗 -->
    <el-dialog v-model="newPartVisible" title="快捷新增配件" width="480px" destroy-on-close>
      <el-form ref="newPartFormRef" :model="newPartForm" :rules="newPartRules" label-width="90px">
        <el-form-item label="配件编号" prop="partCode">
          <el-input v-model="newPartForm.partCode" placeholder="如：HYD-SEAL-02" />
        </el-form-item>
        <el-form-item label="配件名称" prop="partName">
          <el-input v-model="newPartForm.partName" placeholder="如：液压油封" />
        </el-form-item>
        <el-form-item label="规格型号">
          <el-input v-model="newPartForm.specModel" placeholder="可选，如：φ80×50" />
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="newPartForm.unit" placeholder="默认：个" />
        </el-form-item>
        <el-form-item label="参考单价">
          <el-input-number v-model="newPartForm.unitPrice" :min="0" :precision="2" :step="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="newPartVisible = false">取消</el-button>
        <el-button type="primary" :loading="newPartSubmitting" @click="handleCreatePart">确认新增</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'

const router = useRouter()
const appStore = useAppStore()
const submitting = ref(false)
const parts = ref([])
const formRef = ref()

const form = reactive({
  partSkuId: '',
  qty: 1,
  unitPrice: 0,
  supplier: '',
  batchNo: '',
  remark: '',
})

const formRules = {
  partSkuId: [{ required: true, message: '请选择配件', trigger: 'change' }],
  qty: [{ required: true, message: '请输入数量', trigger: 'change' }],
  unitPrice: [{ required: true, message: '请输入单价', trigger: 'change' }],
}

// ===== 新增配件快捷入口 =====
const newPartVisible = ref(false)
const newPartSubmitting = ref(false)
const newPartFormRef = ref()
const newPartForm = reactive({
  partCode: '',
  partName: '',
  specModel: '',
  unit: '个',
  unitPrice: 0,
})
const newPartRules = {
  partCode: [{ required: true, message: '请输入配件编号', trigger: 'blur' }],
  partName: [{ required: true, message: '请输入配件名称', trigger: 'blur' }],
}

function showNewPartDialog() {
  Object.assign(newPartForm, { partCode: '', partName: '', specModel: '', unit: '个', unitPrice: 0 })
  newPartVisible.value = true
}

async function handleCreatePart() {
  try { await newPartFormRef.value.validate() } catch { return }
  newPartSubmitting.value = true
  try {
    const res = await api.createPart({
      ...newPartForm,
      factoryId: appStore.currentFactoryId,
    })
    if (res.ok) {
      ElMessage.success(res.data?.updated ? '配件已更新' : '配件新增成功')
      newPartVisible.value = false
      // 刷新配件列表并自动选中新配件
      await loadParts()
      const newId = res.data?.partSkuId
      if (newId) form.partSkuId = newId
    } else {
      ElMessage.error(res.error?.message || '新增失败')
    }
  } finally {
    newPartSubmitting.value = false
  }
}

// ===== 加载配件列表 =====
async function loadParts() {
  const res = await api.listParts()
  if (res.ok) parts.value = res.data.list.filter(p => p.active)
}

async function handleSubmit() {
  try { await formRef.value.validate() } catch { return }
  if (form.unitPrice <= 0) {
    ElMessage.warning('单价必须大于 0')
    return
  }
  submitting.value = true
  try {
    const res = await api.inventoryInbound({
      factoryId: appStore.currentFactoryId,
      partSkuId: form.partSkuId,
      qty: form.qty,
      unitPrice: form.unitPrice,
      supplier: form.supplier,
      batchNo: form.batchNo,
      remark: form.remark,
    })
    if (res.ok) {
      ElMessage.success('入库成功')
      router.push('/inventory')
    } else {
      ElMessage.error(res.error?.message || '入库失败')
    }
  } finally {
    submitting.value = false
  }
}

onMounted(loadParts)
</script>

<style lang="scss" scoped>
.inbound-form-card {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.total-price {
  font-size: 18px;
  font-weight: 700;
  color: #303133;
}
</style>
