# PC 管理端测试执行报告

> 生成时间：2026-02-13
> 范围：PC Admin 全部功能模块代码审查 + 修复

---

## 一、审查概览

| 审查项 | 结果 |
|--------|------|
| API 接口覆盖 | 52 个前端 API 全部有 pcGateway 后端实现 ✅ |
| 路由配置 | 16 条路由，角色权限守卫完整 ✅ |
| 登录认证 | JWT 签发/验证逻辑完整，角色限制 PC 登录 ✅ |
| Pinia 状态 | auth + app 两个 Store 功能完备 ✅ |

---

## 二、发现并修复的问题（共 8 项）

### 🔴 P0 — 关键功能不可用

#### 问题 1：数据看板缺少 3 个关键数据集
- **影响**：看板页 4 个模块完全空白
  - M4「工程师工作量」图表为空
  - M5「最近 7 天更换趋势」折线图为空  
  - M6「报警设备分布」区域为空
  - 顶部「活跃工程师」卡片永远显示 0
- **原因**：`pcGateway.getDashboardStats` 未返回 `engineerWorkload`、`dailyTrend`、`alertsByAsset` 三个字段
- **修复**：在 getDashboardStats 中补充：
  - `engineerWorkload`：从 replacement_logs 按报告人分组统计
  - `dailyTrend`：计算最近 7 天每日更换次数
  - `alertsByAsset`：从 OPEN 报警按设备分组统计

#### 问题 2：AI 分析报告页面完全不可用
- **影响**：点击「生成报告」按钮后永远显示空白或报错
- **原因**：`pcGateway.getAIReport` 仅查询缓存表 `ai_reports`，无实际报告生成逻辑。当缓存不存在时返回 `{ report: null }`
- **修复**：完整重写 getAIReport：
  - 新增 `aggregateMonthData` 聚合函数：统计当月/上月的更换次数、配件消耗、报警、成本、人员等全维度数据
  - 新增 `buildReport` 报告生成函数：生成 7 个维度的分析报告（设备健康总览、历史对比、配件分析、设备热点、成本分析、人员负荷、报警闭环）
  - 支持 `scope: 'factory'` 和 `scope: 'summary'` 两种报告范围
  - 返回 `{ summaryText, sections, history, stats, prevStats, factoryLabel, byFactory }`

#### 问题 3：出入库记录页面看不到数据
- **影响**：PC 端「出入库记录」页面入库和出库记录均为空
- **原因**：集合名不匹配
  - pcGateway 读写 `inventory_logs`（错误）
  - `adminInventoryInbound` 写入 `inventory_inbound_logs`（正确）
  - `submitReplacementLog` 写入 `inventory_outbound_logs`（正确）
- **修复**：
  - `listInboundLogs` → 从 `inventory_inbound_logs` 读取
  - `listOutboundLogs` → 从 `inventory_outbound_logs` 读取
  - `inventoryInbound` → 写入 `inventory_inbound_logs`
  - `getInventoryTrend` → 分别查询两个集合
  - `getInventorySummary` → 从正确集合计算入库/出库金额
  - `ALL_COLLECTIONS` 数组同步更新

---

### 🟡 P1 — 数据显示不完整

#### 问题 4：报警列表缺少「确认人」显示
- **影响**：报警列表中已确认的报警「确认人」列显示空白，导出 Excel 也缺少确认人信息
- **原因**：`pcGateway.listAlerts` 返回原始数据，未将 `ackByUserId` 解析为 `ackByName`
- **修复**：在 listAlerts 中查询 users 表，将 `ackByUserId` 映射为 `ackByName`，同时确保 `assetName`/`partName` 字段存在

#### 问题 5：部位复制成功提示显示 undefined
- **影响**：复制设备部位后，成功提示显示 "复制成功：undefined 个部位，undefined 条映射"
- **原因**：前端期望 `{ copiedLocations, copiedMaps }`，pcGateway 返回 `{ copiedCount }`
- **修复**：`copyLocations` 返回 `{ copiedLocations, copiedMaps }` 分别统计部位和映射数量

#### 问题 6：配件使用成本排名全部显示 ¥0
- **影响**：看板「设备配件使用金额 TOP 10」和库存页面的成本排名全部为 0
- **原因**：
  - `getMonthlyCostRanking` 从 `replacement_logs` 取 `item.unitPrice`，但实际出库成本存在 `inventory_outbound_logs` 的 `totalCost` 字段
  - `getPartUsageCostList` 缺少 `partCode`、`specModel`、`unit`、`percentage` 等前端需要的字段
- **修复**：
  - `getMonthlyCostRanking` 改为从 `inventory_outbound_logs` 按设备汇总成本
  - `getPartUsageCostList` 从 `inventory_outbound_logs` 按配件汇总，补充 parts 表数据和百分比计算

#### 问题 7：库存列表缺少配件详情和阈值显示异常
- **影响**：库存列表中配件型号、单位显示空白；低库存标记不生效
- **原因**：
  - `listInventory` 返回原始数据，缺少 `specModelSnapshot`、`unitSnapshot`、`avgUnitCost`、`totalCostValue`
  - 前端使用 `lowStockThreshold`，数据库存储 `threshold`，字段名不一致
- **修复**：
  - `listInventory` 查询 parts 表补充快照字段，统一映射 `threshold` → `lowStockThreshold`
  - `updateInventoryThreshold` 同时更新 `threshold` 和 `lowStockThreshold`
  - `listInventoryAlerts` 兼容两种字段名

#### 问题 8：部位配件映射缺少配件编号
- **影响**：部位管理页面配件编号列显示空白
- **原因**：`listLocationPartMap` 返回原始映射数据，`partCode` 未存储在映射表中
- **修复**：`listLocationPartMap` 查询 parts 表，补充 `partName` 和 `partCode`

---

## 三、修改文件清单

| 文件 | 修改类型 | 修改内容 |
|------|----------|----------|
| `cloudfunctions/pcGateway/index.js` | 修改 | 修复上述 8 个问题 |

### pcGateway 修改的函数列表

| 函数名 | 修改说明 |
|--------|----------|
| `ALL_COLLECTIONS` | 替换 `inventory_logs` → `inventory_inbound_logs` + `inventory_outbound_logs` |
| `getDashboardStats` | 新增 `engineerWorkload`、`dailyTrend`、`alertsByAsset` |
| `getAIReport` | 完全重写，新增 `aggregateMonthData` 和 `buildReport` |
| `listAlerts` | 新增 `ackByName` 用户解析和字段富化 |
| `copyLocations` | 返回 `copiedLocations` + `copiedMaps` |
| `getMonthlyCostRanking` | 改为从 `inventory_outbound_logs` 按设备汇总 |
| `getPartUsageCostList` | 完全重写，从出库记录按配件汇总 + 补充字段 |
| `listInventory` | 新增 parts 表查询补充快照字段和阈值映射 |
| `updateInventoryThreshold` | 同时更新 `threshold` 和 `lowStockThreshold` |
| `listInventoryAlerts` | 兼容 `lowStockThreshold` 和 `threshold` |
| `listLocationPartMap` | 新增 parts 表查询补充 `partCode` |
| `inventoryInbound` | 改写入 `inventory_inbound_logs`，支持批量入库 |
| `listInboundLogs` | 改查 `inventory_inbound_logs` |
| `listOutboundLogs` | 改查 `inventory_outbound_logs` |
| `getInventoryTrend` | 改查两个正确集合 |
| `getInventorySummary` | 新增入库/出库金额和库存总价值计算 |

---

## 四、部署步骤

修复内容全部在 `cloudfunctions/pcGateway/index.js` 一个文件中，部署步骤如下：

1. 打开微信开发者工具
2. 右键 `cloudfunctions/pcGateway` → **「上传并部署：云端安装依赖」**
3. 等待部署完成
4. 刷新 PC 管理端页面验证

> **注意**：本次仅需重新部署 `pcGateway` 这一个云函数

---

## 五、PC 端测试用例执行预估

修复后各模块测试预期：

| 模块 | 测试用例数 | 修复前预期 | 修复后预期 |
|------|-----------|-----------|-----------|
| 登录/认证 | 8 | ✅ 全通过 | ✅ 全通过 |
| 数据看板 - 基础统计 | 5 | ✅ 通过 | ✅ 通过 |
| 数据看板 - 图表 | 6 | ❌ 4个图表空白 | ✅ 全通过 |
| 数据看板 - 下钻 | 4 | ✅ 通过 | ✅ 通过 |
| 数据看板 - 库存概览 | 4 | ❌ 金额显示0 | ✅ 全通过 |
| AI 分析报告 | 6 | ❌ 完全不可用 | ✅ 全通过 |
| 更换记录 | 5 | ✅ 通过 | ✅ 通过 |
| 报警管理 | 6 | ⚠ 确认人空白 | ✅ 全通过 |
| 设备管理 | 8 | ✅ 通过 | ✅ 通过 |
| 部位管理 | 6 | ⚠ 复制提示异常 | ✅ 全通过 |
| 配件字典 | 6 | ✅ 通过 | ✅ 通过 |
| 阈值管理 | 4 | ✅ 通过 | ✅ 通过 |
| 用户管理 | 6 | ✅ 通过 | ✅ 通过 |
| 工厂管理 | 4 | ✅ 通过 | ✅ 通过 |
| 库存管理 | 8 | ❌ 阈值显示异常 | ✅ 全通过 |
| 入库登记 | 4 | ⚠ 记录不同步 | ✅ 全通过 |
| 出入库记录 | 4 | ❌ 列表为空 | ✅ 全通过 |
| AI 设置 | 3 | ✅ 通过 | ✅ 通过 |
| **合计** | **97** | **❌ 多处异常** | **✅ 预期全通过** |
