const db = require('../db');
const dayjs = require('dayjs');

/**
 * 总览数据：获取指定日期（或最新记录日期）的汇总指标
 */
async function overview(params, user, factoryScope) {
  try {
    let { factoryId, date } = params;

    if (factoryScope) {
      factoryId = factoryScope;
    }

    if (!date) {
      const latest = factoryId
        ? await db.query(
            'SELECT MAX(record_date) AS max_date FROM daily_record WHERE factory_id = ?',
            [factoryId]
          )
        : await db.query('SELECT MAX(record_date) AS max_date FROM daily_record');
      await db.end();

      if (!latest[0] || !latest[0].max_date) {
        return { code: 0, data: null, message: '暂无记录数据' };
      }
      date = dayjs(latest[0].max_date).format('YYYY-MM-DD');
    }

    let records;
    if (factoryId) {
      records = await db.query(
        `SELECT dr.*, ddm.*
         FROM daily_record dr
         LEFT JOIN daily_derived_metrics ddm ON dr.id = ddm.daily_record_id
         WHERE dr.factory_id = ? AND dr.record_date = ?`,
        [factoryId, date]
      );
    } else {
      records = await db.query(
        `SELECT dr.*, ddm.*
         FROM daily_record dr
         LEFT JOIN daily_derived_metrics ddm ON dr.id = ddm.daily_record_id
         WHERE dr.record_date = ?`,
        [date]
      );
    }
    await db.end();

    if (!records || records.length === 0) {
      return { code: 0, data: null, message: '该日期无记录' };
    }

    if (factoryId) {
      return { code: 0, data: { date, factory_id: factoryId, record: records[0] } };
    }

    const aggregated = aggregateRecords(records, date);
    return { code: 0, data: aggregated };
  } catch (err) {
    console.error('[statistics.overview] error:', err);
    return { code: 9999, message: '获取总览数据失败' };
  }
}

/**
 * 趋势数据：获取日期范围内某指标的趋势
 */
async function trend(params, user, factoryScope) {
  try {
    let { factoryId, startDate, endDate, metric } = params;

    if (factoryScope) {
      factoryId = factoryScope;
    }

    if (!startDate || !endDate || !metric) {
      return { code: 4001, message: '缺少必要参数: startDate, endDate, metric' };
    }

    const allowedMetrics = [
      'total_steam_production', 'total_cost', 'total_electricity',
      'steam_loss_rate', 'cost_per_steam', 'fuel_stock_estimate', 'fuel_stock_days'
    ];
    if (!allowedMetrics.includes(metric)) {
      return { code: 4002, message: `不支持的指标: ${metric}` };
    }

    const metricColumnMap = {
      total_steam_production: 'ddm.total_steam_production',
      total_cost: 'ddm.total_cost',
      total_electricity: 'ddm.total_electricity',
      steam_loss_rate: 'ddm.steam_loss_rate',
      cost_per_steam: 'ddm.cost_per_steam',
      fuel_stock_estimate: 'ddm.fuel_stock_estimate',
      fuel_stock_days: 'ddm.fuel_stock_days'
    };
    const col = metricColumnMap[metric];

    let rows;
    if (factoryId) {
      rows = await db.query(
        `SELECT dr.record_date AS date, ${col} AS value
         FROM daily_record dr
         LEFT JOIN daily_derived_metrics ddm ON dr.id = ddm.daily_record_id
         WHERE dr.factory_id = ? AND dr.record_date BETWEEN ? AND ?
         ORDER BY dr.record_date ASC`,
        [factoryId, startDate, endDate]
      );
    } else {
      rows = await db.query(
        `SELECT dr.record_date AS date,
                SUM(${col}) AS value
         FROM daily_record dr
         LEFT JOIN daily_derived_metrics ddm ON dr.id = ddm.daily_record_id
         WHERE dr.record_date BETWEEN ? AND ?
         GROUP BY dr.record_date
         ORDER BY dr.record_date ASC`,
        [startDate, endDate]
      );
    }
    await db.end();

    const data = (rows || []).map(r => ({
      date: dayjs(r.date).format('YYYY-MM-DD'),
      value: r.value !== null && r.value !== undefined ? Number(r.value) : null
    }));

    return { code: 0, data };
  } catch (err) {
    console.error('[statistics.trend] error:', err);
    return { code: 9999, message: '获取趋势数据失败' };
  }
}

/**
 * 工厂对比：对比各工厂的指定指标
 */
async function compare(params, user, factoryScope) {
  try {
    const { date, dateRange, metrics } = params;

    if (factoryScope) {
      return { code: 2001, message: '操作员无权访问工厂对比' };
    }

    if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
      return { code: 4001, message: '缺少必要参数: metrics' };
    }

    const allowedMetrics = [
      'total_steam_production', 'total_cost', 'total_electricity',
      'steam_loss_rate', 'cost_per_steam', 'fuel_stock_estimate', 'fuel_stock_days'
    ];
    const invalidMetrics = metrics.filter(m => !allowedMetrics.includes(m));
    if (invalidMetrics.length > 0) {
      return { code: 4002, message: `不支持的指标: ${invalidMetrics.join(', ')}` };
    }

    const selectCols = metrics
      .map(m => `AVG(ddm.${m}) AS ${m}`)
      .join(', ');

    let rows;
    if (date) {
      rows = await db.query(
        `SELECT dr.factory_id, f.name AS factory_name, ${selectCols}
         FROM daily_record dr
         LEFT JOIN daily_derived_metrics ddm ON dr.id = ddm.daily_record_id
         LEFT JOIN factory f ON dr.factory_id = f.id
         WHERE dr.record_date = ?
         GROUP BY dr.factory_id, f.name`,
        [date]
      );
    } else if (dateRange && dateRange.start && dateRange.end) {
      rows = await db.query(
        `SELECT dr.factory_id, f.name AS factory_name, ${selectCols}
         FROM daily_record dr
         LEFT JOIN daily_derived_metrics ddm ON dr.id = ddm.daily_record_id
         LEFT JOIN factory f ON dr.factory_id = f.id
         WHERE dr.record_date BETWEEN ? AND ?
         GROUP BY dr.factory_id, f.name`,
        [dateRange.start, dateRange.end]
      );
    } else {
      return { code: 4001, message: '缺少必要参数: date 或 dateRange' };
    }
    await db.end();

    const factories = (rows || []).map(row => {
      const metricsData = {};
      metrics.forEach(m => {
        metricsData[m] = row[m] !== null && row[m] !== undefined ? Number(row[m]) : null;
      });
      return {
        id: row.factory_id,
        name: row.factory_name,
        metrics: metricsData
      };
    });

    return { code: 0, data: { factories } };
  } catch (err) {
    console.error('[statistics.compare] error:', err);
    return { code: 9999, message: '获取对比数据失败' };
  }
}

function aggregateRecords(records, date) {
  const agg = {
    date,
    factory_count: records.length,
    total_steam_production: 0,
    total_cost: 0,
    total_electricity: 0,
    steam_loss_rate: null,
    cost_per_steam: null,
    fuel_stock_estimate: 0,
    fuel_stock_days: null
  };

  let steamLossSum = 0, steamLossCount = 0;
  let costPerSteamSum = 0, costPerSteamCount = 0;
  let fuelDaysSum = 0, fuelDaysCount = 0;

  for (const r of records) {
    agg.total_steam_production += Number(r.total_steam_production || 0);
    agg.total_cost += Number(r.total_cost || 0);
    agg.total_electricity += Number(r.total_electricity || 0);
    agg.fuel_stock_estimate += Number(r.fuel_stock_estimate || 0);

    if (r.steam_loss_rate != null) {
      steamLossSum += Number(r.steam_loss_rate);
      steamLossCount++;
    }
    if (r.cost_per_steam != null) {
      costPerSteamSum += Number(r.cost_per_steam);
      costPerSteamCount++;
    }
    if (r.fuel_stock_days != null) {
      fuelDaysSum += Number(r.fuel_stock_days);
      fuelDaysCount++;
    }
  }

  if (steamLossCount > 0) agg.steam_loss_rate = +(steamLossSum / steamLossCount).toFixed(4);
  if (costPerSteamCount > 0) agg.cost_per_steam = +(costPerSteamSum / costPerSteamCount).toFixed(2);
  if (fuelDaysCount > 0) agg.fuel_stock_days = +(fuelDaysSum / fuelDaysCount).toFixed(1);

  return agg;
}

/**
 * 客户用汽统计
 */
async function customerStats(params, user, factoryScope) {
  try {
    let { factoryId, startDate, endDate, customerId } = params;
    if (factoryScope) factoryId = factoryScope;
    if (!factoryId) return { code: 4001, message: '缺少 factoryId' };

    if (!startDate || !endDate) {
      endDate = dayjs().format('YYYY-MM-DD');
      startDate = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    }

    let customerFilter = '';
    const queryParams = [factoryId, startDate, endDate];
    if (customerId) {
      customerFilter = ' AND cs.customer_id = ?';
      queryParams.push(customerId);
    }

    const rows = await db.query(
      `SELECT cs.customer_id, sc.name AS customer_name,
              dr.record_date, cs.steam_usage
       FROM customer_steam_data cs
       JOIN daily_record dr ON cs.daily_record_id = dr.id
       JOIN steam_customer sc ON cs.customer_id = sc.id
       WHERE dr.factory_id = ? AND dr.record_date BETWEEN ? AND ?${customerFilter}
       ORDER BY dr.record_date ASC, sc.sort_order ASC`,
      queryParams
    );
    await db.end();

    const customerMap = {};
    for (const r of rows) {
      const key = r.customer_id;
      if (!customerMap[key]) {
        customerMap[key] = { id: key, name: r.customer_name, days: [], totalSteam: 0, count: 0 };
      }
      const usage = Number(r.steam_usage || 0);
      customerMap[key].days.push({ date: dayjs(r.record_date).format('YYYY-MM-DD'), steam_usage: usage });
      customerMap[key].totalSteam += usage;
      customerMap[key].count++;
    }

    const customers = Object.values(customerMap).map(c => ({
      ...c,
      dailyAvg: c.count > 0 ? +(c.totalSteam / c.count).toFixed(1) : 0,
    }));

    return { code: 0, data: { customers, startDate, endDate } };
  } catch (err) {
    console.error('[statistics.customerStats] error:', err);
    return { code: 9999, message: '获取客户统计失败' };
  }
}

module.exports = { overview, trend, compare, customerStats };
