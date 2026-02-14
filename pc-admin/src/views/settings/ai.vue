<template>
  <div class="page-container">
    <div class="page-header">
      <h2>AI 分析设置</h2>
      <p class="page-desc">配置大模型 API 以生成 AI 分析报告。未配置 API Key 时仅使用规则模板报告。</p>
    </div>

    <el-card class="config-card" shadow="never">
      <template #header>
        <div class="card-header-flex">
          <span>基础配置</span>
          <el-tag v-if="config.enabled" type="success" size="small" effect="plain">已启用</el-tag>
          <el-tag v-else type="info" size="small" effect="plain">未配置</el-tag>
        </div>
      </template>

      <el-form ref="formRef" :model="form" label-width="130px" style="max-width: 640px;">
        <!-- API Base URL -->
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
                    >
                      {{ name }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-input>
          <div class="form-hint">不同模型厂商使用不同的 API 地址，点击右侧快速选择。留空默认使用 OpenAI。</div>
        </el-form-item>

        <!-- API Key -->
        <el-form-item label="API Key">
          <el-input
            v-model="form.apiKey"
            type="password"
            placeholder="输入后保存，保存后不再回显"
            show-password
            clearable
          />
          <div v-if="config.apiKeyMasked" class="form-hint">已保存：{{ config.apiKeyMasked }}</div>
        </el-form-item>

        <!-- Model -->
        <el-form-item label="模型">
          <el-select
            v-model="form.model"
            placeholder="选择模型"
            filterable
            style="width: 100%;"
          >
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

        <!-- Custom Model -->
        <el-form-item v-if="form.model === 'custom'" label="自定义模型名">
          <el-input v-model="form.customModel" placeholder="输入模型名称，如 my-model-v1" clearable />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 提示词管理 -->
    <el-card class="prompt-card" shadow="never">
      <template #header>
        <div class="card-header-flex">
          <span>提示词管理</span>
          <el-button text type="primary" size="small" @click="resetAllPrompts">全部恢复默认</el-button>
        </div>
      </template>

      <el-tabs v-model="activePromptTab" type="border-card">
        <el-tab-pane
          v-for="(prompt, key) in form.prompts"
          :key="key"
          :label="prompt.name"
          :name="key"
        >
          <div class="prompt-editor">
            <div class="prompt-toolbar">
              <span class="prompt-label">系统提示词</span>
              <el-button text size="small" @click="resetPrompt(key)">恢复默认</el-button>
            </div>
            <el-input
              v-model="prompt.content"
              type="textarea"
              :rows="6"
              placeholder="输入系统提示词..."
              resize="vertical"
            />
            <div class="prompt-vars">
              <span class="vars-label">数据会自动附加在提示词之后，包含：</span>
              <el-tag size="small" effect="plain" v-for="v in dataVars" :key="v" style="margin: 2px 4px;">{{ v }}</el-tag>
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

const formRef = ref()
const saving = ref(false)
const savingPrompts = ref(false)
const activePromptTab = ref('monthly_summary')

const config = reactive({
  apiKeyMasked: '',
  enabled: false,
  apiBaseHints: {},
})

const form = reactive({
  apiKey: '',
  apiBase: '',
  model: 'gpt-4o-mini',
  customModel: '',
  prompts: {
    monthly_summary: { name: '月度总结', content: '' },
    device_analysis: { name: '设备分析', content: '' },
    cost_analysis: { name: '成本分析', content: '' },
  },
})

const defaultPrompts = ref({})

const dataVars = [
  '更换次数(含环比)', '配件消耗量(含环比)', '待处理报警数', '使用成本(含环比)',
  '更换类型分布(维修/预防/紧急)', '配件消耗TOP5', '设备故障TOP5(含紧急次数)',
  '工程师工作量', '报警设备分布', '低库存预警数', '各工厂对比(汇总模式)',
]

// 模型分组
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

function onSelectApiBase(url) {
  form.apiBase = url
}

async function loadConfig() {
  const res = await api.getAIConfig()
  if (res.ok && res.data) {
    config.apiKeyMasked = res.data.apiKeyMasked || ''
    config.enabled = res.data.enabled || false
    config.apiBaseHints = res.data.apiBaseHints || {}

    form.apiBase = res.data.apiBase || ''
    form.model = res.data.model || 'gpt-4o-mini'
    form.customModel = res.data.customModel || ''

    // 加载提示词
    const p = res.data.prompts || {}
    const dp = res.data.defaultPrompts || {}
    defaultPrompts.value = dp

    form.prompts.monthly_summary.content = p.monthly_summary?.content || dp.monthly_summary?.content || ''
    form.prompts.device_analysis.content = p.device_analysis?.content || dp.device_analysis?.content || ''
    form.prompts.cost_analysis.content = p.cost_analysis?.content || dp.cost_analysis?.content || ''
  }
}

async function handleSave() {
  saving.value = true
  try {
    const payload = {
      apiBase: form.apiBase,
      model: form.model,
      customModel: form.customModel,
    }
    if (form.apiKey !== '') payload.apiKey = form.apiKey

    const res = await api.setAIConfig(payload)
    if (res.ok) {
      ElMessage.success('配置已保存')
      form.apiKey = ''
      await loadConfig()
    } else {
      ElMessage.error(res.error?.message || '保存失败')
    }
  } finally {
    saving.value = false
  }
}

async function handleSavePrompts() {
  savingPrompts.value = true
  try {
    const res = await api.setAIConfig({ prompts: form.prompts })
    if (res.ok) {
      ElMessage.success('提示词已保存')
    } else {
      ElMessage.error(res.error?.message || '保存失败')
    }
  } finally {
    savingPrompts.value = false
  }
}

function resetPrompt(key) {
  const dp = defaultPrompts.value[key]
  if (dp) {
    form.prompts[key].content = dp.content
    ElMessage.info(`已恢复「${form.prompts[key].name}」默认提示词`)
  }
}

async function resetAllPrompts() {
  try {
    await ElMessageBox.confirm('确定恢复所有提示词为默认值？', '恢复默认', { type: 'warning' })
    for (const key of Object.keys(form.prompts)) {
      const dp = defaultPrompts.value[key]
      if (dp) form.prompts[key].content = dp.content
    }
    ElMessage.info('已恢复所有默认提示词，请点击"保存提示词"生效')
  } catch { /* cancelled */ }
}

onMounted(loadConfig)
</script>

<style lang="scss" scoped>
.page-desc {
  color: #606266;
  font-size: 14px;
  margin-top: 8px;
}

.config-card {
  margin-bottom: 20px;
}

.prompt-card {
  margin-bottom: 20px;
}

.card-header-flex {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}

.prompt-editor {
  .prompt-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    .prompt-label {
      font-size: 14px;
      font-weight: 500;
      color: #303133;
    }
  }
}

.prompt-vars {
  margin-top: 10px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  .vars-label {
    font-size: 12px;
    color: #909399;
    display: block;
    margin-bottom: 6px;
  }
}
</style>
