# 康洁工程部小程序 - 项目状态文档

## 项目概述
洗涤厂工程部"设备配件更换记录 + 超阈值报警"微信小程序
- **AppID**: wx3e10fc82cc0af56d
- **框架**: 微信小程序原生 + WeUI
- **后端**: 微信云开发（CloudBase）
- **当前状态**: MVP 前端完成，Mock 数据可运行，云函数骨架就绪

## 目录结构
```
kangjie-engineering/
├── miniprogram/              # 小程序前端
│   ├── pages/
│   │   ├── scan/index        # 扫码入口（Tab 3，中间）
│   │   ├── record/index      # 更换记录列表（Tab 1）
│   │   ├── alerts/index      # 报警列表（Tab 2）
│   │   ├── alerts/detail     # 报警详情 + 已知晓
│   │   ├── dashboard/index   # 看板（Tab 4）
│   │   ├── dashboard/part-detail   # 配件消耗下钻
│   │   ├── dashboard/asset-detail  # 设备更换下钻
│   │   ├── me/index          # 我的（Tab 5）
│   │   ├── asset/detail      # 设备详情
│   │   ├── replace/form      # 更换表单
│   │   └── data-manage/index # 数据管理（主管/管理员）
│   ├── components/
│   │   ├── asset-card/       # 设备信息卡片
│   │   ├── sku-multi-select/ # 配件多选+数量
│   │   ├── image-uploader/   # 图片上传
│   │   └── offline-banner/   # 离线提示横幅
│   └── utils/
│       ├── api.js            # API 抽象层（Mock/云函数切换）
│       ├── mock.js           # 完整 Mock 数据和模拟 API
│       ├── auth.js           # 角色权限管理
│       ├── constants.js      # 常量定义
│       ├── offline-queue.js  # 离线队列
│       └── util.js           # 工具函数
├── cloudfunctions/           # 云函数骨架（9个）
│   ├── getMe/
│   ├── getAssetByQr/
│   ├── getLocationsAndParts/
│   ├── submitReplacementLog/
│   ├── listReplacementLogs/
│   ├── listAlerts/
│   ├── ackAlert/
│   ├── importData/
│   ├── exportData/
│   └── initMockData/
├── pc-admin/                 # PC 管理端（骨架，待开发）
└── project.config.json
```

## 数据库集合（云开发）
| 集合名 | 用途 |
|--------|------|
| assets | 设备台账 |
| parts | 配件字典（SKU） |
| locations | 部位/工位 |
| asset_location_parts | 设备→部位→配件映射 |
| replacement_logs | 更换记录 |
| monthly_part_usage | 月度用量统计 |
| alerts | 超阈值报警 |
| threshold_configs | 阈值配置 |
| users | 用户/角色 |

## 角色体系
| 角色 | 权限 |
|------|------|
| Engineer | 扫码、提交更换记录、查看 |
| Viewer | 只读查看 |
| Supervisor | 查看 + 已知晓报警 + 数据管理 |
| Admin | 全部权限（PC端配置阈值等） |

## 核心业务流程
1. 扫设备二维码（含 assetId）→ 设备详情
2. 点击"更换登记" → 选部位 → 多选配件+数量 → 拍照 → 提交
3. 提交写入 replacement_logs → 更新 monthly_part_usage → 检查阈值 → 超阈值生成 alert
4. 报警列表 → 点击查看详情 → 点"已知晓"确认
5. 看板展示 TOP10 配件消耗/设备更换，可下钻查看明细

## 关键设计决策
- **clientOfflineId 幂等**: 每次提交生成 UUID，防重复
- **快照字段**: 云函数写入时用服务端查询的最新名称（assetNameSnapshot 等），不信任客户端
- **Mock 抽象层**: `api.js` 统一封装，`USE_MOCK` 一键切换
- **月/年导出**: 数据管理支持按月或按年导出 CSV

## ⚠️ 上线前必做清单
- [ ] 配置真实云环境 ID（替换 `app.js` 中的 `YOUR_CLOUD_ENV_ID`）
- [ ] `api.js` 中 `USE_MOCK` 改为 `false`
- [ ] 部署所有云函数
- [ ] 初始化数据库集合和索引
- [ ] 导入真实设备/配件/阈值数据
- [ ] 配置真实用户角色
- [ ] 删除扫码页的开发模式快速跳转按钮
- [ ] 删除"我的"页面的角色切换器

## PC 管理端待开发功能
参见规格文档: `kangjie_engineering_specs_v1/02_cloudbase_backend_pcadmin_spec.md`
主要功能:
- 设备台账管理（增删改查）
- 配件字典管理
- 部位-配件映射管理
- 阈值配置管理
- 更换记录查看/导出
- 报警记录管理
- 用户角色管理
- 数据看板（更丰富的图表）
