<template>
  <div class="page-container">
    <div class="page-header">
      <h2>配件入库</h2>
      <el-button @click="$router.push('/inventory')">返回库存列表</el-button>
    </div>

    <div class="inbound-form-card">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px" style="max-width: 600px">
        <el-form-item label="配件" prop="partSkuId">
          <el-select
            v-model="form.partSkuId"
            filterable
            placeholder="搜索并选择配件"
            style="width: 100%"
          >
            <el-option
              v-for="p in parts"
              :key="p.partSkuId"
              :label="`${p.partName} (${p.partCode})`"
              :value="p.partSkuId"
            />
          </el-select>
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
