<template>
  <div class="page-container">
    <div class="page-header">
      <h2>AI 分析设置</h2>
      <p class="page-desc">配置大模型 API 以生成 AI 分析报告。未配置 API Key 时仅使用规则模板报告。</p>
    </div>

    <el-card class="config-card" shadow="never">
      <template #header>
        <div class="card-header-flex">
          <span>基础配置（所有部门共用）</span>
          <el-tag v-if="config.enabled" type="success" size="small" effect="plain">已启用</el-tag>
          <el-tag v-else type="info" size="small" effect="plain">未配置</el-tag>
        </div>
      </template>

      <el-form ref="formRef" :model="form" label-width="130px" style="max-width: 640px;">
        <el-form-item label="API 地址">
          <el-input v-model="form.apiBase" placeholder="https://api.openai.com/v1" clearable>
            <template #append>
              <el-dropdown trigger="click" @command="onSelectApiBase">
                <el-button :icon="InfoFilled">快速填入</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="(url, name) in config.apiBaseHints"
                      :key="name"
                      :command="url"
                    >{{ name }}</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-input>
          <div class="form-hint">不同模型厂商使用不同的 API 地址，点击右侧快速选择。留空默认使用 OpenAI。</div>
        </el-form-item>

        <el-form-item label="API Key">
          <el-input v-model="form.apiKey" type="password" placeholder="输入后保存，保存后不再回显" show-password clearable />
          <div v-if="config.apiKeyMasked" class="form-hint">已保存：{{ config.apiKeyMasked }}</div>
        </el-form-item>

        <el-form-item label="模型">
          <el-select v-model="form.model" placeholder="选择模型" filterable style="width: 100%;">
            <el-option-group label="OpenAI">
              <el-option v-for="m in modelGroups.openai" :key="m" :label="m" :value="m" />
            </el-option-group>
            <el-option-group label="Google Gemini">
              <el-option v-for="m in modelGroups.gemini" :key="m" :label="m" :value="m" />
            </el-option-group>
            <el-option-group label="Anthropic Claude">
              <el-option v-for="m in modelGroups.claude" :key="m" :label="m" :value="m" />
            </el-option-group>
            <el-option-group label="DeepSeek">
              <el-option v-for="m in modelGroups.deepseek" :key="m" :label="m" :value="m" />
            </el-option-group>
            <el-option-group label="通义千问">
              <el-option v-for="m in modelGroups.qwen" :key="m" :label="m" :value="m" />
            </el-option-group>
            <el-option-group label="智谱 GLM">
              <el-option v-for="m in modelGroups.glm" :key="m" :label="m" :value="m" />
            </el-option-group>
            <el-option-group label="月之暗面 Kimi">
              <el-option v-for="m in modelGroups.kimi" :key="m" :label="m" :value="m" />
            </el-option-group>
            <el-option-group label="其他">
              <el-option v-for="m in modelGroups.others" :key="m" :label="m" :value="m" />
            </el-option-group>
            <el-option-group label="自定义">
              <el-option label="自定义模型名..." value="custom" />
            </el-option-group>
          </el-select>
        </el-form-item>

        <el-form-item v-if="form.model === 'custom'" label="自定义模型名">
          <el-input v-model="form.customModel" placeholder="输入模型名称" clearable />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 提示词管理 — 按部门切换 -->
    <el-card class="prompt-card" shadow="never">
      <template #header>
        <div class="card-header-flex">
          <span>提示词管理</span>
          <el-button text type="primary" size="small" @click="resetAllPrompts">恢复当前部门默认</el-button>
        </div>
      </template>

      <!-- 部门切换 -->
      <div class="dept-selector">
        <el-radio-group v-model="activeDept" size="default" @change="onDeptChange">
          <el-radio-button v-for="dept in departments" :key="dept.key" :value="dept.key">
            <span class="dept-dot" :style="{ background: dept.color }"></span>
            {{ dept.label }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <!-- 当前部门数据说明 -->
      <div class="dept-data-hint">
        <el-icon><InfoFilled /></el-icon>
        <span>{{ currentDeptInfo.description }}</span>
      </div>

      <!-- 提示词编辑器 -->
      <el-tabs v-model="activePromptTab" type="border-card">
        <el-tab-pane
          v-for="(prompt, key) in currentDeptPrompts"
          :key="activeDept + '-' + key"
          :label="prompt.name"
          :name="key"
        >
          <div class="prompt-editor">
            <div class="prompt-toolbar">
              <span class="prompt-label">系统提示词</span>
              <el-button text size="small" @click="resetPrompt(key)">恢复默认</el-button>
            </div>
            <el-input v-model="prompt.content" type="textarea" :rows="8" placeholder="输入系统提示词..." resize="vertical" />
            <div class="prompt-vars">
              <span class="vars-label">数据会自动附加在提示词之后，包含：</span>
              <el-tag size="small" effect="plain" v-for="v in currentDeptInfo.dataVars" :key="v" style="margin: 2px 4px;">{{ v }}</el-tag>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <div style="margin-top: 12px; text-align: right;">
        <el-button type="primary" :loading="savingPrompts" @click="handleSavePrompts">保存提示词</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '@/utils/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'

const saving = ref(false)
const savingPrompts = ref(false)
const activeDept = ref('engineering')
const activePromptTab = ref('')

const departments = [
  { key: 'engineering', label: '工程部', color: '#07C160' },
  { key: 'boiler', label: '锅炉房', color: '#E65100' },
]

const deptInfo = {
  engineering: {
    description: '工程部分析数据包含设备维保、配件更换、报警、巡检、库存等多维度信息，AI 将进行综合交叉分析',
    dataVars: [
      '更换次数(含环比)', '配件消耗量(含环比)', '待处理报警数', '使用成本(含环比)',
      '更换类型分布(维修/预防/紧急)', '配件消耗TOP5', '设备故障TOP5(含紧急次数)',
      '工程师工作量', '报警设备分布', '低库存预警数',
      '巡检执行率(%)', '巡检异常发现数', '巡检覆盖设备数',
      '设备健康评分', '各工厂对比(汇总模式)',
    ],
  },
  boiler: {
    description: '锅炉房分析数据包含产汽量、能耗、成本、汽损率、燃料库存等信息',
    dataVars: [
      '总产汽量', '总用汽量', '总用电量', '总用水量', '燃料消耗量',
      '汽损率(%)', '吨汽耗电', '吨汽耗燃料', '吨汽耗水', '吨汽成本',
      '电费/燃料费/水费/总成本', '燃料库存(吨)', '预计可用天数',
      '各锅炉运行数据', '各客户用汽数据', '历史趋势(7日/30日)',
    ],
  },
}

const defaultPromptsMap = {
  engineering: {
    monthly_summary: { name: '月度总结', content: '你是一名服务于洗涤行业的资深设备维保高级分析师，拥有15年工业设备全生命周期管理经验。现在需要你根据提供的多维度数据，生成一份月度综合分析报告。\n\n数据维度说明：\n- 维修维度：配件更换记录、更换类型(维修/预防/紧急)、配件消耗量\n- 报警维度：设备报警记录、待处理报警、报警分布\n- 巡检维度：巡检执行率、异常发现数、巡检覆盖率\n- 库存维度：配件库存状态、低库存预警、使用成本\n- 人员维度：工程师工作量分布\n\n报告需面向三个层级：\n1. 管理层摘要（总经理）：3-5句概括，重点突出成本、设备可用率、核心变化\n2. 运营分析（运营总监）：关键指标仪表盘、趋势判断、风险预警\n3. 技术分析（工程部主管）：设备故障热点、配件消耗、巡检执行情况、人员负荷、下月建议\n\n多维度交叉分析要求：\n- 将巡检异常与维修记录关联，识别"巡检发现问题→维修闭环"的效率\n- 将报警频率与更换频率关联，判断设备健康趋势\n- 将巡检覆盖率与故障率关联，评估巡检计划的有效性\n\n输出要求：中文、Markdown格式、引用实际数字、建议可执行。' },
    device_analysis: { name: '设备分析', content: '你是一名设备健康管理专家，专注于洗涤行业工业设备的可靠性分析。请根据提供的多维度数据生成设备健康状态深度分析报告。\n\n重点分析：\n1. 设备总体健康评估（交通灯模型）：综合更换频率、报警次数、巡检异常三个维度评分\n2. 设备可靠性排名与故障模式分析：结合巡检发现和维修记录\n3. 预防性维护 vs 被动维修的执行效果：巡检是否有效提前发现问题\n4. 高风险设备识别与处置建议：同时出现巡检异常+高频报警+频繁更换的设备重点关注\n5. 巡检覆盖率与设备故障率的关联分析\n\n输出要求：中文、Markdown格式、数据驱动、建议具体到设备。' },
    cost_analysis: { name: '成本分析', content: '你是一名工业运维成本分析专家。请根据提供的多维度数据生成设备维保成本深度分析报告。\n\n重点分析：\n1. 本月总成本构成与环比变化\n2. 各工厂/设备成本排名\n3. 配件采购与库存优化建议\n4. 成本控制策略与预算建议\n5. 巡检投入产出分析：巡检覆盖充分的设备是否故障率更低、维修成本更少\n\n输出要求：中文、Markdown格式、包含成本明细、建议可执行。' },
    comprehensive: { name: '综合分析', content: '你是一名服务于洗涤行业的资深运维分析专家。请根据提供的全维度数据，生成一份跨维度深度分析报告。\n\n分析框架：\n\n一、多维度健康仪表盘\n- 维修指标：更换次数、紧急维修占比、环比趋势\n- 报警指标：待处理报警、报警集中设备\n- 巡检指标：执行率、异常发现率、覆盖率\n- 库存指标：低库存数、安全库存达标率\n- 成本指标：月度成本、吨成本趋势\n\n二、交叉关联分析\n- 巡检异常 → 是否在后续产生维修工单？闭环率如何？\n- 高报警设备 → 巡检是否覆盖？是否存在巡检盲区？\n- 频繁更换设备 → 是否需要大修或淘汰？设备生命周期评估\n- 库存预警 → 对应配件的消耗趋势是否在增加？\n\n三、风险预警与建议\n- 识别红色风险设备（多维度异常叠加）\n- 给出按优先级排序的行动建议（紧急/重要/建议）\n- 下月工作重点规划\n\n输出要求：中文、Markdown格式、引用实际数字、建议分优先级且可执行。' },
  },
  boiler: {
    daily_report: { name: '每日简报', content: '你是一名资深锅炉运行分析工程师，拥有15年工业锅炉运行管理经验。请根据提供的锅炉房运行数据，生成一份每日运行简报。\n\n报告结构：\n1. 今日运行概览：总产汽量、总能源成本、汽损率、燃料库存状况\n2. 各锅炉运行状态：表格展示运行时长、产汽量、用电量、效率评估\n3. 能耗效率分析：吨汽耗电/耗燃料/耗水与历史均值对比，汽损率分析\n4. 成本分析：各项能源成本明细，吨汽成本与昨日/本周均值对比\n5. 燃料库存预警：当前库存量和预计可用天数\n6. 运行建议：1-3条具体可执行的优化建议\n\n输出要求：中文、Markdown格式、引用实际数字、建议可执行。' },
    anomaly_diagnosis: { name: '异常诊断', content: '你是一名锅炉系统故障诊断专家，擅长从运行数据中识别异常模式和潜在风险。请根据提供的锅炉房运行数据，进行异常诊断分析。\n\n重点关注：\n1. 效率异常：吨汽耗电/耗燃料/耗水是否偏离正常范围（偏差>15%视为异常）\n2. 汽损异常：汽损率是否过高（>15%警告，>20%紧急）\n3. 设备异常：某台锅炉产汽效率是否明显低于其他锅炉\n4. 成本异常：吨汽成本是否突增\n5. 库存异常：燃料库存是否过低\n\n对每个异常给出：描述、可能原因（2-3个）、处置措施、风险等级（低/中/高）。' },
    trend_forecast: { name: '趋势预测', content: '你是一名能源管理与数据分析专家，擅长从历史运行数据中识别趋势并做出预测。请根据提供的锅炉房历史运行数据，进行趋势分析与预测。\n\n分析内容：\n1. 关键指标趋势：近7天/30天产汽量、成本、效率指标变化\n2. 季节性/周期性分析：工作日/周末差异，季节影响\n3. 预测与建议：下周/下月能源消耗和成本预测，燃料采购计划，设备维护排期\n4. 优化机会：降低能耗的具体措施，锅炉运行调度优化\n\n输出要求：中文、Markdown格式、数据驱动、建议可执行。' },
  },
}

const config = reactive({ apiKeyMasked: '', enabled: false, apiBaseHints: {} })

const form = reactive({
  apiKey: '', apiBase: '', model: 'gpt-4o-mini', customModel: '',
  deptPrompts: {
    engineering: {
      monthly_summary: { name: '月度总结', content: '' },
      device_analysis: { name: '设备分析', content: '' },
      cost_analysis: { name: '成本分析', content: '' },
      comprehensive: { name: '综合分析', content: '' },
    },
    boiler: {
      daily_report: { name: '每日简报', content: '' },
      anomaly_diagnosis: { name: '异常诊断', content: '' },
      trend_forecast: { name: '趋势预测', content: '' },
    },
  },
})

const currentDeptInfo = computed(() => deptInfo[activeDept.value] || deptInfo.engineering)
const currentDeptPrompts = computed(() => form.deptPrompts[activeDept.value] || {})

function onDeptChange() {
  const keys = Object.keys(form.deptPrompts[activeDept.value] || {})
  activePromptTab.value = keys[0] || ''
}

const modelGroups = computed(() => ({
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  claude: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
  glm: ['glm-4-flash', 'glm-4-plus'],
  kimi: ['moonshot-v1-8k', 'moonshot-v1-32k'],
  others: ['ernie-4.0-turbo-8k', 'yi-lightning', 'doubao-1.5-pro-32k', 'spark-max'],
}))

function onSelectApiBase(url) { form.apiBase = url }

async function loadConfig() {
  const res = await api.getAIConfig()
  if (!res.ok || !res.data) return
  config.apiKeyMasked = res.data.apiKeyMasked || ''
  config.enabled = res.data.enabled || false
  config.apiBaseHints = res.data.apiBaseHints || {}
  form.apiBase = res.data.apiBase || ''
  form.model = res.data.model || 'gpt-4o-mini'
  form.customModel = res.data.customModel || ''

  const sp = res.data.prompts || {}
  if (sp.monthly_summary && !sp.engineering) {
    mergeDeptPrompts('engineering', sp)
  } else {
    if (sp.engineering) mergeDeptPrompts('engineering', sp.engineering)
    if (sp.boiler) mergeDeptPrompts('boiler', sp.boiler)
  }
  fillDefaults()
}

function mergeDeptPrompts(dept, stored) {
  const target = form.deptPrompts[dept]
  if (!target) return
  for (const key of Object.keys(target)) {
    if (stored[key]?.content) target[key].content = stored[key].content
  }
}

function fillDefaults() {
  for (const dept of Object.keys(defaultPromptsMap)) {
    const target = form.deptPrompts[dept]
    const defaults = defaultPromptsMap[dept]
    if (!target || !defaults) continue
    for (const key of Object.keys(target)) {
      if (!target[key].content && defaults[key]?.content) target[key].content = defaults[key].content
    }
  }
}

async function handleSave() {
  saving.value = true
  try {
    const payload = { apiBase: form.apiBase, model: form.model, customModel: form.customModel }
    if (form.apiKey !== '') payload.apiKey = form.apiKey
    const res = await api.setAIConfig(payload)
    if (res.ok) { ElMessage.success('配置已保存'); form.apiKey = ''; await loadConfig() }
    else ElMessage.error(res.error?.message || '保存失败')
  } finally { saving.value = false }
}

async function handleSavePrompts() {
  savingPrompts.value = true
  try {
    const promptsPayload = {}
    for (const dept of Object.keys(form.deptPrompts)) {
      promptsPayload[dept] = {}
      for (const [key, val] of Object.entries(form.deptPrompts[dept])) {
        promptsPayload[dept][key] = { name: val.name, content: val.content }
      }
    }
    const res = await api.setAIConfig({ prompts: promptsPayload })
    if (res.ok) ElMessage.success('提示词已保存')
    else ElMessage.error(res.error?.message || '保存失败')
  } finally { savingPrompts.value = false }
}

function resetPrompt(key) {
  const defaults = defaultPromptsMap[activeDept.value]
  if (defaults?.[key]) {
    form.deptPrompts[activeDept.value][key].content = defaults[key].content
    ElMessage.info('已恢复「' + form.deptPrompts[activeDept.value][key].name + '」默认提示词')
  }
}

async function resetAllPrompts() {
  const deptLabel = departments.find(d => d.key === activeDept.value)?.label || ''
  try {
    await ElMessageBox.confirm('确定恢复「' + deptLabel + '」所有提示词为默认值？', '恢复默认', { type: 'warning' })
    const defaults = defaultPromptsMap[activeDept.value] || {}
    const target = form.deptPrompts[activeDept.value]
    for (const key of Object.keys(target)) {
      if (defaults[key]?.content) target[key].content = defaults[key].content
    }
    ElMessage.info('已恢复默认提示词，请点击"保存提示词"生效')
  } catch { /* cancelled */ }
}

onMounted(() => { loadConfig(); onDeptChange() })
</script>

<style lang="scss" scoped>
.page-desc { color: #606266; font-size: 14px; margin-top: 8px; }
.config-card, .prompt-card { margin-bottom: 20px; }
.card-header-flex { display: flex; align-items: center; justify-content: space-between; }
.form-hint { font-size: 12px; color: #909399; margin-top: 4px; line-height: 1.4; }

.dept-selector {
  margin-bottom: 16px;
  :deep(.el-radio-button__inner) { display: flex; align-items: center; gap: 6px; }
}
.dept-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }

.dept-data-hint {
  display: flex; align-items: flex-start; gap: 6px;
  padding: 10px 14px; background: #f0f9eb; border-radius: 6px;
  margin-bottom: 16px; font-size: 13px; color: #606266; line-height: 1.5;
  .el-icon { margin-top: 2px; color: #67c23a; flex-shrink: 0; }
}

.prompt-editor {
  .prompt-toolbar {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
    .prompt-label { font-size: 14px; font-weight: 500; color: #303133; }
  }
}

.prompt-vars {
  margin-top: 10px; padding: 10px 12px; background: #f5f7fa; border-radius: 6px;
  .vars-label { font-size: 12px; color: #909399; display: block; margin-bottom: 6px; }
}
</style>
