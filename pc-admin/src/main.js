import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'

import {
  ArrowDown, ArrowRight, ArrowUp, Bell, Box, DataAnalysis,
  Document, Download, Expand, Fold, House, InfoFilled,
  List, Loading, MagicStick, Menu, Monitor, Notebook,
  OfficeBuilding, Picture, Plus, Refresh, Right, Search,
  SetUp, Setting, Sunrise, SwitchButton, TrendCharts,
  User, UserFilled, Warning, WarningFilled, Edit, Delete,
  Check, Close, Upload, CirclePlus, Remove,
} from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import './assets/styles/global.scss'

const app = createApp(App)

const icons = {
  ArrowDown, ArrowRight, ArrowUp, Bell, Box, DataAnalysis,
  Document, Download, Expand, Fold, House, InfoFilled,
  List, Loading, MagicStick, Menu, Monitor, Notebook,
  OfficeBuilding, Picture, Plus, Refresh, Right, Search,
  SetUp, Setting, Sunrise, SwitchButton, TrendCharts,
  User, UserFilled, Warning, WarningFilled, Edit, Delete,
  Check, Close, Upload, CirclePlus, Remove,
}
for (const [key, component] of Object.entries(icons)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

app.mount('#app')
