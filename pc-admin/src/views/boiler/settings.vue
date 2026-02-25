<template>
  <div class="page-container boiler-settings">
    <div class="page-header">
      <h2>设备配置</h2>
      <div class="header-actions">
        <el-select
          v-model="currentParkId"
          @change="onParkSwitch"
          placeholder="选择园区"
          style="width: 200px;"
        >
          <el-option
            v-for="f in appStore.factories"
            :key="f.factoryId"
            :label="parkNameMap[f.factoryId] || f.factoryName"
            :value="f.factoryId"
          />
          <template #footer>
            <el-button link type="primary" @click="showCreateDialog" style="width:100%;justify-content:center">
              <el-icon><Plus /></el-icon>新增园区
            </el-button>
          </template>
        </el-select>
        <el-button @click="showRenameDialog" :disabled="!currentParkId">
          <el-icon><Edit /></el-icon>重命名
        </el-button>
        <el-button type="primary" @click="saveConfig" :loading="saving">
          <el-icon><Check /></el-icon>保存配置
        </el-button>
      </div>
    </div>

    <div v-loading="loading">
      <el-alert v-if="!currentParkId" type="warning" :closable="false" show-icon style="margin-bottom:16px">
        请先选择或新增一个园区，每个园区有独立的设备配置。
      </el-alert>

      <!-- 单价配置 -->
      <el-card shadow="never" class="config-card">
        <template #header><span class="card-title">单价配置（用于成本核算）</span></template>
        <el-row :gutter="24">
          <el-col :span="6">
            <el-form-item label="燃料参考价（元/吨）">
              <el-input-number v-model="config.prices.fuel" :min="0" :precision="0" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="电价（元/度）">
              <el-input-number v-model="config.prices.electricity" :min="0" :precision="4" :step="0.01" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="水价（元/吨）">
              <el-input-number v-model="config.prices.water" :min="0" :precision="2" :step="0.1" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="月度人工费（元）">
              <el-input-number v-model="config.prices.laborMonthly" :min="0" :precision="0" :step="1000" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <div class="price-hint">
          <span v-if="fuelStockInfo">燃料加权均价 <b>¥{{ fuelStockInfo.avgPrice }}</b>/吨（库存{{ fuelStockInfo.currentWeight }}吨）</span>
          <span v-else-if="config.prices.fuel">燃料参考价 {{ config.prices.fuel }} 元/吨（无入库记录时使用）</span>
          <span v-if="config.prices.electricity"> · 电 {{ config.prices.electricity }} 元/度</span>
          <span v-if="config.prices.water"> · 水 {{ config.prices.water }} 元/吨</span>
          <span v-if="config.prices.laborMonthly"> · 月度人工 {{ config.prices.laborMonthly.toLocaleString() }} 元</span>
          <span v-if="!config.prices.fuel && !config.prices.electricity && !config.prices.water" style="color:#909399">未配置单价，看板和报表将不显示成本数据</span>
        </div>
      </el-card>

      <!-- KPI 目标 + 预警配置 -->
      <el-card shadow="never" class="config-card">
        <template #header><span class="card-title">KPI 目标与预警</span></template>
        <el-row :gutter="24">
          <el-col :span="6">
            <el-form-item label="吨汽成本目标（元）">
              <el-input-number v-model="config.kpiTargets.costPerSteam" :min="0" :precision="0" controls-position="right" style="width:100%" placeholder="不设目标" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="汽柴比目标">
              <el-input-number v-model="config.kpiTargets.steamFuelRatio" :min="0" :precision="2" :step="0.1" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="库存天数预警">
              <el-input-number v-model="config.alerts.fuelStockDaysThreshold" :min="1" :max="30" :precision="0" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="成本偏离预警（%）">
              <el-input-number v-model="config.alerts.costDeviationPct" :min="5" :max="50" :precision="0" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <div class="price-hint">
          <span>吨汽成本超过目标时看板高亮 · 成本偏离7日均值超{{ config.alerts.costDeviationPct || 15 }}%时预警 · 库存低于{{ config.alerts.fuelStockDaysThreshold || 3 }}天时预警</span>
        </div>
      </el-card>

      <!-- 锅炉设备 -->
      <el-card shadow="never" class="config-card">
        <template #header>
          <div class="card-header">
            <span class="card-title">锅炉设备</span>
            <el-button type="primary" link @click="addBoiler"><el-icon><Plus /></el-icon>添加锅炉</el-button>
          </div>
        </template>
        <el-table :data="config.boilers" stripe>
          <el-table-column label="名称" width="140">
            <template #default="{ row }"><el-input v-model="row.name" placeholder="如 6T锅炉" /></template>
          </el-table-column>
          <el-table-column label="型号" width="180">
            <template #default="{ row }"><el-input v-model="row.model" placeholder="如 SZL6-1.25-AII" /></template>
          </el-table-column>
          <el-table-column label="额定容量（吨/时）" width="160">
            <template #default="{ row }"><el-input-number v-model="row.rated_capacity" :min="0" :precision="1" controls-position="right" style="width:100%" /></template>
          </el-table-column>
          <el-table-column label="燃料类型" width="140">
            <template #default="{ row }">
              <el-select v-model="row.fuel_type" placeholder="选择" style="width:100%">
                <el-option label="生物质" value="生物质" /><el-option label="天然气" value="天然气" />
                <el-option label="燃煤" value="燃煤" /><el-option label="电" value="电" /><el-option label="其他" value="其他" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }"><el-switch v-model="row.status" active-value="active" inactive-value="inactive" active-text="运行" inactive-text="停用" /></template>
          </el-table-column>
          <el-table-column label="" width="70" fixed="right">
            <template #default="{ $index }"><el-button link type="danger" @click="config.boilers.splice($index, 1)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-empty v-if="config.boilers.length === 0" description="暂无锅炉设备" :image-size="50" />
      </el-card>

      <!-- 客户 -->
      <el-card shadow="never" class="config-card">
        <template #header>
          <div class="card-header">
            <span class="card-title">客户（洗涤公司）</span>
            <el-button type="primary" link @click="addCustomer"><el-icon><Plus /></el-icon>添加客户</el-button>
          </div>
        </template>
        <el-table :data="config.customers" stripe>
          <el-table-column label="名称" width="200">
            <template #default="{ row }"><el-input v-model="row.name" placeholder="如 金龙" /></template>
          </el-table-column>
          <el-table-column label="联系人" width="140">
            <template #default="{ row }"><el-input v-model="row.contact" placeholder="选填" /></template>
          </el-table-column>
          <el-table-column label="联系电话" width="160">
            <template #default="{ row }"><el-input v-model="row.phone" placeholder="选填" /></template>
          </el-table-column>
          <el-table-column label="备注">
            <template #default="{ row }"><el-input v-model="row.remark" placeholder="选填" /></template>
          </el-table-column>
          <el-table-column label="" width="70" fixed="right">
            <template #default="{ $index }"><el-button link type="danger" @click="config.customers.splice($index, 1)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-empty v-if="config.customers.length === 0" description="暂无客户" :image-size="50" />
      </el-card>

      <!-- 供应商管理 -->
      <el-card shadow="never" class="config-card">
        <template #header>
          <div class="card-header">
            <span class="card-title">供应商管理</span>
            <el-button type="primary" link @click="addSupplier"><el-icon><Plus /></el-icon>添加供应商</el-button>
          </div>
        </template>
        <el-table :data="config.suppliers" stripe>
          <el-table-column label="名称" width="200">
            <template #default="{ row }"><el-input v-model="row.name" placeholder="供应商名称" /></template>
          </el-table-column>
          <el-table-column label="联系人" width="140">
            <template #default="{ row }"><el-input v-model="row.contact" placeholder="选填" /></template>
          </el-table-column>
          <el-table-column label="联系电话" width="160">
            <template #default="{ row }"><el-input v-model="row.phone" placeholder="选填" /></template>
          </el-table-column>
          <el-table-column label="备注">
            <template #default="{ row }"><el-input v-model="row.remark" placeholder="选填" /></template>
          </el-table-column>
          <el-table-column label="" width="70" fixed="right">
            <template #default="{ $index }"><el-button link type="danger" @click="config.suppliers.splice($index, 1)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-empty v-if="config.suppliers.length === 0" description="暂无供应商，可在入库时直接输入" :image-size="50" />
      </el-card>
    </div>

    <!-- 重命名弹窗 -->
    <el-dialog v-model="renameVisible" title="重命名园区" width="400" align-center>
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px">
        仅修改锅炉模块中的园区显示名称，不影响系统工厂管理。
      </el-alert>
      <el-form>
        <el-form-item label="园区名称">
          <el-input v-model="newParkName" placeholder="输入新名称" maxlength="30" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameVisible = false">取消</el-button>
        <el-button type="primary" :loading="renaming" @click="doRename">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新增园区弹窗 -->
    <el-dialog v-model="createVisible" title="新增园区" width="400" align-center>
      <el-form>
        <el-form-item label="园区名称" required>
          <el-input v-model="createParkName" placeholder="如 丽江锅炉房" maxlength="30" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="doCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { api } from '@/utils/api'
import { ElMessage } from 'element-plus'
import { Plus, Check, Edit } from '@element-plus/icons-vue'

const appStore = useAppStore()
const loading = ref(false)
const saving = ref(false)
const fuelStockInfo = ref(null)
const config = reactive({
  boilers: [], customers: [], suppliers: [],
  prices: { fuel: 700, electricity: 0.8, water: 4, laborMonthly: 0 },
  kpiTargets: { costPerSteam: null, steamFuelRatio: null },
  alerts: { fuelStockDaysThreshold: 3, costDeviationPct: 15 },
})

const currentParkId = ref(appStore.currentFactoryId || '')
const parkNameMap = reactive({})
const renameVisible = ref(false)
const newParkName = ref('')
const renaming = ref(false)
const createVisible = ref(false)
const createParkName = ref('')
const creating = ref(false)

let idCounter = Date.now()
function uid() { return 'b_' + (idCounter++) }
function addBoiler() { config.boilers.push({ id: uid(), name: '', model: '', rated_capacity: 0, fuel_type: '生物质', status: 'active' }) }
function addCustomer() { config.customers.push({ id: uid(), name: '', contact: '', phone: '', remark: '' }) }
function addSupplier() { config.suppliers.push({ id: uid(), name: '', contact: '', phone: '', remark: '' }) }

async function loadParks() {
  const res = await api.boilerListParks()
  if (res.ok && res.data) {
    for (const p of res.data) {
      if (p.parkName) parkNameMap[p.factoryId] = p.parkName
    }
  }
}

function onParkSwitch(factoryId) {
  currentParkId.value = factoryId
  loadConfig()
}

function showRenameDialog() {
  newParkName.value = parkNameMap[currentParkId.value] || appStore.factories.find(f => f.factoryId === currentParkId.value)?.factoryName || ''
  renameVisible.value = true
}

async function doRename() {
  const name = newParkName.value.trim()
  if (!name) { ElMessage.warning('名称不能为空'); return }
  renaming.value = true
  try {
    const res = await api.boilerSaveConfig(currentParkId.value, { parkName: name })
    if (res.ok) {
      parkNameMap[currentParkId.value] = name
      ElMessage.success('园区已重命名为「' + name + '」')
      renameVisible.value = false
    } else {
      ElMessage.error(res.error?.message || '重命名失败')
    }
  } catch (err) { ElMessage.error('重命名失败: ' + err.message) }
  finally { renaming.value = false }
}

function showCreateDialog() {
  createParkName.value = ''
  createVisible.value = true
}

async function doCreate() {
  const name = createParkName.value.trim()
  if (!name) { ElMessage.warning('请输入园区名称'); return }
  creating.value = true
  try {
    const factoryId = 'BP-' + Date.now()
    const res = await api.createFactory({ factoryName: name, factoryId })
    if (!res.ok) { ElMessage.error(res.error?.message || '创建失败'); return }
    const newId = res.data?.factoryId || factoryId
    await api.boilerSaveConfig(newId, { parkName: name })
    parkNameMap[newId] = name
    await appStore.loadFactories()
    currentParkId.value = newId
    appStore.setCurrentFactory(newId, name)
    ElMessage.success('园区「' + name + '」已创建')
    createVisible.value = false
    loadConfig()
  } catch (err) { ElMessage.error('创建失败: ' + err.message) }
  finally { creating.value = false }
}

async function loadConfig() {
  if (!currentParkId.value) return
  loading.value = true
  try {
    const res = await api.boilerGetConfig(currentParkId.value)
    if (res.ok && res.data) {
      config.boilers = (res.data.boilers || []).map(b => ({ id: b.id || uid(), ...b }))
      config.customers = (res.data.customers || []).map(c => ({ id: c.id || uid(), ...c }))
      config.suppliers = (res.data.suppliers || []).map(s => ({ id: s.id || uid(), ...s }))
      config.prices = { fuel: 700, electricity: 0.8, water: 4, laborMonthly: 0, ...res.data.prices }
      config.kpiTargets = { costPerSteam: null, steamFuelRatio: null, ...res.data.kpiTargets }
      config.alerts = { fuelStockDaysThreshold: 3, costDeviationPct: 15, ...res.data.alerts }
      if (res.data.parkName) parkNameMap[currentParkId.value] = res.data.parkName
      fuelStockInfo.value = res.data.fuelStock || null
    }
  } finally { loading.value = false }
}

async function saveConfig() {
  const validBoilers = config.boilers.filter(b => b.name.trim())
  const validCustomers = config.customers.filter(c => c.name.trim())
  const validSuppliers = config.suppliers.filter(s => s.name.trim())
  saving.value = true
  try {
    const res = await api.boilerSaveConfig(currentParkId.value, {
      boilers: validBoilers,
      customers: validCustomers,
      suppliers: validSuppliers,
      prices: { ...config.prices },
      kpiTargets: { ...config.kpiTargets },
      alerts: { ...config.alerts },
    })
    if (res.ok) ElMessage.success('配置已保存')
    else ElMessage.error(res.error?.message || '保存失败')
  } catch (err) { ElMessage.error('保存失败: ' + err.message) }
  finally { saving.value = false }
}

onMounted(async () => {
  await loadParks()
  if (currentParkId.value) loadConfig()
})
</script>

<style lang="scss" scoped>
.boiler-settings {
  .header-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .config-card { border-radius: 12px; margin-bottom: 16px; }
  .card-header { display: flex; justify-content: space-between; align-items: center; }
  .card-title { font-weight: 600; font-size: 15px; }
  .price-hint {
    font-size: 13px; color: #606266; margin-top: 8px; padding: 8px 12px; background: #f5f7fa; border-radius: 6px;
    b { color: #E65100; font-weight: 600; }
  }
}
</style>
