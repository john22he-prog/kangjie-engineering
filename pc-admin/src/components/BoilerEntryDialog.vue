<template>
  <el-dialog v-model="visible" title="录入每日运行数据" width="800px" :close-on-click-modal="false" @close="resetForm" align-center>
    <el-form :model="form" label-width="auto">
      <el-form-item label="日期">
        <el-date-picker v-model="form.record_date" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" :clearable="false" style="width:200px" />
      </el-form-item>
      <el-divider content-position="left">
        <span>锅炉数据</span>
        <el-button link type="primary" @click="addBoiler" style="margin-left:8px">+ 添加锅炉</el-button>
      </el-divider>
      <div v-for="(b, idx) in form.boilers" :key="idx" class="entry-block">
        <div class="entry-block-header">
          <el-input v-model="b.name" placeholder="锅炉名称" style="width:120px" size="small" />
          <el-button link type="danger" @click="form.boilers.splice(idx, 1)" size="small">删除</el-button>
        </div>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="用电量（度）"><el-input-number v-model="b.electricity" :min="0" :precision="0" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="产汽量（吨）"><el-input-number v-model="b.steam_production" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
        </el-row>
      </div>
      <el-empty v-if="form.boilers.length === 0" description="暂无锅炉，点击上方添加" :image-size="40" />
      <el-divider content-position="left">
        <span>客户用汽</span>
        <el-button link type="primary" @click="addCustomer" style="margin-left:8px">+ 添加客户</el-button>
      </el-divider>
      <div v-for="(c, idx) in form.customers" :key="idx" class="entry-block">
        <div class="entry-block-header">
          <el-input v-model="c.name" placeholder="客户名称" style="width:120px" size="small" />
          <el-button link type="danger" @click="form.customers.splice(idx, 1)" size="small">删除</el-button>
        </div>
        <el-row :gutter="16">
          <el-col :span="12"><el-form-item label="用汽量（吨）"><el-input-number v-model="c.steam_usage" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
        </el-row>
      </div>
      <el-empty v-if="form.customers.length === 0" description="暂无客户，点击上方添加" :image-size="40" />
      <el-divider content-position="left">资源消耗</el-divider>
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="燃料消耗（吨）">
            <el-input-number v-model="form.fuel_consumed" :min="0" :precision="1" controls-position="right" style="width:100%" />
          </el-form-item>
          <div class="inline-cost" v-if="fuelUnitLabel">成本 <b>¥{{ Math.round(form.fuel_consumed * effectiveFuelPrice).toLocaleString() }}</b>（{{ fuelUnitLabel }}）</div>
        </el-col>
        <el-col :span="8">
          <el-form-item label="用水量（吨）">
            <el-input-number v-model="form.water_usage" :min="0" :precision="1" controls-position="right" style="width:100%" />
          </el-form-item>
          <div class="inline-cost" v-if="prices.water">成本 <b>¥{{ Math.round(form.water_usage * prices.water).toLocaleString() }}</b>（{{ prices.water }}元/吨）</div>
        </el-col>
        <el-col :span="8">
          <el-form-item label="进柴量（吨）">
            <el-input-number v-model="form.fuel_intake" :min="0" :precision="1" controls-position="right" style="width:100%" />
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 快捷入库 -->
      <el-divider content-position="left">
        <el-checkbox v-model="showQuickInbound" label="今日进货入库（可选）" />
      </el-divider>
      <div v-if="showQuickInbound" class="quick-inbound">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="供应商">
              <el-select v-model="form.inbound_supplier" filterable allow-create placeholder="选择或输入" style="width:100%" size="default">
                <el-option v-for="s in suppliers" :key="s.name" :label="s.name" :value="s.name" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="重量（吨）">
              <el-input-number v-model="form.inbound_weight" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="单价（元/吨）">
              <el-input-number v-model="form.inbound_price" :min="0" :precision="0" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <div class="inbound-calc" v-if="form.inbound_weight > 0 && form.inbound_price > 0">
          本批金额：<b>¥{{ (form.inbound_weight * form.inbound_price).toLocaleString() }}</b>
        </div>
      </div>

      <div class="cost-summary-bar" v-if="entryCost">
        预估总成本 <b>¥{{ entryCost.total.toLocaleString() }}</b>
        <span v-if="entryCost.laborDaily > 0">（含人工 ¥{{ entryCost.laborDaily }}）</span>
        ｜吨汽成本 <b>¥{{ entryCost.perSteam }}</b>
        ｜汽柴比 <b>{{ entryCost.steamFuelRatio }}</b>
      </div>
      <div class="stock-calc" v-if="fuelStock.currentWeight != null || form.fuel_intake > 0">
        燃料库存：当前 <b>{{ fuelStock.currentWeight ?? '?' }}</b> + 进柴 <b>{{ form.fuel_intake }}</b> − 消耗 <b>{{ form.fuel_consumed }}</b>
        = <span class="stock-result" :class="{ 'text-danger': estimatedStock < 0 }">{{ estimatedStock }} 吨</span>
      </div>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="submitRecord" :loading="submitting">提交记录</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { api } from '@/utils/api'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'

const emit = defineEmits(['submitted'])
const appStore = useAppStore()
const visible = ref(false)
const submitting = ref(false)
const prices = ref({ fuel: 0, electricity: 0, water: 0, laborMonthly: 0 })
const fuelStock = ref({})
const suppliers = ref([])
const showQuickInbound = ref(false)

const FALLBACK_BOILERS = [
  { name: '6T锅炉', electricity: 0, steam_production: 0 },
  { name: '4T锅炉', electricity: 0, steam_production: 0 },
]
const FALLBACK_CUSTOMERS = [
  { name: '金龙', steam_usage: 0 },
  { name: '银丰', steam_usage: 0 },
]

function makeForm() {
  return {
    record_date: dayjs().format('YYYY-MM-DD'),
    fuel_consumed: 0, water_usage: 0, fuel_intake: 0,
    boilers: FALLBACK_BOILERS.map(b => ({ ...b })),
    customers: FALLBACK_CUSTOMERS.map(c => ({ ...c })),
    inbound_supplier: '', inbound_weight: 0, inbound_price: 0,
  }
}
const form = ref(makeForm())

function addBoiler() { form.value.boilers.push({ name: '', electricity: 0, steam_production: 0 }) }
function addCustomer() { form.value.customers.push({ name: '', steam_usage: 0 }) }
function resetForm() { form.value = makeForm(); showQuickInbound.value = false }

const effectiveFuelPrice = computed(() => fuelStock.value?.avgPrice || prices.value.fuel || 0)
const fuelUnitLabel = computed(() => {
  if (fuelStock.value?.avgPrice) return '加权均价 ' + fuelStock.value.avgPrice + '元/吨'
  if (prices.value.fuel) return prices.value.fuel + '元/吨'
  return ''
})

const totalElec = computed(() => form.value.boilers.reduce((t, b) => t + (b.electricity || 0), 0))
const totalSteam = computed(() => form.value.boilers.reduce((t, b) => t + (b.steam_production || 0), 0))

const entryCost = computed(() => {
  const p = prices.value
  const fp = effectiveFuelPrice.value
  if (!fp && !p.electricity && !p.water) return null
  const fc = (form.value.fuel_consumed || 0) * fp
  const ec = totalElec.value * (p.electricity || 0)
  const wc = (form.value.water_usage || 0) * (p.water || 0)
  const rd = form.value.record_date
  const daysInMonth = rd ? new Date(parseInt(rd.slice(0, 4)), parseInt(rd.slice(5, 7)), 0).getDate() : 30
  const laborDaily = Math.round((p.laborMonthly || 0) / daysInMonth)
  const total = Math.round(fc + ec + wc + laborDaily)
  const perSteam = totalSteam.value > 0 ? +((fc + ec + wc + laborDaily) / totalSteam.value).toFixed(1) : 0
  const steamFuelRatio = form.value.fuel_consumed > 0
    ? +(totalSteam.value / form.value.fuel_consumed).toFixed(2) : 0
  return { total, perSteam, laborDaily, steamFuelRatio }
})

const estimatedStock = computed(() => {
  const base = fuelStock.value?.currentWeight ?? 0
  return +(base + (form.value.fuel_intake || 0) - (form.value.fuel_consumed || 0)).toFixed(1)
})

async function open() {
  visible.value = true
  showQuickInbound.value = false
  try {
    const factoryId = appStore.currentFactoryId || ''
    const cfgRes = await api.boilerGetConfig(factoryId)
    if (cfgRes.ok && cfgRes.data) {
      if (cfgRes.data.prices) prices.value = cfgRes.data.prices
      if (cfgRes.data.fuelStock) fuelStock.value = cfgRes.data.fuelStock
      if (cfgRes.data.suppliers) suppliers.value = cfgRes.data.suppliers
      const cfgBoilers = cfgRes.data.boilers?.filter(b => b.status !== 'inactive') || []
      const cfgCustomers = cfgRes.data.customers || []
      form.value = {
        record_date: dayjs().format('YYYY-MM-DD'),
        fuel_consumed: 0, water_usage: 0, fuel_intake: 0,
        boilers: cfgBoilers.length > 0
          ? cfgBoilers.map(b => ({ name: b.name, electricity: 0, steam_production: 0 }))
          : FALLBACK_BOILERS.map(b => ({ ...b })),
        customers: cfgCustomers.length > 0
          ? cfgCustomers.map(c => ({ name: c.name, steam_usage: 0 }))
          : FALLBACK_CUSTOMERS.map(c => ({ ...c })),
        inbound_supplier: '', inbound_weight: 0, inbound_price: 0,
      }
    } else {
      form.value = makeForm()
    }
  } catch { form.value = makeForm() }
}

async function submitRecord() {
  if (!appStore.currentFactoryId) { ElMessage.warning('请先选择一个园区'); return }
  if (!form.value.record_date) { ElMessage.warning('请选择日期'); return }
  const validBoilers = form.value.boilers.filter(b => b.name && (b.electricity > 0 || b.steam_production > 0))
  if (validBoilers.length === 0) { ElMessage.warning('请至少填写一台锅炉的运行数据'); return }
  submitting.value = true
  try {
    if (showQuickInbound.value && form.value.inbound_weight > 0 && form.value.inbound_price > 0) {
      await api.boilerFuelInbound({
        factoryId: appStore.currentFactoryId,
        date: form.value.record_date,
        weight: form.value.inbound_weight,
        unit_price: form.value.inbound_price,
        supplier: form.value.inbound_supplier || '',
      })
    }

    const payload = {
      record_date: form.value.record_date,
      fuel_consumed: form.value.fuel_consumed || 0,
      water_usage: form.value.water_usage || 0,
      fuel_intake: form.value.fuel_intake || 0,
      factoryId: appStore.currentFactoryId,
      factory_id: appStore.currentFactoryId,
      boilers: validBoilers.map(b => ({ name: b.name, electricity: b.electricity, steam_production: b.steam_production })),
      customers: form.value.customers
        .filter(c => c.name && c.steam_usage > 0)
        .map(c => ({ name: c.name, steam_usage: c.steam_usage })),
    }
    const res = await api.boilerCreateRecord(payload)
    if (res.ok) {
      ElMessage.success('录入成功')
      visible.value = false
      emit('submitted')
    } else {
      ElMessage.error(res.error?.message || '录入失败')
    }
  } catch (err) { ElMessage.error('录入失败：' + (err.message || '未知错误')) }
  finally { submitting.value = false }
}

defineExpose({ open })
</script>

<style lang="scss" scoped>
.entry-block {
  background: #fafbfc; border: 1px solid #ebeef5; border-radius: 8px;
  padding: 12px 16px; margin-bottom: 12px;
}
.entry-block-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;
}
.inline-cost {
  font-size: 12px; color: #909399; margin-top: -8px; margin-bottom: 8px; padding-left: 2px;
  b { color: #E65100; }
}
.quick-inbound {
  padding: 12px 16px; background: #f5f7fa; border-radius: 8px; margin-bottom: 12px;
}
.inbound-calc {
  padding: 8px 12px; margin-bottom: 8px;
  background: #fff7e6; border: 1px solid #ffe0b2; border-radius: 6px;
  font-size: 13px; color: #303133;
  b { color: #E65100; font-weight: 700; }
}
.cost-summary-bar {
  display: flex; gap: 16px; padding: 10px 14px; margin-bottom: 12px; flex-wrap: wrap;
  background: #fff7e6; border: 1px solid #ffe0b2; border-radius: 8px;
  font-size: 14px; color: #303133;
  b { color: #E65100; font-weight: 700; }
}
.stock-calc {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 10px 14px; background: #f5f7fa; border-radius: 8px; margin-top: 8px;
  font-size: 13px; color: #606266;
  b { color: #303133; }
  .stock-result { font-weight: 600; color: #409EFF; }
  .text-danger { color: #F56C6C !important; }
}
</style>
