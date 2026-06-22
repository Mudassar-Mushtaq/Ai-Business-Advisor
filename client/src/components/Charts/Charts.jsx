import { useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine, ComposedChart, Line
} from 'recharts';
import './Charts.css';

// Premium theme colors matching index.css variables
const COLORS = [
  '#6366f1', // Indigo
  '#0ea5e9', // Sky/Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber/Orange
  '#ec4899', // Pink/Rose
  '#8b5cf6', // Purple/Violet
  '#06b6d4', // Teal
  '#84cc16'  // Lime
];

function fmt(v) {
  if (v == null || isNaN(v)) return '$0';
  if (v >= 1000000) return `$${(v/1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v/1000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

/** Format a YYYY-MM-DD string to "Jun 22" style */
function fmtDate(dateStr) {
  if (!dateStr) return '';
  // Avoid time-zone offset shifting date by parsing explicitly with local boundary
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Truncate long product names to keep UI clean */
function truncateProductName(name) {
  if (typeof name !== 'string') return '';
  return name.length > 15 ? `${name.substring(0, 12)}...` : name;
}

/**
 * Aggregate all per-product forecast dailyBreakdowns into a single
 * date → totalForecastedRevenue map.
 */
function aggregateForecasts(forecasts) {
  const byDate = {};
  (forecasts || []).forEach(f => {
    (f.dailyBreakdown || []).forEach(d => {
      const key = typeof d.date === 'string'
        ? d.date.slice(0, 10)
        : new Date(d.date).toISOString().slice(0, 10);
      byDate[key] = (byDate[key] || 0) + (d.revenue || 0);
    });
  });
  return byDate;
}

/** Shared Premium HTML Tooltip */
function CustomTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (active && payload && payload.length) {
    const validItems = payload.filter(item => item.value != null);
    if (validItems.length === 0) return null;

    return (
      <div className="custom-chart-tooltip">
        <div className="custom-chart-tooltip__title">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
        <div className="custom-chart-tooltip__list">
          {validItems.map((item, index) => {
            const formatted = formatter ? formatter(item.value, item.name, item, index) : [item.value, item.name];
            if (!formatted || formatted[0] == null) return null;
            const [valStr, nameStr] = formatted;
            
            // Prioritize item.color/fill, fallback to stroke, and ignore var(--bg-card) border color
            let dotColor = item.color || item.fill;
            if (!dotColor || dotColor === 'var(--bg-card)' || dotColor === 'transparent') {
              dotColor = item.stroke;
            }
            if (!dotColor || dotColor === 'var(--bg-card)' || dotColor === 'transparent') {
              dotColor = '#6366f1';
            }
            // Fallback for SVG URL references
            if (typeof dotColor === 'string' && dotColor.includes('url(')) {
              dotColor = 'var(--primary)';
            }
            
            return (
              <div key={index} className="custom-chart-tooltip__item">
                <div className="custom-chart-tooltip__label-wrap">
                  <span 
                    className="custom-chart-tooltip__indicator" 
                    style={{ backgroundColor: dotColor }} 
                  />
                  <span className="custom-chart-tooltip__name">{nameStr}</span>
                </div>
                <span className="custom-chart-tooltip__value">{valStr}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
}

// Actual vs Forecast Revenue Chart
export function RevenueTrendChart({ data, forecasts = [] }) {
  const { combinedData, boundaryDate } = useMemo(() => {
    // 1. Build historical points
    const historical = (data || []).map(d => ({
      date: d._id,
      actualRevenue: d.totalRevenue || 0,
    }));
    historical.sort((a, b) => a.date.localeCompare(b.date));

    // 2. Aggregate forecasts
    const fcMap = aggregateForecasts(forecasts);
    const fcDates = Object.keys(fcMap).sort();

    // 3. Find boundary — last historical date
    const lastHistDate = historical.length > 0 ? historical[historical.length - 1].date : null;
    const lastHistValue = historical.length > 0 ? historical[historical.length - 1].actualRevenue : 0;

    // 4. Build forecast points (only dates after the last historical date)
    const forecastPoints = fcDates
      .filter(d => !lastHistDate || d > lastHistDate)
      .map(d => ({
        date: d,
        forecastRevenue: Math.round(fcMap[d] || 0),
      }));

    // 5. Create boundary bridge — last historical point also gets a forecast
    //    value so the line is connected seamlessly
    if (lastHistDate && forecastPoints.length > 0) {
      historical[historical.length - 1].forecastRevenue = lastHistValue;
    }

    return {
      combinedData: [...historical, ...forecastPoints],
      boundaryDate: lastHistDate,
    };
  }, [data, forecasts]);

  const hasForecast = combinedData.some(d => d.forecastRevenue != null && d.forecastRevenue > 0);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={combinedData} margin={{ top: 15, right: 15, left: -10, bottom: 5 }}>
        <defs>
          <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="var(--primary)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="var(--success)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          dy={8}
          tickFormatter={fmtDate}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          dx={-8}
          tickFormatter={v => fmt(v)}
        />
        <Tooltip
          content={<CustomTooltip />}
          labelFormatter={fmtDate}
          formatter={(v, name) => {
            if (v == null) return [null, null];
            const label = name === 'forecastRevenue' ? 'Forecast' : 'Actual Sales';
            return [fmt(v), label];
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          verticalAlign="top"
          height={36}
          formatter={(value) => value === 'forecastRevenue' ? 'Forecasted Revenue' : 'Actual Revenue'}
        />
        {boundaryDate && hasForecast && (
          <ReferenceLine
            x={boundaryDate}
            stroke="var(--text-muted)"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
            label={{ value: 'Today', position: 'top', fill: 'var(--text-secondary)', fontSize: 10, offset: 8 }}
          />
        )}
        <Area
          type="monotone"
          dataKey="actualRevenue"
          name="actualRevenue"
          stroke="var(--primary)"
          strokeWidth={3}
          fill="url(#colorActual)"
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0, fill: 'var(--primary)' }}
          connectNulls={false}
        />
        {hasForecast && (
          <Area
            type="monotone"
            dataKey="forecastRevenue"
            name="forecastRevenue"
            stroke="var(--success)"
            strokeWidth={3}
            strokeDasharray="6 3"
            fill="url(#colorForecast)"
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0, fill: 'var(--success)' }}
            connectNulls={false}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Top Products Bar Chart
export function TopProductsChart({ data }) {
  const truncatedData = useMemo(() => {
    return (data || []).map(item => ({
      ...item,
      truncatedName: truncateProductName(item._id)
    }));
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={truncatedData} margin={{ top: 10, right: 15, left: 10, bottom: 5 }} layout="vertical">
        <defs>
          <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
            <stop offset="100%" stopColor="var(--secondary)" stopOpacity={0.8} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          axisLine={false}
          tickLine={false}
          dy={6}
          tickFormatter={v => fmt(v)}
        />
        <YAxis
          type="category"
          dataKey="truncatedName"
          axisLine={false}
          tickLine={false}
          dx={-6}
          width={90}
        />
        <Tooltip
          content={<CustomTooltip />}
          labelFormatter={(lbl) => {
            // Find the original full name from the dataset if truncated
            const item = truncatedData.find(d => d.truncatedName === lbl);
            return item ? item._id : lbl;
          }}
          formatter={v => [fmt(v), 'Revenue']}
        />
        <Bar dataKey="totalRevenue" name="Revenue" fill="url(#barGradient)" radius={[0, 4, 4, 0]} barSize={16}>
          {truncatedData.map((_, i) => <Cell key={i} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Category Pie Chart
export function CategoryPieChart({ data }) {
  const totalRevenue = useMemo(() => {
    return (data || []).reduce((sum, d) => sum + (d.totalRevenue || 0), 0);
  }, [data]);

  const total = useMemo(() => data.reduce((sum, entry) => sum + (entry.totalRevenue || 0), 0), [data]);

  const renderLegend = (value, entry) => {
    const { payload } = entry;
    const val = payload?.totalRevenue || 0;
    const percent = total > 0 ? (val / total * 100).toFixed(0) : 0;
    return `${value} (${percent}%)`;
  };

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={65}
          outerRadius={88}
          dataKey="totalRevenue"
          nameKey="_id"
          paddingAngle={3}
          label={false} // Clean up label lines
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--bg-card)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          content={<CustomTooltip />}
          formatter={(v, name, item) => {
            return [fmt(v), name];
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={renderLegend}
          layout="horizontal"
          verticalAlign="bottom"
          align="center"
          wrapperStyle={{ paddingTop: 10 }}
        />
        {/* Dynamic center text layout */}
        <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" className="pie-center-label">
          Total Revenue
        </text>
        <text x="50%" y="56%" textAnchor="middle" dominantBaseline="middle" className="pie-center-value">
          {fmt(totalRevenue)}
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}

// Forecast Area Chart (daily breakdown) with optional P10/P50/P90 band
export function ForecastChart({ data, showBand = false }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 15, right: 15, left: -10, bottom: 5 }}>
        <defs>
          <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="var(--success)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--success)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--success)" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          dy={8}
          tickFormatter={v => v ? fmtDate(v) : ''}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          dx={-8}
        />
        <Tooltip
          content={<CustomTooltip />}
          labelFormatter={v => v ? fmtDate(v) : ''}
          formatter={(v, n) => {
            if (n === 'bandLow' || n === 'bandRange') return [null, null];
            const labels = { p50: 'Forecast (P50)', p10: 'P10 (low)', p90: 'P90 (high)', quantity: 'Qty', revenue: 'Revenue' };
            const isRevenue = n === 'revenue';
            const valueStr = isRevenue ? fmt(v) : Math.round(v).toLocaleString();
            return [valueStr, labels[n] || n];
          }}
        />
        {showBand && (
          <>
            <Area type="monotone" dataKey="bandLow" stroke="none" fill="transparent" stackId="band" legendType="none" />
            <Area type="monotone" dataKey="bandRange" name="P10–P90 Band" stroke="none" fill="url(#forecastBand)" stackId="band" />
          </>
        )}
        <Area
          type="monotone"
          dataKey={showBand ? 'p50' : 'quantity'}
          name={showBand ? 'P50' : 'Qty'}
          stroke="var(--success)"
          strokeWidth={3}
          fill={showBand ? 'none' : 'url(#forecastGrad)'}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0, fill: 'var(--success)' }}
        />
        {!showBand && (
          <Area
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="var(--primary)"
            strokeWidth={3}
            fill="none"
            dot={false}
            strokeDasharray="4 2"
            activeDot={{ r: 5, strokeWidth: 0, fill: 'var(--primary)' }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Monthly Performance Trend Chart (Composite Bar + Line)
export function MonthlyPerformanceChart({ data }) {
  const sortedData = useMemo(() => {
    return [...(data || [])].sort((a, b) => a.period.localeCompare(b.period));
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={sortedData} margin={{ top: 15, right: -5, left: -10, bottom: 5 }}>
        <defs>
          <linearGradient id="monthlyRevenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
            <stop offset="100%" stopColor="var(--primary-dark)" stopOpacity={0.65} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="period"
          axisLine={false}
          tickLine={false}
          dy={8}
        />
        <YAxis
          yAxisId="left"
          axisLine={false}
          tickLine={false}
          dx={-8}
          tickFormatter={v => fmt(v)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          axisLine={false}
          tickLine={false}
          dx={8}
          tickFormatter={v => Math.round(v).toLocaleString()}
        />
        <Tooltip
          content={<CustomTooltip />}
          formatter={(v, name) => {
            if (name === 'revenue') return [fmt(v), 'Revenue'];
            if (name === 'quantity') return [Math.round(v).toLocaleString(), 'Units Sold'];
            return [v, name];
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          verticalAlign="top"
          height={36}
          formatter={(value) => value === 'revenue' ? 'Monthly Revenue' : 'Units Sold'}
        />
        <Bar
          yAxisId="left"
          dataKey="revenue"
          name="revenue"
          fill="url(#monthlyRevenueGrad)"
          radius={[4, 4, 0, 0]}
          barSize={20}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="quantity"
          name="quantity"
          stroke="var(--secondary)"
          strokeWidth={3}
          dot={{ r: 4, strokeWidth: 0, fill: 'var(--secondary)' }}
          activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--secondary)' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
