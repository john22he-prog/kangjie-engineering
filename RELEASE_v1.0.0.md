# 康洁工程部小程序 - 正式版 v1.0.0 发布记录

## 版本信息

| 项目 | 说明 |
|------|------|
| **版本号** | v1.0.0 |
| **发布日期** | 2026-02-13 |
| **类型** | 首次正式上线（MVP） |
| **AppID** | wx3e10fc82cc0af56d |

## 本版本功能范围

- **扫码录入**：扫描设备二维码 → 设备详情 → 更换登记（部位、配件、数量、拍照）
- **更换记录**：列表查看、按月份/设备/人员筛选
- **报警列表**：超阈值报警、已知晓确认（主管及以上）
- **看板**：本月更换总览、配件/设备 TOP、工程人员工作量、报警设备分布、下钻明细
- **数据管理**：主管/管理员 — 导入（配件/阈值/记录）、导出（月/年）
- **我的**：当前工厂、AI 分析报告（主管及以上）、关于

## 技术栈

- 微信小程序原生 + WeUI
- 微信云开发（CloudBase）：云函数 + 云数据库 + 云存储
- 云函数：getMe, getAssetByQr, getLocationsAndParts, submitReplacementLog, listReplacementLogs, listAlerts, ackAlert, getDashboard, getPartUsageDetail, getAssetUsageDetail, getAssetAlerts, exportData, importData, initMockData 等

## 上线前已做修改（本发布保留）

1. **关闭 Mock**：`miniprogram/utils/api.js` 中 `USE_MOCK = false`
2. **关闭开发模式**：`pages/scan/index.js`、`pages/me/index.js` 中 `IS_DEV = false`（隐藏扫码页快速跳转、我的页角色切换）
3. **数据管理与 api 一致**：`pages/data-manage/index.js` 中 `USE_MOCK = false`
4. **云环境**：需在 `app.js` 中配置真实 `env`（YOUR_CLOUD_ENV_ID → 实际环境 ID）

## 数据库集合（云开发）

- assets, asset_locations, parts, location_part_map, asset_part_thresholds
- replacement_logs, monthly_part_usage, alerts
- users

## 备注

- initMockData 云函数仅用于开发阶段灌入种子数据；正式环境若曾跑过，可先清空测试数据再导入真实基础数据。
- 本记录用于版本追溯，后续迭代可新建 RELEASE_v1.1.0.md 等。
