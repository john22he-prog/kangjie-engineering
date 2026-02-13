<template>
  <div class="page-container">
    <div class="page-header">
      <h2>AI 分析设置</h2>
      <p class="page-desc">配置大模型 API Key 与模型，用于生成 AI 分析报告。未配置时仅使用规则+模板报告。</p>
    </div>

    <el-card class="form-card">
      <el-form ref="formRef" :model="form" label-width="120px" style="max-width: 520px;">
        <el-form-item label="API Key">
          <el-input
            v-model="form.apiKey"
            type="password"
            placeholder="输入后保存，保存后不再回显"
            show-password
            clearable
          />
          <div v-if="config.apiKeyMasked" class="form-hint">已保存的 Key：{{ config.apiKeyMasked }}</div>
        </el-form-item>
        <el-form-item label="模型">
          <el-select v-model="form.model" placeholder="选择模型" style="width: 100%;">
            <el-option
              v-for="m in config.models"
              :key="m"
              :label="m"
              :value="m"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from '@/utils/api'
import { ElMessage } from 'element-plus'

const formRef = ref()
const saving = ref(false)
const config = reactive({
  apiKeyMasked: '',
  model: 'gpt-4o-mini',
  models: [],
})
const form = reactive({
  apiKey: '',
  model: 'gpt-4o-mini',
})

async function loadConfig() {
  const res = await api.getAIConfig()
  if (res.ok && res.data) {
    config.apiKeyMasked = res.data.apiKeyMasked || ''
    config.model = res.data.model || 'gpt-4o-mini'
    config.models = res.data.models || []
    form.model = config.model
  }
}

async function handleSave() {
  saving.value = true
  try {
    const payload = { model: form.model }
    if (form.apiKey !== '') payload.apiKey = form.apiKey
    const res = await api.setAIConfig(payload)
    if (res.ok) {
      ElMessage.success('保存成功')
      form.apiKey = ''
      await loadConfig()
      form.model = config.model
    } else {
      ElMessage.error(res.error?.message || '保存失败')
    }
  } finally {
    saving.value = false
  }
}

onMounted(loadConfig)
</script>

<style lang="scss" scoped>
.page-desc {
  color: #606266;
  font-size: 14px;
  margin-top: 8px;
}
.form-card {
  max-width: 600px;
}
.form-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
