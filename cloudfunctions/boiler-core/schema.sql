-- ============================================================
-- 康洁锅炉房管理系统 - MySQL 建表脚本
-- 环境: cloud1-0g0grbwt8c230b0d (TDSQL-C Serverless MySQL 8.0)
-- 注意: 表名/列名以代码实际引用为准
-- ============================================================

-- 1. factory
CREATE TABLE IF NOT EXISTS factory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  name VARCHAR(100) NOT NULL COMMENT '工厂/园区名称',
  short_name VARCHAR(20) COMMENT '简称',
  address VARCHAR(255) COMMENT '地址',
  contact_person VARCHAR(50),
  contact_phone VARCHAR(20),
  initial_fuel_stock DECIMAL(10,2) DEFAULT 0.00 COMMENT '初始燃料库存(吨)',
  stock_base_date DATE COMMENT '库存基准日期',
  status TINYINT DEFAULT 1 COMMENT '1=启用 0=停用',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. boiler
CREATE TABLE IF NOT EXISTS boiler (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  factory_id INT NOT NULL,
  name VARCHAR(100) NOT NULL COMMENT '锅炉名称(如6T锅炉)',
  model VARCHAR(100) COMMENT '锅炉型号',
  rated_capacity DECIMAL(10,2) NOT NULL COMMENT '额定蒸发量(吨/小时)',
  fuel_type VARCHAR(50) DEFAULT '生物质',
  sort_order INT DEFAULT 0,
  status TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_factory (factory_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. steam_customer
CREATE TABLE IF NOT EXISTS steam_customer (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  factory_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  contact_person VARCHAR(50),
  contact_phone VARCHAR(20),
  sort_order INT DEFAULT 0,
  status TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_factory (factory_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. app_user
CREATE TABLE IF NOT EXISTS app_user (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  openid VARCHAR(64) NOT NULL,
  nickname VARCHAR(100),
  avatar_url VARCHAR(500),
  phone VARCHAR(20),
  real_name VARCHAR(50),
  role ENUM('admin','viewer','operator') DEFAULT 'operator',
  factory_id INT,
  status TINYINT DEFAULT 1,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_openid (openid),
  INDEX idx_factory (factory_id),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. daily_record (每日运行记录主表)
CREATE TABLE IF NOT EXISTS daily_record (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  factory_id INT NOT NULL,
  record_date DATE NOT NULL,
  total_water DECIMAL(10,2) COMMENT '当日用水量(吨)',
  total_fuel_consumed DECIMAL(10,2) COMMENT '当日燃料消耗(吨)',
  fuel_intake DECIMAL(10,2) COMMENT '当日进柴量(吨)',
  created_by INT COMMENT '录入人ID',
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_factory_date (factory_id, record_date),
  INDEX idx_date (record_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. boiler_data (每台锅炉每日运行数据)
CREATE TABLE IF NOT EXISTS boiler_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  daily_record_id INT NOT NULL COMMENT '关联 daily_record.id',
  boiler_id INT NOT NULL,
  start_time VARCHAR(20) COMMENT '启动时间',
  end_time VARCHAR(20) COMMENT '停止时间',
  running_hours DECIMAL(5,2) COMMENT '运行时长(小时)',
  steam_production DECIMAL(10,2) COMMENT '产汽量(吨)',
  electricity DECIMAL(10,2) COMMENT '用电量(度)',
  steam_pressure DECIMAL(8,2) COMMENT '蒸汽压力(MPa)',
  steam_temperature DECIMAL(8,2) COMMENT '蒸汽温度(℃)',
  exhaust_temperature DECIMAL(8,2) COMMENT '排烟温度(℃)',
  remark VARCHAR(255) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_record (daily_record_id),
  INDEX idx_boiler (boiler_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. customer_steam_data (客户用汽数据)
CREATE TABLE IF NOT EXISTS customer_steam_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  daily_record_id INT NOT NULL COMMENT '关联 daily_record.id',
  customer_id INT NOT NULL,
  steam_usage DECIMAL(10,2) COMMENT '用汽量(吨)',
  remark VARCHAR(255) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_record (daily_record_id),
  INDEX idx_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. price_config (单价配置 - 每行一个工厂一组价格)
CREATE TABLE IF NOT EXISTS price_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  factory_id INT COMMENT 'NULL=全局默认',
  fuel_price DECIMAL(10,4) DEFAULT 0 COMMENT '燃料单价(元/吨)',
  electricity_price DECIMAL(10,4) DEFAULT 0 COMMENT '电价(元/度)',
  water_price DECIMAL(10,4) DEFAULT 0 COMMENT '水价(元/吨)',
  effective_date DATE NOT NULL COMMENT '生效日期',
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_factory (factory_id),
  INDEX idx_effective (effective_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. daily_derived_metrics (每日派生指标，自动计算)
CREATE TABLE IF NOT EXISTS daily_derived_metrics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  daily_record_id INT NOT NULL COMMENT '关联 daily_record.id',
  factory_id INT NOT NULL,
  record_date DATE NOT NULL,
  total_steam_production DECIMAL(10,2),
  total_steam_usage DECIMAL(10,2),
  total_electricity DECIMAL(10,2),
  electricity_per_steam DECIMAL(10,4),
  fuel_per_steam DECIMAL(10,4),
  water_per_steam DECIMAL(10,4),
  steam_loss_rate DECIMAL(5,2),
  fuel_cost DECIMAL(12,2),
  electricity_cost DECIMAL(12,2),
  water_cost DECIMAL(12,2),
  total_cost DECIMAL(12,2),
  cost_per_steam DECIMAL(10,2),
  fuel_stock_estimate DECIMAL(10,2),
  fuel_stock_days DECIMAL(5,1),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_record (daily_record_id),
  INDEX idx_factory_date (factory_id, record_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. alert_rule
CREATE TABLE IF NOT EXISTS alert_rule (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  name VARCHAR(100) NOT NULL,
  metric_key VARCHAR(50) NOT NULL,
  compare_type ENUM('gt','lt','gte','lte','deviation_pct') NOT NULL,
  threshold DECIMAL(10,2) NOT NULL,
  absolute_threshold DECIMAL(10,2),
  severity ENUM('info','warning','critical') DEFAULT 'warning',
  notify_method VARCHAR(50) DEFAULT 'web',
  factory_id INT,
  status TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_metric (metric_key),
  INDEX idx_factory (factory_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. alert_log
CREATE TABLE IF NOT EXISTS alert_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  alert_rule_id INT NOT NULL,
  factory_id INT NOT NULL,
  record_date DATE NOT NULL,
  metric_key VARCHAR(50) NOT NULL,
  metric_value DECIMAL(10,4),
  threshold_value DECIMAL(10,4),
  severity ENUM('info','warning','critical') NOT NULL,
  message TEXT,
  status ENUM('pending','acknowledged','resolved') DEFAULT 'pending',
  resolved_by INT,
  resolved_at DATETIME,
  resolve_note TEXT,
  triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_factory_status (factory_id, status),
  INDEX idx_triggered (triggered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. ai_analysis
CREATE TABLE IF NOT EXISTS ai_analysis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  factory_id INT,
  analysis_type ENUM('daily_report','diagnosis','forecast','weekly_report','monthly_report') NOT NULL,
  analysis_date DATE NOT NULL,
  input_data JSON,
  raw_response TEXT,
  key_findings JSON,
  suggestions JSON,
  risk_level ENUM('low','medium','high','critical'),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_factory_type_date (factory_id, analysis_type, analysis_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. ai_chat_history
CREATE TABLE IF NOT EXISTS ai_chat_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  user_id INT NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. operation_log
CREATE TABLE IF NOT EXISTS operation_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  user_id INT NOT NULL,
  user_name VARCHAR(50),
  action ENUM('create','update','delete') NOT NULL,
  target_table VARCHAR(50) NOT NULL,
  target_id INT NOT NULL,
  before_data JSON,
  after_data JSON,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_target (target_table, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 初始数据
-- ============================================================

-- 插入默认管理员用户（请替换 openid）
-- INSERT INTO app_user (openid, real_name, role, status) VALUES ('YOUR_ADMIN_OPENID', '管理员', 'admin', 1);

-- 插入工厂示例
-- INSERT INTO factory (name, short_name, initial_fuel_stock, stock_base_date) VALUES ('丽江康洁', '丽江', 100, CURDATE());
-- INSERT INTO factory (name, short_name, initial_fuel_stock, stock_base_date) VALUES ('大理康洁', '大理', 80, CURDATE());
