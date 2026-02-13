<template>
  <!-- 手机端访问提示 -->
  <div v-if="isMobile" class="mobile-warning">
    <div class="mobile-warning-card">
      <div class="mobile-warning-icon">💻</div>
      <h2>请使用电脑浏览器访问</h2>
      <p>康洁工程部管理后台仅支持 PC 端浏览器访问，手机端请使用小程序进行操作。</p>
      <p class="mobile-warning-hint">如需继续访问，请横屏或使用电脑打开此链接。</p>
      <button class="mobile-warning-btn" @click="isMobile = false">我知道了，继续访问</button>
    </div>
  </div>
  <router-view v-else />
</template>

<script setup>
import { ref, onMounted } from 'vue'

const isMobile = ref(false)

onMounted(() => {
  const ua = navigator.userAgent
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
  if (mobileRegex.test(ua) && window.innerWidth < 768) {
    isMobile.value = true
  }
})
</script>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.mobile-warning {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e0f9e8 0%, #f5f7fa 50%, #e8f4fd 100%);
  padding: 24px;
}

.mobile-warning-card {
  background: #fff;
  border-radius: 16px;
  padding: 40px 32px;
  max-width: 400px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}

.mobile-warning-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.mobile-warning-card h2 {
  font-size: 20px;
  color: #303133;
  margin: 0 0 12px;
}

.mobile-warning-card p {
  font-size: 14px;
  color: #606266;
  line-height: 1.6;
  margin: 0 0 8px;
}

.mobile-warning-hint {
  font-size: 12px !important;
  color: #909399 !important;
}

.mobile-warning-btn {
  margin-top: 20px;
  padding: 10px 24px;
  background: #07C160;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.mobile-warning-btn:active {
  opacity: 0.8;
}
</style>
