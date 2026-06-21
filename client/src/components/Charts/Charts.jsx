import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend
} from 'recharts';

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16'];

const tooltipStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
  padding: '8px 12px',
  boxShadow: 'var(--shadow-lg)',
};
const tooltipLabelStyle = { color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 };
const tooltipItemStyle = { color: 'var(--text-secondary)' };

function fmt(v) {
  if (v >= 1000000) return `$${(v/1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v/1000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

// Revenue Trend / Area Chart
export function RevenueTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorQty" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#0ea5e9" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="_id" stroke="#475569" tick={{ fontSize: 11 }} />
        <YAxis stroke="#475569" tick={{ fontSize: 11 }} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'K' : v}`} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v, n) => [fmt(v), n === 'totalRevenue' ? 'Revenue' : 'Quantity']} />
        <Legend wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8' }} />
        <Area type="monotone" dataKey="totalRevenue" name="Revenue" stroke="#6366f1" strokeWidth={2} fill="url(#colorRev)" dot={false} />
        <Area type="monotone" dataKey="totalQuantity" name="Quantity" stroke="#0ea5e9" strokeWidth={2} fill="url(#colorQty)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Top Products Bar Chart
export function TopProductsChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
        <XAxis type="number" stroke="#475569" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
        <YAxis type="category" dataKey="_id" stroke="#475569" tick={{ fontSize: 11 }} width={90} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={v => [fmt(v), 'Revenue']} />
        <Bar dataKey="totalRevenue" name="Revenue" radius={[0,6,6,0]}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Category Pie Chart
export function CategoryPieChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          dataKey="totalRevenue"
          nameKey="_id"
          paddingAngle={3}
          label={({ _id, percent }) => `${_id} ${(percent*100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={v => [fmt(v), 'Revenue']} />
        <Legend wrapperStyle={{ fontSize: '0.78rem', color: '#94a3b8' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// Forecast Area Chart (daily breakdown) with optional P10/P50/P90 band
export function ForecastChart({ data, showBand = false }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.06} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 10 }} tickFormatter={v => v?.slice(5)} />
        <YAxis stroke="#475569" tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle}
          formatter={(v, n) => {
            if (n === 'bandLow' || n === 'bandRange') return [null, null];
            const labels = { p50: 'Forecast (P50)', p10: 'P10 (low)', p90: 'P90 (high)', quantity: 'Qty', revenue: 'Revenue' };
            return [Math.round(v), labels[n] || n];
          }}
        />
        {showBand && (
          <>
            <Area type="monotone" dataKey="bandLow" stroke="none" fill="transparent" stackId="band" legendType="none" />
            <Area type="monotone" dataKey="bandRange" name="P10–P90 Band" stroke="none" fill="url(#forecastBand)" stackId="band" />
          </>
        )}
        <Area type="monotone" dataKey={showBand ? 'p50' : 'quantity'} name={showBand ? 'P50' : 'Qty'} stroke="#10b981" strokeWidth={2.2} fill={showBand ? 'none' : 'url(#forecastGrad)'} dot={false} />
        {!showBand && (
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#6366f1" strokeWidth={2} fill="none" dot={false} strokeDasharray="4 2" />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
