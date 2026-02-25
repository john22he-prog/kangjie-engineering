# 小程序端开发规格（WeUI｜扫码居中｜v1.0）

**项目**：康洁工程部小程序（设备配件更换记录与报警）  
**版本**：v1.0（MVP 一期可上线）  
**日期**：2026-02-10  
**UI**：WeUI 风格；Tabbar 5 个（扫码录入在中间）  
**后端**：微信云开发（云函数 + 数据库 + 存储）  
**写入原则**：所有写入走云函数校验与幂等；前端禁用不等于安全

---

## 1. 一期目标与边界

### 1.1 一期必须交付
1) 扫码设备二维码（仅返回 `assetId`）→ 设备详情  
2) 更换表单：**固定区不可编辑** + 部位选择 + **多选SKU并逐个填数量** + 备注 + **强制至少1张照片**  
3) 提交：在线提交云函数；失败写入离线队列并提示“已保存待同步”  
4) 记录列表：按月/设备/人员筛选（人员筛选对普通工程可隐藏）  
5) 报警：超阈值报警（OPEN/ACK）列表与详情  
6) 主管 ACK：可确认报警并填写说明  
7) 看板：固定模块（4–6块），一期可 mock 占位  
8) 离线队列：显示未同步 N 条 + 一键同步 + 幂等不重复写入

### 1.2 一期不做
- 小程序端阈值配置（只在 PC 管理后台）
- 完全自定义报表/BI
- 异常工单（可二期）
- LLM 分析（可二期）

---

## 2. Tabbar（扫码居中）

**5 个 Tab：**
1. 记录 Record
2. 报警 Alerts
3. 扫码录入 Scan（中间）
4. 看板 Dashboard
5. 我的 Me

> 一期使用原生 tabbar（稳定优先）。二期可选自定义 tabbar 做中间凸起按钮。

---

## 3. WeUI 风格规范（统一执行）

### 3.1 组件使用原则
- 列表：WeUI `cells/cell`（可用外层容器做卡片）
- 表单：WeUI `form` + `picker` + `textarea` + `uploader`
- 反馈：WeUI `toast` / `dialog` / `topTips`
- 交互：尽量减少层级（工程现场“少点几下”最重要）

### 3.2 状态与可用性
- **按钮态**：disabled / loading / normal 三态必须齐全
- **必填项**：就地提示 + 顶部 topTips（可选）
- **成功**：toast 1.5s → 返回设备详情页并刷新最近记录
- **失败**：
  - 提交失败：toast“已保存待同步”
  - 上传失败：显示失败原因 + 重试

### 3.3 文案风格（建议统一）
- 短句 + 可操作：例如“提交失败，已保存待同步（到【我的】可同步）”
- 避免空话：不要“网络错误请稍后再试”，要告诉下一步

---

## 4. 公共组件（components）

> 页面只负责拼装与调用；通用逻辑下沉组件，利于二期升级。

### 4.1 `asset-card` 设备卡片
**Props**
- `asset`: { assetId, assetName, assetNo, workshop?, status? }
- `clickable`: bool

**展示**
- 标题：assetName
- 副标题：编号 assetNo（可加 assetId）
- 可选：车间/区域
- 状态：active/inactive tag（可选）

**交互**
- clickable=true 时点击触发 `tap` 事件

**空态**
- asset 为空：显示“未选择设备”

---

### 4.2 `offline-banner` 离线队列提示条
**Props**
- `count`: number
- `syncing`: bool

**展示**
- `未同步 {count} 条` + 按钮 `立即同步`（syncing 时 loading）

**事件**
- `sync`：点击同步

**显示规则**
- count>0 显示；否则隐藏

---

### 4.3 `sku-multi-select`（多选SKU + 数量输入）
**Props**
- `availableSkus[]`: { partSkuId, partName, partCode, unit }
- `value[]`: { partSkuId, qty }
- `readonly`: bool

**内部行为**
1) SKU 选择：多选（弹窗/底部抽屉均可）
2) 每个 SKU 显示：`partName` + `partCode`（锁定不可改）
3) 数量输入：Stepper（+/-）+ 数字输入；必须为正整数

**事件**
- `change(value[])`

**校验输出（供页面使用）**
- `isValid`: bool
- `errors[]`: string

---

### 4.4 `image-uploader`（强制至少1张）
**Props**
- `minCount`: number（默认 1）
- `maxCount`: number（建议 6 或 9）
- `value[]`: string（fileId）
- `readonly`: bool

**行为**
- 选择图片 → 上传 → 回填 fileId
- 支持重试失败项
- 支持删除

**事件**
- `change(value[])`

**校验**
- `value.length >= minCount`

---

## 5. 页面规格（逐页：组件/字段/状态/交互/错误文案）

### 5.1 `pages/scan/index` 扫码主页
**目标**：扫码进入设备；显示最近设备；显示未同步提示  
**组件**
- `offline-banner`
- 主按钮：`扫码录入`
- `asset-card`（最近一次设备，点击进入详情）

**data 状态**
- `lastAsset`（null 或 asset）
- `offlineCount`
- `syncing`

**交互**
1) 点击“扫码录入”
   - 调 `wx.scanCode` 得 `assetId`
   - 调 `api.getAssetByQr(assetId)` 成功 → `navigateTo(asset/detail)`
2) 点击最近设备卡片 → 进入设备详情
3) 点击“立即同步” → `offlineQueue.syncAll()`

**错误提示**
- 扫码取消：不提示
- 设备无效：`未找到该设备或设备已停用，请联系管理员`
- 同步失败：`同步失败：{reason}`

---

### 5.2 `pages/asset/detail` 设备详情
**目标**：设备信息 + 快速入口 + 最近记录  
**组件**
- `asset-card`
- 按钮：`更换配件`（Engineer 才显示）
- 最近记录列表（cells）
- 可选：`offline-banner`

**data**
- `asset`
- `recentLogs[]`
- `canWrite`（role==Engineer）
- `offlineCount`

**交互**
- 点击“更换配件” → `navigateTo(replace/form?assetId=...)`
- 点击记录项 → 打开记录详情（一期可 dialog 展示）

**空态**
- recentLogs 为空：`暂无更换记录`

**错误提示**
- 设备停用：`设备已停用，无法录入`

---

### 5.3 `pages/replace/form` 更换表单（核心）
**目标**：最短路径完成录入，强校验，支持离线队列  
**组件**
- 固定区 cells（readonly）
- picker：更换类型（必选）
- picker：部位（必选）
- `sku-multi-select`
- textarea：备注（可选）
- `image-uploader`（minCount=1）
- 提交按钮（primary）

**data**
- 固定区：
  - `assetId, assetName, assetNo`
  - `reporterName`
  - `displayDate`（到天）
- 可填区：
  - `type`
  - `locationId`
  - `locations[]`
  - `availableSkus[]`
  - `selectedSkus[]`（[{partSkuId, qty}]）
  - `remark`
  - `images[]`
- 控制：
  - `submitting`
  - `offlineCount`

**页面加载**
- 通过 assetId 拉设备信息与部位列表
- 默认不加载映射 SKU，直到选择部位后再拉（或一次性拉取 map）

**交互**
1) 选择类型（必选）
2) 选择部位（必选）
   - 调 `api.getLocationsAndParts(assetId)` 或增量接口，取该部位可用 SKU
   - 若该部位无可选 SKU → dialog：`该部位未配置可用配件，请联系管理员`
3) 多选 SKU → 对每项填数量（正整数）
4) 上传图片（至少1张）
5) 点击提交：
   - 生成 `clientOfflineId`
   - 写入离线队列（PENDING）
   - 在线调用 `submitReplacementLog`
   - 成功：移除离线队列项 → toast `提交成功（本月累计已更新）` → 返回设备详情并刷新
   - 失败：保留队列 → toast `提交失败，已保存待同步`

**校验与错误文案（统一）**
- type 空：`请选择更换类型`
- location 空：`请选择部位`
- SKU 未选：`请选择至少 1 个配件`
- qty 非正整数：`数量必须为正整数`
- images<1：`至少上传 1 张照片`

**提交按钮禁用规则**
- 任一必填不满足 → disabled
- uploading/submitting → disabled + loading

---

### 5.4 `pages/record/index` 记录列表
**目标**：按月查看、筛选查询、查看详情  
**组件**
- 筛选 cells：
  - 月份 yearMonth（必选，默认本月）
  - 设备 asset（可选）
  - 人员 user（可选：Supervisor/Admin 才显示）
- 列表 cells（卡片风格）：显示摘要
- 分页加载（下拉刷新/上拉加载）

**data**
- `filters`: { yearMonth, assetId?, userId? }
- `list[]`
- `loading`
- `offlineCount`

**列表项建议字段**
- 日期（到天）
- 设备名/编号
- 部位
- 配件数（items.length）+ 总数量（sum qty）
- 填报人

**交互**
- 改筛选 → reload
- 点某项 → 详情弹窗/详情页（显示 items、备注、图片）

**空态**
- `暂无记录`

---

### 5.5 `pages/alerts/index` 报警列表
**目标**：OPEN/ACK 分段；默认本月  
**组件**
- 分段（OPEN/ACK）
- 月份选择（可选）
- 列表 cells

**data**
- `tabStatus`: "OPEN"|"ACK"
- `yearMonth`（默认本月）
- `list[]`
- `loading`

**列表项展示**
- 设备（name/no）
- 配件（name/code）
- 月份
- 当前累计/阈值
- 状态 tag（OPEN 红/ACK 灰）

**空态**
- `本月暂无超阈值报警`

---

### 5.6 `pages/alerts/detail` 报警详情 + ACK
**目标**：主管确认闭环  
**组件**
- 基本信息 cells
- 若 OPEN 且 role=Supervisor/Admin：
  - textarea：确认说明（必填）
  - 按钮：确认（ACK）

**data**
- `alert`
- `ackNote`
- `submitting`

**校验**
- ackNote 为空：`请填写确认说明`

**成功提示**
- toast `已确认`

---

### 5.7 `pages/dashboard/index` 看板
**一期固定模块（4–6块）**
- 配件消耗 TOP（本月）
- 设备更换 TOP（本月）
- OPEN 报警列表
- 工程人员工作量（本月提交条数）
- （可选）7天趋势
- （可选）报警设备分布

> 一期允许 mock；二期接聚合云函数。

---

### 5.8 `pages/me/index` 我的
**目标**：角色信息、同步入口、版本信息  
**组件**
- 用户信息 cells：displayName/role
- 离线队列：未同步 N 条 + 同步按钮
- 版本号（写死或读取）

**交互**
- 点击同步：`offlineQueue.syncAll()`

---

## 6. 错误提示文案全集（建议统一常量）

- 请选择更换类型
- 请选择部位
- 请选择至少 1 个配件
- 数量必须为正整数
- 至少上传 1 张照片
- 该部位未配置可用配件，请联系管理员
- 提交失败，已保存待同步
- 同步失败：{reason}
- 未找到该设备或设备已停用，请联系管理员
- 请填写确认说明

---

## 7. 前端验收清单（必须全过）

- [ ] Tabbar 5 个，扫码居中
- [ ] 扫码→设备详情→表单→提交→返回设备详情（最近记录刷新）
- [ ] 部位→SKU映射带出，多选SKU后逐个数量输入
- [ ] 配件编号展示锁定，不可编辑
- [ ] 强制至少1张照片，不满足禁止提交
- [ ] 提交失败自动入离线队列，显示未同步 N 条
- [ ] 一键同步成功队列清零；重复同步不重复写入（clientOfflineId 幂等）
- [ ] 报警 OPEN/ACK 展示正常；主管可ACK并填写说明；工程/只读不可ACK

---
