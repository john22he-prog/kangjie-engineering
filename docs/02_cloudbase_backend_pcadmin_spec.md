# 云开发 / PC端后台开发规格（集合｜云函数｜权限｜幂等｜v1.0）

**项目**：康洁工程部小程序（设备配件更换记录与报警）  
**版本**：v1.0（一期MVP）  
**日期**：2026-02-10  
**后端**：微信云开发（CloudBase：数据库 + 云函数 + 存储）  
**原则**：写入必须云函数；固定区字段服务端重写；以 `clientOfflineId` 幂等去重

---

## 1. 架构与职责

### 1.1 云端组件
- **数据库**：assets / asset_locations / parts / location_part_map / users / replacement_logs / asset_part_thresholds / monthly_part_usage / alerts
- **云函数**：鉴权、校验、写入、汇总更新、报警生成、查询
- **存储**：图片（fileId）

### 1.2 一期闭环（后端）
1) `submitReplacementLog`：写事实表 replacement_logs（幂等）  
2) 更新 `monthly_part_usage`（自然月累计）  
3) 检查 `asset_part_thresholds`，超出阈值生成 `alerts(OPEN)`（每月每设备+SKU只生成一次）  
4) `ackAlert`：Supervisor/Admin 确认报警并写说明

---

## 2. 数据库集合（Schema / 索引 / 约束）

> CloudBase 为文档库：建议在云函数实现 schema 校验（必填/类型/范围/白名单字段）。  
> 时间统一使用 `serverTs=Date.now()`。

### 2.1 `assets`（设备档案）
字段：
- assetId (PK, string)
- assetName (string)
- assetNo (string)
- deviceTypeId (string, optional)
- workshop/area (string, optional)
- status ("active"|"inactive")
- createdAt (number)
- updatedAt (number)

索引：
- assetNo
- deviceTypeId
- status

---

### 2.2 `asset_locations`（设备部位：每台设备自定义）
字段：
- locationId (PK, string)
- assetId (string)
- locationName (string)
- sortOrder (number)
- active (bool)
- updatedAt (number)

索引：
- assetId
- assetId+active
- assetId+sortOrder

---

### 2.3 `parts`（配件SKU字典）
字段：
- partSkuId (PK, string)
- partName (string)
- partCode (string)
- unit (string)
- specModel (string, optional)
- active (bool)
- source ("ERP"|"Excel"|"manual")
- updatedAt (number)

索引：
- partCode
- active

---

### 2.4 `location_part_map`（部位→配件映射）
字段：
- mapId (PK, string)
- assetId (string)
- locationId (string)
- partSkuId (string)
- active (bool)

索引：
- assetId+locationId+active
- assetId+active

逻辑唯一约束（云函数保证）：
- (assetId, locationId, partSkuId) 唯一

---

### 2.5 `users`（账号、角色与微信绑定）
字段：
- userId (PK, string)
- username (string)
- displayName (string)
- role ("Engineer"|"Viewer"|"Supervisor"|"Admin")
- status ("active"|"disabled")
- openid (string, nullable, 可换绑)
- updatedAt (number)

索引：
- username
- openid
- role+status

---

### 2.6 `replacement_logs`（事实表：更换记录，默认不可改）
字段：
- logId (PK, string)
- assetId (string)
- assetNameSnapshot (string)
- assetNoSnapshot (string)
- reporterUserIdSnapshot (string)
- reporterNameSnapshot (string)
- ts (number, ms)
- yearMonth (string, "YYYY-MM")
- type ("维修"|"预防"|"紧急")
- locationIdSnapshot (string)
- locationNameSnapshot (string)
- items (array of { partSkuId, partNameSnapshot, partCodeSnapshot, qty })
- remark (string, optional)
- images (string[] fileId)
- clientOfflineId (string, uuid)
- createdAt (number)

索引：
- clientOfflineId（强烈建议建立索引；用于幂等查找）
- assetId+yearMonth+ts
- reporterUserIdSnapshot+yearMonth+ts

约束：
- 不提供 update/delete；纠错使用“补充说明/更正记录”新插入（二期可做）

---

### 2.7 `asset_part_thresholds`（阈值：每设备+SKU）
字段：
- assetId (string)
- partSkuId (string)
- thresholdMonthly (number)
- active (bool)
- updatedAt (number)

索引：
- assetId+active
- partSkuId

逻辑唯一：
- (assetId, partSkuId) 唯一

---

### 2.8 `monthly_part_usage`（月度汇总）
字段：
- assetId
- partSkuId
- yearMonth
- qtySum
- lastUpdatedAt

索引：
- assetId+yearMonth
- assetId+partSkuId+yearMonth（逻辑唯一）

---

### 2.9 `alerts`（超阈值报警）
字段：
- alertId (PK)
- assetId
- partSkuId
- yearMonth
- thresholdValue
- currentQty
- status ("OPEN"|"ACK"|"CLOSED")
- ackByUserId (nullable)
- ackTs (nullable)
- ackNote (nullable, ACK 必填)
- createdAt

索引：
- status+createdAt
- yearMonth+status
- assetId+yearMonth

报警规则（一 期）：
- 当 qtySum > thresholdMonthly：
  - 若 (assetId, partSkuId, yearMonth) 本月不存在任何 alert → 生成 OPEN
  - 否则不重复生成（防刷）

---

## 3. 云函数 API 规格（入参/出参/权限/错误码）

### 3.0 统一返回结构
成功：
```json
{"ok": true, "data": {}}
```
失败：
```json
{"ok": false, "error": {"code":"...", "message":"..."}}
```

---

### 3.1 `getMe`
权限：任意绑定用户  
入参：空  
输出：userId/displayName/role/status  
错误码：
- AUTH_NOT_BOUND：openid 未绑定
- USER_DISABLED：账号禁用

---

### 3.2 `getAssetByQr`
权限：Viewer+  
入参：{{ "assetId": "ZB-001" }}  
输出：
- asset（基础信息）
- locations（active 部位）
- recentLogs（最近 10 条摘要）

错误码：
- ASSET_NOT_FOUND
- ASSET_INACTIVE

---

### 3.3 `getLocationsAndParts`
权限：Viewer+  
入参：{{ "assetId": "ZB-001" }}  
输出：
- locations[]
- map：{ locationId: parts[] }

错误码：
- ASSET_NOT_FOUND

---

### 3.4 `submitReplacementLog`（核心：写入+汇总+报警）
权限：Engineer（可写）  
入参：
```json
{
  "assetId": "ZB-001",
  "type": "维修",
  "locationId": "loc_xxx",
  "selectedPartSkuIds": ["sku1","sku2"],
  "qtyMap": {"sku1": 3, "sku2": 1},
  "remark": "备注文本",
  "images": ["cloud://fileid1"],
  "clientOfflineId": "uuid"
}
```

#### 3.4.1 校验（必须）
1) 当前用户 role=Engineer 且 status=active  
2) assets 存在且 active  
3) asset_locations(locationId) 存在且属于该 assetId 且 active  
4) 映射校验：selectedPartSkuIds 全部在 location_part_map(assetId, locationId, active=true)  
5) qtyMap 对所有 selected sku 必须存在 qty，且 qty 为正整数  
6) images.length >= 1  
7) clientOfflineId 必填  

#### 3.4.2 幂等（必须）
- 用 clientOfflineId 查询 replacement_logs：
  - 若已存在 → 直接返回同一结果（不得重复写入）

#### 3.4.3 服务端重写（不可相信客户端）
- ts/serverTs  
- yearMonth（由 serverTs 计算）  
- assetNameSnapshot/assetNoSnapshot（从 assets）  
- reporterUserIdSnapshot/reporterNameSnapshot（从 users）  
- locationNameSnapshot（从 asset_locations）  
- items 快照（从 parts：partName/partCode）  

#### 3.4.4 更新步骤（建议顺序）
1) 幂等检查（clientOfflineId）  
2) 写 replacement_logs  
3) 对每个 SKU upsert 更新 monthly_part_usage：qtySum += qty  
4) 对每个 SKU 查阈值：
   - 存在 active 阈值：qtySum > thresholdMonthly 且本月无 alert → 写 alerts(OPEN)

输出建议：
- logId, yearMonth  
- monthlySums（提交涉及SKU的本月累计与阈值对比）  
- createdAlerts（本次新建的 alertId 列表）  

错误码建议：
- PERMISSION_DENIED
- VALIDATION_FAILED
- MAPPING_INVALID
- UPLOAD_REQUIRED
- SERVER_ERROR

---

### 3.5 `listReplacementLogs`
权限：Viewer+  
入参：{ yearMonth, assetId?, userId?, page, pageSize }  
输出：list + total(可选)  
权限细则建议：
- Engineer/Viewer 默认可看全部工程记录（如需更严格可限制）
- Supervisor/Admin 才允许 userId 筛选

---

### 3.6 `listAlerts`
权限：Viewer+  
入参：{ status?, yearMonth?, assetId?, page, pageSize }  
输出：list  
备注：
- 二期建议在 alerts 冗余 snapshot（assetName/assetNo/partName/partCode）提升性能与简单性

---

### 3.7 `ackAlert`
权限：Supervisor/Admin  
入参：{ alertId, ackNote }  
校验：
- ackNote 非空  
- alert.status 必须为 OPEN  
写入：
- status=ACK  
- ackByUserId=currentUser  
- ackTs=serverTs  
- ackNote=输入  

错误码：
- PERMISSION_DENIED
- VALIDATION_FAILED
- ALERT_NOT_FOUND
- ALERT_NOT_OPEN

---

## 4. 幂等与一致性（必须落到代码）

### 4.1 幂等键
- `clientOfflineId`：提交记录幂等键（uuid）
- replacement_logs 建索引：clientOfflineId

### 4.2 顺序写入策略
- 先写 logs，再更新汇总，再生成报警  
- 若更新汇总/报警失败：
  - 一期：记录云函数日志，必要时人工重算  
  - 二期：新增“重算某月汇总”管理工具/任务队列

---

## 5. PC 端管理后台（最小可用规格）

### 5.1 用户管理
功能：
- 创建/禁用账号
- 设置角色
- 绑定/解绑 openid（离职换人）

建议云函数：
- adminCreateUser
- adminDisableUser
- adminUpdateUserRole
- adminBindOpenid
- adminUnbindOpenid

---

### 5.2 配件字典导入（Excel/ERP）
模板字段：
- partSkuId（必填）
- partName（必填）
- partCode（必填）
- unit（必填）
- specModel（可选）
- active（必填 true/false）

导入规则：
- upsert by partSkuId
- partCode 重复：阻止导入并给出行号
- 必填缺失：阻止导入并给出行号

建议云函数：
- adminImportPartsPreview
- adminImportPartsCommit

---

### 5.3 设备管理
功能：
- 新增/编辑设备（assetId生成、name/no、type、状态）
- 生成二维码（内容=assetId）
- 启用/停用设备

建议云函数：
- adminCreateAsset
- adminUpdateAsset
- adminSetAssetStatus
- adminGenerateQr（可选）

---

### 5.4 部位管理（每台设备自定义 + 模板复制）
功能：
- 维护设备部位（增删改排序）
- 模板复制：
  - 从“设备类型模板”复制（可二期）
  - 或从“某台设备复制到另一台设备”（一期更实用）

建议云函数：
- adminListLocations
- adminUpsertLocation
- adminDeleteLocation
- adminCopyLocations

---

### 5.5 部位→配件映射管理
功能：
- 对设备某部位配置可用 SKU 列表
- 支持复制映射（从设备到设备）

建议云函数：
- adminListLocationPartMap
- adminUpsertLocationPartMap
- adminDeleteLocationPartMap
- adminCopyLocationPartMap

---

### 5.6 阈值配置（只在PC端）
功能：
- 按设备筛选 → 配置每 SKU 阈值
- 批量设置

规则：
- thresholdMonthly 必须为正整数
- 未配置阈值：不报警（推荐）；或默认无限大

建议云函数：
- adminGetThresholds
- adminUpsertThreshold
- adminBatchUpsertThresholds

---

## 6. 数据导出功能（小程序端 → Excel 备份）

### 6.1 功能概述
- **入口**：小程序 → 我的 → 导出Excel数据
- **权限**：仅 Supervisor / Admin 可操作
- **流程**：选择月份 → 云函数生成 Excel → 上传云存储 → 下载打开 → 用户转发/保存
- **目的**：定期数据备份，防止云端数据丢失

### 6.2 云函数 `exportData`
- 权限：Supervisor / Admin
- 入参：`{ yearMonth: "YYYY-MM" }`
- 输出：`{ fileID, tempUrl, fileName, summary }`
- 依赖：`node-xlsx`

### 6.3 Excel 表结构设计（6个 Sheet）

#### Sheet 1：更换记录明细
> 核心业务数据，每个配件一行（一次更换可能有多行）

| 列名 | 来源 | 说明 |
|------|------|------|
| 日期时间 | replacement_logs.ts | 格式 YYYY-MM-DD HH:mm |
| 月份 | replacement_logs.yearMonth | YYYY-MM |
| 设备名称 | assetNameSnapshot | 提交时快照 |
| 设备编号 | assetNoSnapshot | 提交时快照 |
| 部位 | locationNameSnapshot | 提交时快照 |
| 更换类型 | type | 维修/预防/紧急 |
| 配件名称 | items[].partNameSnapshot | 逐项展开 |
| 配件编号 | items[].partCodeSnapshot | 逐项展开 |
| 数量 | items[].qty | 正整数 |
| 填报人 | reporterNameSnapshot | 提交时快照 |
| 备注 | remark | 可为空 |

#### Sheet 2：月度配件汇总
> 按设备+配件的月度累计用量，对比阈值

| 列名 | 来源 | 说明 |
|------|------|------|
| 月份 | monthly_part_usage.yearMonth | YYYY-MM |
| 设备名称 | assets.assetName | 关联查询 |
| 设备编号 | assets.assetNo | 关联查询 |
| 配件名称 | parts.partName | 关联查询 |
| 配件编号 | parts.partCode | 关联查询 |
| 单位 | parts.unit | |
| 累计数量 | monthly_part_usage.qtySum | |
| 月度阈值 | asset_part_thresholds.thresholdMonthly | 未设置显示"未设置" |
| 是否超阈值 | 计算字段 | 是/否/未设阈值 |

#### Sheet 3：报警记录
> 超阈值报警及处理情况

| 列名 | 来源 | 说明 |
|------|------|------|
| 报警时间 | alerts.createdAt | 格式 YYYY-MM-DD HH:mm |
| 月份 | alerts.yearMonth | YYYY-MM |
| 设备名称 | 快照或关联 | |
| 配件名称 | 快照或关联 | |
| 阈值 | alerts.thresholdValue | |
| 当前累计 | alerts.currentQty | |
| 状态 | alerts.status | 待处理/已确认 |
| 确认人 | alerts.ackByUserId | |
| 确认时间 | alerts.ackTs | |
| 确认说明 | alerts.ackNote | |

#### Sheet 4：设备台账
> 全量设备清单（不限月份）

| 列名 | 来源 | 说明 |
|------|------|------|
| 设备ID | assets.assetId | |
| 设备名称 | assets.assetName | |
| 设备编号 | assets.assetNo | |
| 车间/区域 | assets.workshop | |
| 状态 | assets.status | 启用/停用 |
| 创建日期 | assets.createdAt | 格式 YYYY-MM-DD |

#### Sheet 5：配件字典
> 全量配件 SKU 清单（不限月份）

| 列名 | 来源 | 说明 |
|------|------|------|
| 配件SKU ID | parts.partSkuId | |
| 配件名称 | parts.partName | |
| 配件编号 | parts.partCode | |
| 单位 | parts.unit | |
| 规格型号 | parts.specModel | |
| 状态 | parts.active | 启用/停用 |
| 来源 | parts.source | ERP/Excel/manual |

#### Sheet 6：阈值配置
> 当前生效的阈值规则（不限月份）

| 列名 | 来源 | 说明 |
|------|------|------|
| 设备名称 | 关联 assets | |
| 设备编号 | 关联 assets | |
| 配件名称 | 关联 parts | |
| 配件编号 | 关联 parts | |
| 月度阈值 | thresholdMonthly | 正整数 |

### 6.4 使用建议
- 建议每月初导出上月数据（例：2月初导出1月数据）
- 导出后可通过微信"转发给朋友"或"用其他应用打开"保存到电脑
- Excel 文件同时上传到云存储 `exports/` 目录，可通过云控制台直接下载

---

## 7. 后端验收清单（一 期）

- [ ] submitReplacementLog：权限/映射/数量/图片校验齐全；固定区字段服务端重写
- [ ] clientOfflineId 幂等：重复提交不重复写入
- [ ] monthly_part_usage 累计正确（自然月）
- [ ] 超阈值生成 alerts(OPEN)，同月同设备同SKU只生成一次
- [ ] ackAlert 仅主管/管理员可用，必须填说明
- [ ] listLogs/listAlerts 支持分页与筛选
- [ ] PC端：能配置阈值、导入配件、维护部位与映射、管理用户绑定
- [ ] exportData：Supervisor/Admin 可导出指定月份 Excel，包含6个Sheet

---
