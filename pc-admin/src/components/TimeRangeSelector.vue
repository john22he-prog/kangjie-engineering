<template>
  <div class="time-range-selector">
    <el-radio-group v-model="mode" size="small" @change="onModeChange">
      <el-radio-button value="month">月</el-radio-button>
      <el-radio-button value="quarter">季度</el-radio-button>
      <el-radio-button value="year">年</el-radio-button>
      <el-radio-button value="all">全部</el-radio-button>
      <el-radio-button value="custom">自定义</el-radio-button>
    </el-radio-group>

    <span v-if="mode === 'month' || mode === 'quarter' || mode === 'year' || mode === 'all'" class="time-label">{{ currentLabel }}</span>

    <template v-if="mode === 'custom'">
      <el-date-picker
        v-model="customStart"
        type="month"
        placeholder="起始月份"
        format="YYYY-MM"
        value-format="YYYY-MM"
        :clearable="false"
        size="small"
        @change="emitValue"
      />
      <span class="range-sep">至</span>
      <el-date-picker
        v-model="customEnd"
        type="month"
        placeholder="结束月份"
        format="YYYY-MM"
        value-format="YYYY-MM"
        :clearable="false"
        size="small"
        @change="emitValue"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import dayjs from 'dayjs'

const props = defineProps({
  modelValue: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const now = dayjs()
const mode = ref('month')
const customStart = ref(now.subtract(2, 'month').format('YYYY-MM'))
const customEnd = ref(now.format('YYYY-MM'))

const currentMonth = now.format('YYYY-MM')
const currentYear = now.format('YYYY')
const currentQuarter = `Q${Math.ceil((now.month() + 1) / 3)}`

function getQuarterMonths(year, q) {
  const qMap = { Q1: [1,2,3], Q2: [4,5,6], Q3: [7,8,9], Q4: [10,11,12] }
  return (qMap[q] || [1,2,3]).map(m => `${year}-${String(m).padStart(2, '0')}`)
}

function getYearMonths(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

function getCustomMonths(start, end) {
  const months = []
  let cur = dayjs(start + '-01')
  const last = dayjs(end + '-01')
  while (cur.isBefore(last) || cur.isSame(last, 'month')) {
    months.push(cur.format('YYYY-MM'))
    cur = cur.add(1, 'month')
  }
  return months
}

const currentLabel = computed(() => {
  if (mode.value === 'month') return now.format('YYYY年MM月')
  if (mode.value === 'quarter') return `${currentYear}年 ${currentQuarter}`
  if (mode.value === 'year') return `${currentYear}年`
  if (mode.value === 'all') return '全部历史数据'
  return ''
})

function buildOutput() {
  let yearMonths = null
  let label = ''
  if (mode.value === 'month') {
    yearMonths = [currentMonth]
    label = now.format('YYYY年MM月')
  } else if (mode.value === 'quarter') {
    yearMonths = getQuarterMonths(currentYear, currentQuarter)
    label = `${currentYear}年${currentQuarter}`
  } else if (mode.value === 'year') {
    yearMonths = getYearMonths(currentYear)
    label = `${currentYear}年`
  } else if (mode.value === 'all') {
    yearMonths = null
    label = '全部'
  } else if (mode.value === 'custom') {
    yearMonths = getCustomMonths(customStart.value, customEnd.value)
    label = `${customStart.value} ~ ${customEnd.value}`
  }
  return { mode: mode.value, yearMonths, label }
}

function emitValue() {
  emit('update:modelValue', buildOutput())
}

function onModeChange() {
  emitValue()
}

onMounted(() => {
  if (props.modelValue && props.modelValue.mode) {
    mode.value = props.modelValue.mode
  }
  emitValue()
})

watch(() => props.modelValue, (val) => {
  if (val && val.mode && val.mode !== mode.value) {
    mode.value = val.mode
  }
}, { deep: true })
</script>

<style scoped>
.time-range-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.time-label {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}
.range-sep {
  font-size: 13px;
  color: #606266;
}
</style>
