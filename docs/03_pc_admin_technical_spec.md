# PC 端管理后台 — 详细技术方案（v1.0）

**项目**：康洁工程部小程序 — PC 管理后台  
**版本**：v1.0（一期 MVP）  
**日期**：2026-02-11  
**后端**：复用微信云开发（CloudBase），新增 admin 系列云函数  
**前端**：Vue 3 + Vite + Element Plus（PC Web 应用）  
**部署**：CloudBase 静态网站托管 / 或独立部署

---

## 1. 技术选型与架构

### 1.1 技术栈

| 层级 | 选型 | 理由 |
|------|------|------|
| 前端框架 | **Vue 3 (Composition API)** | 上手快、生态成熟、与微信云开发兼容 |
| 构建工具 | **Vite** | 快速开发体验 |
| UI 组件库 | **Element Plus** | 表格/表单/弹窗/上传组件齐全，管理后台首选 |
| HTTP/SDK | **@cloudbase/js-sdk** | 直接调用云函数，无需自建 API 层 |
| 状态管理 | **Pinia** | 轻量、Vue 3 官方推荐 |
| 路由 | **Vue Router 4** | SPA 路由 |
| Excel 处理 | **SheetJS (xlsx)** | 前端解析 Excel 导入文件 |
| 图标 | **@element-plus/icons-vue** | 与 Element Plus 统一风格 |
| 二维码生成 | **qrcode** (npm) | 设备二维码导出 |

### 1.2 整体架构

```
┌─────────────────────────────────────────────────────┐
│                   PC 管理后台 (Vue 3)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ 用户管理 │ │ 设备管理 │ │ 配件管理 │ │ 阈值   │ │
│  │          │ │ +部位    │ │ +映射    │ │ 配置   │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ 记录查看 │ │ 报警管理 │ │ 看板统计 │            │
│  └──────────┘ └──────────┘ └──────────┘            │
└────────────────────┬────────────────────────────────┘
                     │ @cloudbase/js-sdk
                     ▼
┌─────────────────────────────────────────────────────┐
│              微信云开发 CloudBase                     │
│  ┌────────────────────────────────────────────────┐ │
│  │ admin 云函数（PC 端专用，需 Admin 权限）        │ │
│  │ ─────────────────────────────────────────────── │ │
│  │ adminLogin / adminCreateUser / adminImportParts │ │
│  │ adminCreateAsset / adminUpsertLocation / ...    │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ 复用已有云函数（只读查询）                      │ │
│  │ ─────────────────────────────────────────────── │ │
│  │ listReplacementLogs / listAlerts / getMe / ...  │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ 数据库 / 存储（共用同一环境）                   │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 1.3 与小程序的关系

- **共用同一个 CloudBase 环境**（同一个 appid `wx3e10fc82cc0af56d`）
- **共用同一套数据库集合**（assets / parts / users / replacement_logs 等）
- **新增 admin 系列云函数**，与小程序云函数并存于 `cloudfunctions/` 目录
- PC 端通过 `@cloudbase/js-sdk` 以**匿名登录 + 自定义鉴权**或**账号密码登录**调用云函数

---

## 2. 认证与权限方案

### 2.1 PC 端登录方式

> PC 端无微信 openid，需要独立的身份认证方案。

**方案：用户名 + 密码登录 → 云函数校验 → 返回自定义 token**

| 步骤 | 说明 |
|------|------|
| 1 | PC 端用户在登录页输入 username + password |
| 2 | 前端调用云函数 `adminLogin`，传入 username/password |
| 3 | 云函数查询 `users` 集合，校验密码（bcrypt 哈希比对） |
| 4 | 校验通过，生成 JWT token（含 userId / role / exp），返回前端 |
| 5 | 前端存储 token（localStorage），后续每次调用云函数携带 token |
| 6 | admin 云函数统一解析 token → 校验角色 → 执行逻辑 |

### 2.2 数据库调整（users 集合新增字段）

```json
{
  "userId": "U001",
  "username": "admin01",
  "displayName": "系统管理员",
  "role": "Admin",
  "status": "active",
  "openid": null,
  "passwordHash": "$2b$10$...",   // ← 新增：bcrypt 哈希
  "canLoginPC": true,             // ← 新增：是否允许 PC 登录
  "lastLoginAt": 1707580000000,   // ← 新增：最近登录时间
  "updatedAt": 1707580000000
}
```

> **注意**：`passwordHash` 仅在云函数服务端读取，前端永远不下发此字段。

### 2.3 权限矩阵

| 功能模块 | Admin | Supervisor | Engineer | Viewer |
|----------|-------|------------|----------|--------|
| PC 登录 | ✅ | ✅（只读） | ❌ | ❌ |
| 用户管理（增删改） | ✅ | ❌ | ❌ | ❌ |
| 设备管理（增删改） | ✅ | ❌ | ❌ | ❌ |
| 配件字典导入 | ✅ | ❌ | ❌ | ❌ |
| 部位 & 映射管理 | ✅ | ❌ | ❌ | ❌ |
| 阈值配置 | ✅ | ✅ | ❌ | ❌ |
| 记录查看 | ✅ | ✅ | ❌ | ❌ |
| 报警管理 & ACK | ✅ | ✅ | ❌ | ❌ |
| 看板统计 | ✅ | ✅ | ❌ | ❌ |

### 2.4 Token 鉴权中间件（云函数复用）

```javascript
// shared/auth.js — 所有 admin 云函数共用
const jwt = require('jsonwebtoken')
const SECRET = 'your-jwt-secret' // 建议放环境变量

function verifyAdmin(token, allowedRoles = ['Admin']) {
  if (!token) return { ok: false, error: { code: 'AUTH_REQUIRED', message: '请先登录' } }
  try {
    const decoded = jwt.verify(token, SECRET)
    if (!allowedRoles.includes(decoded.role)) {
      return { ok: false, error: { code: 'PERMISSION_DENIED', message: '无权限' } }
    }
    return { ok: true, user: decoded }
  } catch (e) {
    return { ok: false, error: { code: 'TOKEN_EXPIRED', message: '登录已过期，请重新登录' } }
  }
}

module.exports = { verifyAdmin }
```

---

## 3. 项目目录结构

```
kangjie-app/
├── cloudfunctions/              # 已有 + 新增 admin 云函数
│   ├── getMe/                   # 已有
│   ├── submitReplacementLog/    # 已有
│   ├── listReplacementLogs/     # 已有
│   ├── listAlerts/              # 已有
│   ├── ackAlert/                # 已有
│   ├── getAssetByQr/            # 已有
│   ├── getLocationsAndParts/    # 已有
│   ├── initMockData/            # 已有
│   │
│   ├── shared/                  # ← 新增：共用工具（auth / validator）
│   │   ├── auth.js
│   │   └── validator.js
│   │
│   ├── adminLogin/              # ← 新增
│   ├── adminUserManage/         # ← 新增（CRUD 合并为一个函数）
│   ├── adminAssetManage/        # ← 新增
│   ├── adminLocationManage/     # ← 新增
│   ├── adminPartManage/         # ← 新增（含 Excel 导入）
│   ├── adminMapManage/          # ← 新增（部位→配件映射）
│   ├── adminThresholdManage/    # ← 新增
│   └── adminDashboard/          # ← 新增（聚合统计）
│
├── miniprogram/                 # 已有小程序代码（不动）
│
└── pc-admin/                    # ← 新增：PC 管理后台前端
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── .env.development
    ├── .env.production
    └── src/
        ├── main.js
        ├── App.vue
        ├── router/
        │   └── index.js
        ├── stores/
        │   ├── user.js           # 登录态 & 用户信息
        │   └── app.js            # 全局 loading / 面包屑
        ├── api/
        │   ├── cloudbase.js      # SDK 初始化
        │   ├── auth.js           # adminLogin
        │   ├── user.js           # adminUserManage
        │   ├── asset.js          # adminAssetManage
        │   ├── location.js       # adminLocationManage
        │   ├── part.js           # adminPartManage
        │   ├── map.js            # adminMapManage
        │   ├── threshold.js      # adminThresholdManage
        │   ├── record.js         # listReplacementLogs（复用）
        │   ├── alert.js          # listAlerts / ackAlert（复用）
        │   └── dashboard.js      # adminDashboard
        ├── layouts/
        │   └── AdminLayout.vue   # 侧边栏 + 顶栏 + 内容区
        ├── views/
        │   ├── login/
        │   │   └── index.vue
        │   ├── dashboard/
        │   │   └── index.vue
        │   ├── user/
        │   │   └── index.vue
        │   ├── asset/
        │   │   ├── index.vue     # 设备列表
        │   │   └── detail.vue    # 设备详情（部位 + 映射 + 阈值）
        │   ├── part/
        │   │   └── index.vue     # 配件字典（含导入）
        │   ├── record/
        │   │   └── index.vue
        │   ├── alert/
        │   │   └── index.vue
        │   └── threshold/
        │       └── index.vue
        ├── components/
        │   ├── QrCodeDialog.vue
        │   ├── ExcelImporter.vue
        │   ├── LocationEditor.vue
        │   ├── PartMapEditor.vue
        │   └── ThresholdBatchEditor.vue
        └── utils/
            ├── token.js          # token 存取
            ├── excel.js          # SheetJS 封装
            └── constants.js      # 角色/状态/类型枚举
```

---

## 4. 前端页面规格

### 4.1 登录页 `/login`

**布局**：居中卡片，品牌 logo + 项目名 + 表单

| 字段 | 类型 | 校验 |
|------|------|------|
| 用户名 | el-input | 必填 |
| 密码 | el-input (password) | 必填，最短6位 |

**交互流程**：
1. 输入用户名+密码 → 点击"登录"
2. 调用 `adminLogin` 云函数
3. 成功 → 存储 token + 用户信息 → 跳转 `/dashboard`
4. 失败 → 显示错误：`用户名或密码错误` / `账号已禁用` / `无PC登录权限`

**路由守卫**：
- 无 token → 强制跳转 `/login`
- token 过期 → 清除 token → 跳转 `/login` 并提示"登录已过期"

---

### 4.2 管理后台布局 `AdminLayout`

```
┌─────────────────────────────────────────────────────────┐
│  Logo: 康洁工程管理系统          [管理员姓名]  [退出登录]│
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  📊 看板  │           面包屑导航                         │
│  👤 用户  │  ┌──────────────────────────────────────┐   │
│  🏭 设备  │  │                                      │   │
│  🔧 配件  │  │          页面内容区                    │   │
│  ⚠️ 阈值  │  │          (router-view)               │   │
│  📋 记录  │  │                                      │   │
│  🔔 报警  │  │                                      │   │
│          │  └──────────────────────────────────────┘   │
└──────────┴──────────────────────────────────────────────┘
```

**侧边栏菜单**（根据角色动态显示）：

| 菜单项 | 路由 | 最低角色 |
|--------|------|----------|
| 看板 | `/dashboard` | Supervisor |
| 用户管理 | `/user` | Admin |
| 设备管理 | `/asset` | Admin |
| 配件字典 | `/part` | Admin |
| 阈值配置 | `/threshold` | Supervisor |
| 更换记录 | `/record` | Supervisor |
| 报警管理 | `/alert` | Supervisor |

---

### 4.3 看板页 `/dashboard`

**模块（el-card 卡片网格）**：

| 卡片 | 数据来源 | 展示 |
|------|----------|------|
| 本月更换次数 | `adminDashboard` | 数字 + 环比 |
| 本月配件消耗 TOP 5 | `adminDashboard` | 柱状排名 |
| 本月设备更换 TOP 5 | `adminDashboard` | 柱状排名 |
| OPEN 报警数 | `adminDashboard` | 数字（红色高亮） |
| 工程人员工作量 | `adminDashboard` | 表格/柱状 |
| 最近 7 天趋势 | `adminDashboard` | 折线图（可选） |

> 一期可使用简单的数字/表格展示，二期引入 ECharts 做可视化增强。

---

### 4.4 用户管理 `/user`

**页面元素**：
- 顶部操作栏：`[+ 新建用户]` `[搜索框]` `[角色筛选]` `[状态筛选]`
- 表格（el-table）：

| 列 | 字段 | 说明 |
|----|------|------|
| 用户名 | username | — |
| 姓名 | displayName | — |
| 角色 | role | Tag 颜色区分 |
| 状态 | status | active=绿 / disabled=灰 |
| 微信绑定 | openid | 已绑定✅ / 未绑定❌ |
| PC登录 | canLoginPC | 开关 |
| 操作 | — | 编辑 / 禁用 / 解绑微信 / 重置密码 |

**弹窗：新建/编辑用户**

| 字段 | 类型 | 校验 |
|------|------|------|
| 用户名 | el-input | 必填，唯一 |
| 姓名 | el-input | 必填 |
| 角色 | el-select | Engineer / Viewer / Supervisor / Admin |
| 初始密码 | el-input | 新建时必填，编辑时可选（不填则不改） |
| 允许PC登录 | el-switch | Admin/Supervisor 默认开启 |

**关键操作**：
- **禁用账号**：确认弹窗 → 调用 `adminUserManage(action: 'disable')`
- **解绑微信**：确认弹窗 → 调用 `adminUserManage(action: 'unbindOpenid')`，场景：离职换人
- **重置密码**：确认弹窗 → 生成临时密码 → 管理员抄录告知

**云函数**：`adminUserManage`

```javascript
// action 枚举：
// - list:    列表查询（支持筛选分页）
// - create:  新建用户
// - update:  编辑用户（displayName / role / canLoginPC）
// - disable: 禁用用户
// - enable:  启用用户
// - resetPassword: 重置密码
// - unbindOpenid:  解绑微信
// - bindOpenid:    绑定微信（手动输入 openid，少见场景）

// 入参示例（create）：
{
  "token": "jwt...",
  "action": "create",
  "data": {
    "username": "engineer01",
    "displayName": "张三",
    "role": "Engineer",
    "password": "init123456",
    "canLoginPC": false
  }
}

// 出参：
{ "ok": true, "data": { "userId": "U-xxx" } }
```

---

### 4.5 设备管理 `/asset`

**列表页** `/asset`：
- 顶部操作栏：`[+ 新建设备]` `[搜索框(名称/编号)]` `[状态筛选]`
- 表格：

| 列 | 字段 | 说明 |
|----|------|------|
| 设备编号 | assetNo | — |
| 设备名称 | assetName | — |
| 设备类型 | deviceTypeId | 可选 |
| 车间/区域 | workshop | 可选 |
| 状态 | status | active/inactive |
| 部位数 | _locationCount | 动态统计 |
| 操作 | — | 编辑 / 二维码 / 停用 / 管理部位 |

**弹窗：新建/编辑设备**

| 字段 | 类型 | 校验 |
|------|------|------|
| 设备编号 | el-input | 必填，唯一 |
| 设备名称 | el-input | 必填 |
| 设备类型 | el-input / el-select | 可选 |
| 车间/区域 | el-input | 可选 |

**二维码弹窗（QrCodeDialog）**：
- 显示设备二维码（内容 = assetId）
- 按钮：`下载PNG` / `打印`
- 使用 `qrcode` 库在前端生成 Canvas → 导出图片

**云函数**：`adminAssetManage`

```javascript
// action 枚举：
// - list:      设备列表（含 locationCount 聚合）
// - create:    新建设备（自动生成 assetId: "ZB-" + 序号）
// - update:    编辑设备基础信息
// - activate:  启用
// - deactivate: 停用

// 入参示例（create）：
{
  "token": "jwt...",
  "action": "create",
  "data": {
    "assetNo": "ZB-001",
    "assetName": "1号注塑机",
    "deviceTypeId": "injection",
    "workshop": "A车间"
  }
}
```

---

### 4.6 设备详情 `/asset/:assetId`

**三栏 Tab 布局**：

#### Tab 1：部位管理

| 元素 | 说明 |
|------|------|
| 部位列表（el-table） | locationName / sortOrder / active |
| [+ 新增部位] | 行内编辑或弹窗 |
| [↕ 拖拽排序] | 可选，adjustSortOrder |
| [📋 从其他设备复制] | 弹窗选择源设备 → 复制全部部位 |
| 操作 | 编辑 / 删除（软删 active=false） |

**云函数**：`adminLocationManage`

```javascript
// action 枚举：
// - list:   列出设备部位
// - upsert: 新增或编辑部位
// - delete: 软删除（active=false）
// - copy:   从源设备复制部位到目标设备
// - reorder: 批量更新 sortOrder

// 入参示例（copy）：
{
  "token": "jwt...",
  "action": "copy",
  "data": {
    "sourceAssetId": "ZB-001",
    "targetAssetId": "ZB-002"
  }
}
```

#### Tab 2：部位→配件映射

| 元素 | 说明 |
|------|------|
| 左侧：部位列表（点选） | 选中某部位 |
| 右侧：已映射配件列表 | partName / partCode / unit |
| [+ 添加配件] | 弹窗：从配件字典多选 |
| [📋 从其他设备复制] | 复制映射关系 |
| 操作 | 移除映射 |

**云函数**：`adminMapManage`

```javascript
// action 枚举：
// - list:   某设备某部位的映射列表
// - add:    添加映射（支持批量 partSkuId[]）
// - remove: 移除映射
// - copy:   从源设备复制映射到目标设备

// 唯一约束校验：(assetId, locationId, partSkuId) 唯一
```

#### Tab 3：阈值配置（该设备）

| 元素 | 说明 |
|------|------|
| 表格 | partName / partCode / thresholdMonthly / active |
| 行内编辑 | 直接修改阈值数字 |
| [批量设置] | 选中多个 SKU → 统一设阈值 |

---

### 4.7 配件字典 `/part`

**列表页**：
- 顶部操作栏：`[+ 新增配件]` `[📥 Excel 导入]` `[搜索框]` `[状态筛选]`
- 表格：

| 列 | 字段 | 说明 |
|----|------|------|
| 配件编码 | partCode | — |
| 配件名称 | partName | — |
| 规格型号 | specModel | 可选 |
| 单位 | unit | — |
| 来源 | source | ERP / Excel / manual |
| 状态 | active | 启用/停用 |
| 操作 | — | 编辑 / 停用 |

**Excel 导入流程（ExcelImporter 组件）**：

```
[选择 Excel 文件] 
    → 前端 SheetJS 解析 
    → 预览表格（显示行数 / 新增 / 更新 / 错误行）
    → 确认导入
    → 调用 adminPartManage(action: 'importCommit')
    → 显示结果（成功 N 条 / 失败 N 条）
```

**导入校验规则**（前端预检 + 云函数二次校验）：

| 校验项 | 错误提示 |
|--------|----------|
| partSkuId 缺失 | 第N行：配件ID不能为空 |
| partName 缺失 | 第N行：配件名称不能为空 |
| partCode 缺失 | 第N行：配件编码不能为空 |
| unit 缺失 | 第N行：单位不能为空 |
| partCode 重复（同批次内） | 第N行：配件编码与第M行重复 |
| partCode 重复（与数据库中其他 SKU） | 第N行：配件编码已存在（归属其他SKU） |

**Excel 模板格式**：

| partSkuId | partName | partCode | unit | specModel | active |
|-----------|----------|----------|------|-----------|--------|
| SKU-001 | 轴承 | BRG-6205 | 个 | 6205-2RS | true |

**云函数**：`adminPartManage`

```javascript
// action 枚举：
// - list:          配件列表（分页 + 筛选）
// - create:        新增单个配件
// - update:        编辑配件
// - setStatus:     启用/停用
// - importPreview: 预检导入数据（返回校验结果，不写入）
// - importCommit:  确认导入（upsert by partSkuId）
// - downloadTemplate: 返回模板字段定义（前端生成下载）
```

---

### 4.8 阈值配置 `/threshold`

**页面结构**：
- 左侧：设备选择器（el-select 可搜索）
- 右侧：该设备所有已映射 SKU + 阈值表格

| 列 | 字段 | 说明 |
|----|------|------|
| 配件名称 | partName | — |
| 配件编码 | partCode | — |
| 月度阈值 | thresholdMonthly | **行内编辑**，正整数 |
| 本月已用 | _currentMonthQty | 从 monthly_part_usage 读取 |
| 状态 | active | 启用/停用阈值 |

**操作**：
- `[保存修改]`：批量 upsert
- `[批量设置]`：选中多行 → 弹窗输入统一阈值 → 批量应用

**云函数**：`adminThresholdManage`

```javascript
// action 枚举：
// - get:         获取某设备所有阈值（联查 parts 名称 + monthly_part_usage 本月用量）
// - upsert:      单个设置
// - batchUpsert: 批量设置
// - deactivate:  停用某阈值
```

---

### 4.9 更换记录 `/record`

**页面元素**：
- 筛选栏：`月份(必选)` `设备(可选)` `人员(可选)` `更换类型(可选)`
- 表格：

| 列 | 字段 | 说明 |
|----|------|------|
| 日期 | ts | 格式化到 YYYY-MM-DD HH:mm |
| 设备 | assetNameSnapshot + assetNoSnapshot | — |
| 部位 | locationNameSnapshot | — |
| 类型 | type | 维修/预防/紧急 Tag |
| 配件数 | items.length | — |
| 总数量 | Σ items[].qty | — |
| 填报人 | reporterNameSnapshot | — |
| 操作 | — | 查看详情 |

**详情弹窗**：
- 基础信息
- items 配件列表（partName / partCode / qty）
- 备注
- 图片预览（el-image 可放大）

**复用已有云函数**：`listReplacementLogs`（无需新建，但需确保 PC 端有权调用）

---

### 4.10 报警管理 `/alert`

**页面元素**：
- Tab 切换：`OPEN` / `ACK` / `全部`
- 筛选栏：`月份` `设备`
- 表格：

| 列 | 字段 | 说明 |
|----|------|------|
| 状态 | status | OPEN=红 / ACK=绿 |
| 设备 | assetId → 联查 assetName | — |
| 配件 | partSkuId → 联查 partName | — |
| 月份 | yearMonth | — |
| 阈值 | thresholdValue | — |
| 当前用量 | currentQty | 红色高亮（超阈值） |
| 确认人 | ackByUserId | 仅 ACK |
| 确认时间 | ackTs | 仅 ACK |
| 操作 | — | 确认(OPEN) / 查看详情 |

**确认弹窗（ACK）**：
- 显示报警详情
- textarea：确认说明（必填）
- 按钮：确认

**复用已有云函数**：`listAlerts` + `ackAlert`

---

## 5. Admin 云函数完整规格

### 5.0 统一约定

**入参格式**：
```json
{
  "token": "jwt-string",
  "action": "list|create|update|...",
  "data": { ... }
}
```

**出参格式**（与小程序云函数一致）：
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "code": "...", "message": "..." } }
```

**统一错误码**：

| 错误码 | 含义 |
|--------|------|
| AUTH_REQUIRED | 未提供 token |
| TOKEN_EXPIRED | token 过期 |
| PERMISSION_DENIED | 角色无权限 |
| VALIDATION_FAILED | 参数校验失败 |
| NOT_FOUND | 资源不存在 |
| DUPLICATE | 唯一约束冲突 |
| SERVER_ERROR | 服务端异常 |

---

### 5.1 `adminLogin`

| 项目 | 说明 |
|------|------|
| 权限 | 无需 token（登录入口） |
| 入参 | `{ username, password }` |
| 逻辑 | 1) 查 users(username, canLoginPC=true) → 2) bcrypt.compare → 3) 生成 JWT(userId/role/exp=24h) → 4) 更新 lastLoginAt |
| 出参 | `{ token, user: { userId, displayName, role } }` |
| 错误码 | LOGIN_FAILED / USER_DISABLED / PC_LOGIN_DENIED |

**依赖**：`bcryptjs`、`jsonwebtoken`

---

### 5.2 `adminUserManage`

| Action | 入参 data | 权限 | 逻辑要点 |
|--------|-----------|------|----------|
| list | { keyword?, role?, status?, page, pageSize } | Admin | 模糊搜索 username/displayName |
| create | { username, displayName, role, password, canLoginPC } | Admin | username 唯一；password → bcrypt hash |
| update | { userId, displayName?, role?, canLoginPC? } | Admin | 不可修改 username |
| disable | { userId } | Admin | 不可禁用自己 |
| enable | { userId } | Admin | — |
| resetPassword | { userId, newPassword } | Admin | bcrypt hash 覆盖 |
| unbindOpenid | { userId } | Admin | openid 置 null |
| bindOpenid | { userId, openid } | Admin | 校验 openid 未被其他用户占用 |

---

### 5.3 `adminAssetManage`

| Action | 入参 data | 权限 | 逻辑要点 |
|--------|-----------|------|----------|
| list | { keyword?, status?, page, pageSize } | Admin | 联查 locationCount |
| create | { assetNo, assetName, deviceTypeId?, workshop? } | Admin | assetNo 唯一；自动生成 assetId |
| update | { assetId, assetName?, assetNo?, deviceTypeId?, workshop? } | Admin | assetNo 唯一校验 |
| activate | { assetId } | Admin | status → active |
| deactivate | { assetId } | Admin | status → inactive |

---

### 5.4 `adminLocationManage`

| Action | 入参 data | 权限 | 逻辑要点 |
|--------|-----------|------|----------|
| list | { assetId } | Admin | 含 active=false 的也返回（标记显示） |
| upsert | { assetId, locationId?, locationName, sortOrder } | Admin | 无 locationId → 新建；有 → 更新 |
| delete | { locationId } | Admin | 软删除 active=false |
| copy | { sourceAssetId, targetAssetId } | Admin | 复制源设备所有 active 部位到目标 |
| reorder | { assetId, orders: [{locationId, sortOrder}] } | Admin | 批量更新排序 |

---

### 5.5 `adminPartManage`

| Action | 入参 data | 权限 | 逻辑要点 |
|--------|-----------|------|----------|
| list | { keyword?, active?, source?, page, pageSize } | Admin | 模糊搜索 partName/partCode |
| create | { partSkuId?, partName, partCode, unit, specModel?, active } | Admin | partCode 唯一；partSkuId 可自动生成 |
| update | { partSkuId, partName?, partCode?, unit?, specModel?, active? } | Admin | partCode 唯一校验 |
| setStatus | { partSkuId, active } | Admin | — |
| importPreview | { rows: [...] } | Admin | 校验所有行，返回 { valid[], errors[] }，不写入 |
| importCommit | { rows: [...] } | Admin | 再次校验 + upsert by partSkuId |

---

### 5.6 `adminMapManage`

| Action | 入参 data | 权限 | 逻辑要点 |
|--------|-----------|------|----------|
| list | { assetId, locationId? } | Admin | 联查 parts 信息 |
| add | { assetId, locationId, partSkuIds: [] } | Admin | 唯一约束(assetId, locationId, partSkuId) |
| remove | { mapId } | Admin | 硬删除或 active=false |
| copy | { sourceAssetId, targetAssetId } | Admin | 复制全部映射 |

---

### 5.7 `adminThresholdManage`

| Action | 入参 data | 权限 | 逻辑要点 |
|--------|-----------|------|----------|
| get | { assetId } | Supervisor+ | 联查 parts 名称 + monthly_part_usage 本月用量 |
| upsert | { assetId, partSkuId, thresholdMonthly } | Supervisor+ | 唯一(assetId, partSkuId) |
| batchUpsert | { items: [{assetId, partSkuId, thresholdMonthly}] } | Supervisor+ | 循环 upsert |
| deactivate | { assetId, partSkuId } | Supervisor+ | active=false |

---

### 5.8 `adminDashboard`

| Action | 入参 data | 权限 | 逻辑要点 |
|--------|-----------|------|----------|
| summary | { yearMonth } | Supervisor+ | 返回本月所有统计 |

**返回结构**：
```json
{
  "totalLogs": 128,
  "totalParts": 456,
  "openAlerts": 5,
  "topPartsByQty": [
    { "partName": "轴承", "partCode": "BRG-6205", "totalQty": 45 }
  ],
  "topAssetsByLogs": [
    { "assetName": "1号注塑机", "assetNo": "ZB-001", "logCount": 23 }
  ],
  "engineerWorkload": [
    { "displayName": "张三", "logCount": 15 }
  ],
  "dailyTrend": [
    { "date": "2026-02-01", "count": 5 },
    { "date": "2026-02-02", "count": 8 }
  ]
}
```

---

## 6. CloudBase JS-SDK 前端接入

### 6.1 初始化

```javascript
// src/api/cloudbase.js
import cloudbase from '@cloudbase/js-sdk'

const app = cloudbase.init({
  env: 'your-env-id'  // CloudBase 环境 ID
})

// 匿名登录（PC端无微信身份，使用匿名登录调用云函数）
export async function ensureAuth() {
  const auth = app.auth({ persistence: 'local' })
  const loginState = await auth.getLoginState()
  if (!loginState) {
    await auth.anonymousAuthProvider().signIn()
  }
}

// 统一云函数调用封装
export async function callFunction(name, data) {
  await ensureAuth()
  const res = await app.callFunction({ name, data })
  const result = res.result
  if (!result.ok) {
    throw result.error
  }
  return result.data
}
```

### 6.2 API 层调用示例

```javascript
// src/api/user.js
import { callFunction } from './cloudbase'
import { getToken } from '../utils/token'

export function listUsers(params) {
  return callFunction('adminUserManage', {
    token: getToken(),
    action: 'list',
    data: params
  })
}

export function createUser(data) {
  return callFunction('adminUserManage', {
    token: getToken(),
    action: 'create',
    data
  })
}
```

### 6.3 CloudBase 控制台配置要求

| 配置项 | 设置 |
|--------|------|
| 匿名登录 | **开启**（PC 端必须） |
| 安全域名 | 添加 PC 端访问域名 |
| 云函数权限 | admin 系列云函数允许匿名调用（鉴权由 JWT 处理） |
| 数据库安全规则 | 保持现有配置（全部走云函数，不直接读写数据库） |

---

## 7. 开发计划与里程碑

### 7.1 一期开发计划（建议 3-4 周）

| 阶段 | 周期 | 交付内容 |
|------|------|----------|
| **P1：基础框架** | 第1周 | 项目脚手架、登录鉴权、Layout、路由守卫 |
| **P2：核心管理** | 第2周 | 用户管理、设备管理(+部位+映射)、配件字典(+导入) |
| **P3：业务功能** | 第3周 | 阈值配置、更换记录查看、报警管理+ACK |
| **P4：看板与收尾** | 第4周 | 看板统计、联调测试、Bug 修复、部署 |

### 7.2 云函数开发优先级

| 优先级 | 云函数 | 说明 |
|--------|--------|------|
| P0 | adminLogin | 登录是一切的前提 |
| P0 | adminUserManage | 没有用户无法进行其他操作 |
| P1 | adminAssetManage | 设备是核心实体 |
| P1 | adminPartManage | 配件导入是数据准备 |
| P1 | adminLocationManage | 部位管理 |
| P1 | adminMapManage | 映射是小程序表单的前提 |
| P2 | adminThresholdManage | 报警的前提 |
| P2 | adminDashboard | 统计看板 |

---

## 8. 部署方案

### 方案 A：CloudBase 静态网站托管（推荐）

```bash
# 1. 构建
cd pc-admin && npm run build

# 2. 使用 CloudBase CLI 部署
tcb hosting deploy ./dist -e your-env-id

# 3. 访问地址
# https://your-env-id.tcloudbaseapp.com
# 或绑定自定义域名
```

**优点**：与云开发同属一个体系，无跨域问题，部署简单  
**费用**：静态托管费用极低

### 方案 B：独立服务器部署（Nginx）

```nginx
server {
    listen 80;
    server_name admin.kangjie.com;
    
    root /var/www/pc-admin/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;  # SPA 路由
    }
}
```

**适用场景**：已有企业服务器、需要自定义域名

---

## 9. PC 端验收清单

### 9.1 认证与权限
- [ ] 用户名+密码登录成功
- [ ] Token 过期自动跳转登录页
- [ ] Admin 可见所有菜单；Supervisor 不可见用户/设备/配件管理
- [ ] 非允许角色无法访问对应页面（路由守卫 + 云函数双重校验）

### 9.2 用户管理
- [ ] 创建用户、编辑、禁用/启用
- [ ] 重置密码
- [ ] 绑定/解绑微信 openid
- [ ] 不可禁用自己

### 9.3 设备管理
- [ ] 设备 CRUD、启停
- [ ] 二维码生成与下载
- [ ] 部位增删改排序
- [ ] 部位从其他设备复制

### 9.4 配件字典
- [ ] 配件 CRUD
- [ ] Excel 导入：预览 → 校验 → 确认 → 结果
- [ ] partCode 唯一性校验
- [ ] 必填缺失行号提示

### 9.5 映射与阈值
- [ ] 部位→配件映射配置正确
- [ ] 映射从其他设备复制
- [ ] 阈值单个/批量设置
- [ ] 阈值页显示本月已用数量

### 9.6 记录与报警
- [ ] 更换记录按月/设备/人员筛选、分页
- [ ] 记录详情含图片预览
- [ ] 报警列表 OPEN/ACK 分段
- [ ] 主管可在 PC 端确认报警

### 9.7 看板
- [ ] 本月统计数据正确
- [ ] TOP 排名正确
- [ ] OPEN 报警数准确

---

## 10. 安全注意事项

| 项目 | 措施 |
|------|------|
| 密码存储 | bcrypt hash，cost factor ≥ 10 |
| Token | JWT，24h 过期，可配置 |
| 密码传输 | HTTPS 保证传输安全 |
| 权限校验 | 前端路由守卫 + 云函数 token 解析双重校验 |
| passwordHash | 任何查询用户列表的接口不得返回 passwordHash 字段 |
| 日志 | admin 操作建议记录操作日志（二期可加 `admin_logs` 集合） |
| Rate Limit | 登录接口建议限制频率（CloudBase 可配置） |

---
