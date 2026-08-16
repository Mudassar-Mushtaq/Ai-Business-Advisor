import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign, ShoppingCart, TrendingUp, Package,
  RefreshCw, FileDown, FileText, Activity, Boxes, Target, Sparkles, ChevronRight, BellRing,
} from 'lucide-react';
import {
  getSalesInsights, getSalesTrend, getTopProducts, getCategories,
  getNotifications, getInventory, getForecasts, getGoals, getLatestBrief,
  markNotificationRead, getForecastStatus, generateForecasts, resetForecastStatus
} from '../api';
import KPICard from '../components/KPICard/KPICard';
import GoalProgressCard from '../components/GoalProgressCard/GoalProgressCard';
import { RevenueTrendChart, TopProductsChart, CategoryPieChart, MonthlyPerformanceChart } from '../components/Charts/Charts';
import EmptyState from '../components/EmptyState/EmptyState';
import AlertCard from '../components/AlertBanner/AlertCard';
import ReorderModal from '../components/ReorderModal/ReorderModal';
import { detectRevenueAnomalies, computeReorderRecommendations } from '../utils/analytics';
import { buildUnifiedAlerts } from '../utils/alerts';
import { exportToCsv, printReport } from '../utils/exporter';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import ForecastProgress from '../components/ForecastProgress/ForecastProgress';
import StaleBanner from '../components/StaleBanner/StaleBanner';
import './Dashboard.css';
import '../components/GoalProgressCard/GoalProgressCard.css';
import './Briefs.css';

const KIND_EMOJI = {
  win: '🚀', risk: '⚠️', anomaly: '👀',
  recommendation: '💡', goal: '🎯', info: '📊',
};

const DASHBOARD_ALERT_PREVIEW = 2;

function KPISkeleton() {
  return (
    <div className="grid-4" style={{ marginBottom: 28 }}>
      {Array.from({ length: 4 }).map((_, i) => <KPICard key={i} loading />)}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [insights, setInsights]     = useState(null);
  const [trend, setTrend]           = useState([]);
  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [alerts, setAlerts]         = useState([]);
  const [inventory, setInventory]   = useState([]);
  const [forecasts, setForecasts]   = useState([]);
  const [goals, setGoals]           = useState([]);
  const [latestBrief, setLatestBrief] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [period, setPeriod]         = useState(30);
  const [reorderTarget, setReorderTarget] = useState(null);
  const [job, setJob] = useState(null);
  const [generating, setGenerating] = useState(false);

  const checkStatus = async () => {
    try {
      const statusData = await getForecastStatus();
      setJob(statusData);

      if (statusData && statusData.status === 'generating') {
        setGenerating(true);
        return true; // continue polling
      } else if (statusData && statusData.status === 'complete') {
        setGenerating(false);
        const completionMsg = statusData.result?.message || 'Forecasts generated successfully!';
        toast.success(completionMsg);
        
        // Reload dashboard forecasts & inventory reorders after generation completes
        const fcData = await getForecasts().catch(() => []);
        setForecasts(fcData);
        await resetForecastStatus();
        setJob(null);
        return false; // stop polling
      } else if (statusData && statusData.status === 'failed') {
        setGenerating(false);
        toast.error(statusData.error || 'Forecast generation failed.');
        await resetForecastStatus();
        setJob(null);
        return false; // stop polling
      } else {
        setGenerating(false);
        setJob(null);
        return false;
      }
    } catch (err) {
      console.error('Error fetching job status on dashboard:', err);
    }
    setGenerating(false);
    setJob(null);
    return false; // stop polling on error
  };

  const handleGenerateForecasts = async () => {
    setGenerating(true);
    const toastId = toast.loading('Initializing forecast generation...');
    try {
      const res = await generateForecasts();
      toast.success(res.message || 'Forecast generation started.', { id: toastId });
      setTimeout(() => {
        checkStatus();
      }, 500);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start forecast generation.', { id: toastId });
      setGenerating(false);
    }
  };

  // Poll status on mount or when generating is active
  useEffect(() => {
    let active = true;
    let timeoutId;

    const poll = async () => {
      if (!active) return;
      const keepGoing = await checkStatus();
      if (keepGoing && active) {
        timeoutId = setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [generating]);

  const load = async () => {
    setLoading(true);
    try {
      const [ins, tr, prods, cats, notifs, inv, fc, gs, brief] = await Promise.all([
        getSalesInsights(),
        getSalesTrend(period),
        getTopProducts(),
        getCategories(),
        getNotifications(),
        getInventory().catch(() => []),
        getForecasts().catch(() => []),
        getGoals('active').catch(() => []),
        getLatestBrief().catch(() => null),
      ]);
      setInsights(ins);
      setTrend(tr);
      setProducts(prods.slice(0, 8));
      setCategories(cats.slice(0, 6));
      setAlerts((notifs || []).filter(n => !n.read));
      setInventory(inv || []);
      setForecasts(fc || []);
      setGoals(gs || []);
      setLatestBrief(brief);
    } catch {
      toast.error('Failed to load dashboard data.');
    }
    setLoading(false);
  };

  const reloadNotifications = async () => {
    try {
      const notifs = await getNotifications();
      setAlerts((notifs || []).filter(n => !n.read));
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period]);

  useEffect(() => {
    window.addEventListener('aiba:notifications-updated', reloadNotifications);
    return () => window.removeEventListener('aiba:notifications-updated', reloadNotifications);
  }, []);

  const fmt = (n) => n >= 1000000 ? `$${(n/1000000).toFixed(2)}M` : n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${(n||0).toFixed(0)}`;
  const fmtNumber = (n) => Math.round(n).toLocaleString();
  const s = insights?.summary || {};

  // 2.1 Anomaly detection on revenue
  const [dismissedAnomalies, setDismissedAnomalies] = useState(new Set());
  const rawAnomalies = useMemo(() => detectRevenueAnomalies(trend), [trend]);
  const anomalies = useMemo(
    () => rawAnomalies.filter(a => !dismissedAnomalies.has(`anom-${a.date}-${a.direction}`)),
    [rawAnomalies, dismissedAnomalies]
  );

  // Unified alert feed (notifications + derived anomalies), sorted by severity + recency
  const unifiedAlerts = useMemo(
    () => buildUnifiedAlerts(alerts, anomalies),
    [alerts, anomalies]
  );
  const previewAlerts = unifiedAlerts.slice(0, DASHBOARD_ALERT_PREVIEW);
  const remainingAlertCount = Math.max(0, unifiedAlerts.length - DASHBOARD_ALERT_PREVIEW);
  const criticalAlertCount = unifiedAlerts.filter(a => a.severity === 'critical').length;

  const dismissAlert = async (alert) => {
    if (alert.source === 'anomaly') {
      setDismissedAnomalies(prev => new Set(prev).add(alert.id));
      window.dispatchEvent(new Event('aiba:notifications-updated'));
      return;
    }
    setAlerts(prev => prev.filter(a => (a._id || a.id) !== alert.id));
    try {
      await markNotificationRead(alert.id);
      window.dispatchEvent(new Event('aiba:notifications-updated'));
    } catch {
      toast.error('Could not mark as read.');
    }
  };

  // 2.3 Reorder recommendations (combines inventory + forecasts)
  const reorderItems = useMemo(
    () => computeReorderRecommendations(inventory, forecasts).slice(0, 6),
    [inventory, forecasts]
  );

  const isStale = useMemo(() => forecasts.some(f => f.isStale), [forecasts]);

  // Sparkline series for KPI cards (last N days)
  const sparkRevenue = useMemo(() => trend.map(d => d.totalRevenue || 0), [trend]);
  const sparkOrders  = useMemo(() => trend.map(d => d.totalOrders  || d.totalQuantity || 0), [trend]);

  const handleExportCsv = () => {
    if (!trend || trend.length === 0) return toast.error('No sales data to export.');
    exportToCsv(`sales-trend-${period}d-${new Date().toISOString().slice(0,10)}.csv`,
      trend.map(d => ({
        date: d._id,
        revenue: (d.totalRevenue || 0).toFixed(2),
        quantity: d.totalQuantity || 0,
        orders: d.totalOrders || 0,
      })));
    toast.success('Sales CSV downloaded.');
  };

  const handlePrintReport = () => {
    if (!insights) return toast.error('No data yet.');
    printReport({
      title: 'Business Report',
      subtitle: `Last ${period} days · ${user?.name || ''}`,
      sections: [
        { type: 'kpis', heading: 'Key Metrics', items: [
          { label: 'Total Revenue',  value: fmt(s.totalRevenue) },
          { label: 'Total Orders',   value: (s.totalOrders||0).toLocaleString() },
          { label: 'Gross Profit',   value: fmt(s.grossProfit) },
          { label: 'Profit Margin',  value: `${s.profitMargin || 0}%` },
        ]},
        ...(products.length > 0 ? [{ type: 'table', heading: 'Top Products', columns: [
          { key:'name', label:'Product' }, { key:'rev', label:'Revenue' }, { key:'qty', label:'Units' },
        ], rows: products.slice(0,10).map(p => ({
          name: p._id, rev: fmt(p.totalRevenue || 0), qty: (p.totalQuantity || 0).toLocaleString(),
        }))}] : []),
        ...(anomalies.length > 0 ? [{ type: 'table', heading: 'Detected Anomalies', columns: [
          { key:'date', label:'Date' }, { key:'kind', label:'Kind' }, { key:'value', label:'Revenue' }, { key:'pct', label:'Δ vs avg' },
        ], rows: anomalies.map(a => ({
          date: a.date, kind: a.direction === 'spike' ? '🚀 Spike' : '📉 Drop',
          value: fmt(a.value), pct: `${a.pct > 0 ? '+' : ''}${a.pct}%`
        }))}] : []),
        ...(reorderItems.length > 0 ? [{ type: 'table', heading: 'Reorder Recommendations', columns: [
          { key:'product', label:'Product' }, { key:'stock', label:'Stock' },
          { key:'days', label:'Days Left' }, { key:'qty', label:'Suggest Order' },
        ], rows: reorderItems.map(r => ({
          product: r.product, stock: `${r.stock} ${r.unit}`,
          days: r.daysLeft != null ? `${r.daysLeft}d` : '—',
          qty: r.suggestedQty,
        }))}] : []),
      ],
    });
  };

  // Wire up command palette events
  useEffect(() => {
    window.addEventListener('aiba:export-csv', handleExportCsv);
    return () => window.removeEventListener('aiba:export-csv', handleExportCsv);
    // eslint-disable-next-line
  }, [trend]);

  return (
    <div className="page-wrapper page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title shimmer-text">Welcome back, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="page-subtitle">Here's what's happening with your business today.</p>
        </div>
        <div className="dashboard-controls" style={{ flexWrap:'wrap' }}>
          <select
            className="form-select"
            style={{ width:'auto' }}
            value={period}
            onChange={e => setPeriod(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={handleExportCsv} title="Export sales CSV">
            <FileDown size={14} /> CSV
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handlePrintReport} title="Print business report">
            <FileText size={14} /> Report
          </button>
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <ForecastProgress job={job} />

      {(isStale || generating) && (
        <StaleBanner generating={generating} onGenerate={handleGenerateForecasts} />
      )}

      {/* Latest weekly brief preview */}
      {latestBrief && (
        <div className="brief-preview">
          <div className="brief-preview__head">
            <h3><Sparkles size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} /> This week's brief</h3>
            <Link to="/briefs" className="btn btn-ghost btn-sm">
              See all <ChevronRight size={14} />
            </Link>
          </div>
          {latestBrief.headline && (
            <div className="brief-preview__headline">{latestBrief.headline}</div>
          )}
          <ul className="brief-preview__bullets">
            {(latestBrief.bullets || []).slice(0, 3).map((b, i) => (
              <li key={i} data-emoji={KIND_EMOJI[b.kind] || '•'}>{b.text}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Active goals strip */}
      {goals.length > 0 && (
        <div className="dashboard-goals">
          <div className="dashboard-goals__head">
            <h3><Target size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Active goals</h3>
            <Link to="/goals" className="btn btn-ghost btn-sm">
              Manage <ChevronRight size={14} />
            </Link>
          </div>
          <div className="dashboard-goals__grid">
            {goals.slice(0, 3).map((g) => (
              <GoalProgressCard key={g.goalId} progress={g} compact />
            ))}
          </div>
        </div>
      )}

      {/* AI Alerts preview — shows up to 2; remainder linked to /alerts */}
      {unifiedAlerts.length > 0 && (
        <section className="alerts-preview gradient-border glow-primary">
          <header className="alerts-preview__head">
            <div className="alerts-preview__title">
              <span className="alerts-preview__badge">
                <BellRing size={14} />
                {criticalAlertCount > 0 && (
                  <span className="alerts-preview__badge-count">{criticalAlertCount}</span>
                )}
              </span>
              <div>
                <h3>AI Alerts <span className="pulse-dot" style={{ marginLeft: 6, verticalAlign: 'middle' }} /></h3>
                <p>
                  {unifiedAlerts.length} active{criticalAlertCount > 0 ? ` · ${criticalAlertCount} critical` : ''}
                </p>
              </div>
            </div>
            <Link to="/alerts" className="btn btn-secondary btn-sm alerts-preview__cta">
              See all
              {remainingAlertCount > 0 && (
                <span className="alerts-preview__cta-count">+{remainingAlertCount}</span>
              )}
              <ChevronRight size={14} />
            </Link>
          </header>
          <div className="alerts-preview__grid">
            {previewAlerts.map(a => (
              <AlertCard
                key={a.id}
                alert={a}
                compact
                onDismiss={a.source === 'notification' ? dismissAlert : undefined}
                onReorder={a.type === 'low_stock' ? setReorderTarget : undefined}
              />
            ))}
          </div>
        </section>
      )}

      <ReorderModal
        open={!!reorderTarget}
        alert={reorderTarget?.source === 'notification' ? reorderTarget : null}
        product={reorderTarget?.source !== 'notification' ? { product: reorderTarget?.product } : null}
        onClose={() => setReorderTarget(null)}
        onCreated={() => { setReorderTarget(null); load(); }}
      />

      {/* KPI Cards */}
      {loading ? <KPISkeleton /> : (
        <div className="grid-4 stagger" style={{ marginBottom: 28 }}>
          <KPICard
            title="Total Revenue"
            numericValue={s.totalRevenue || 0}
            format={fmt}
            value={fmt(s.totalRevenue)}
            icon={DollarSign} color="primary"
            trend={s.momGrowth} trendLabel="vs last month"
            sparkline={sparkRevenue}
          />
          <KPICard
            title="Total Orders"
            numericValue={s.totalOrders || 0}
            format={fmtNumber}
            value={(s.totalOrders||0).toLocaleString()}
            icon={ShoppingCart} color="success"
            subtitle={`Avg. ${fmt(s.avgOrderValue)} / order`}
            sparkline={sparkOrders}
          />
          <KPICard
            title="Gross Profit"
            numericValue={s.grossProfit || 0}
            format={fmt}
            value={fmt(s.grossProfit)}
            icon={TrendingUp} color="purple"
            subtitle={`${s.profitMargin || 0}% margin`}
            sparkline={sparkRevenue.map(v => v * (s.profitMargin || 30) / 100)}
          />
          <KPICard
            title="Active Alerts"
            value={unifiedAlerts.length}
            numericValue={unifiedAlerts.length}
            format={(n) => Math.round(n)}
            icon={Package} color="warning"
            subtitle={criticalAlertCount > 0
              ? `${criticalAlertCount} critical · needs review`
              : anomalies.length > 0
                ? `${anomalies.length} anomal${anomalies.length>1?'ies':'y'} detected`
                : 'All clear'}
          />
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="grid-2 stagger" style={{ marginBottom: 28 }}>
        <div className={`card ${isStale || generating ? 'is-stale-data' : ''}`}>
          <div className="chart-card-header">
            <div>
              <h3>
                Revenue Overview
                {(isStale || generating) && (
                  <span className={`updating-indicator-pill ${generating ? 'is-updating' : ''}`}>
                    {generating ? 'Updating...' : 'Stale'}
                  </span>
                )}
              </h3>
              <p className="chart-card-subtitle">
                Historical Actual: <strong style={{ color: 'var(--text-primary)' }}>{fmt(trend.reduce((s, d) => s + (d.totalRevenue || 0), 0))}</strong> ({period}d window)
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="badge badge-info">{period}d Actuals</span>
              {forecasts.length > 0 && (
                <span className="badge badge-success">{forecasts[0]?.period || '30d'} Forecast</span>
              )}
            </div>
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 220, width: '100%' }} />
          ) : trend.length > 0
            ? <RevenueTrendChart data={trend} forecasts={forecasts} />
            : <EmptyState illustration="chart" title="No data yet" message="Upload sales data to see trends." />
          }
        </div>

        <div className="card">
          <div className="chart-card-header">
            <h3>Category Breakdown</h3>
            <span className="badge badge-muted">{categories.length} categories</span>
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 220, width: '100%' }} />
          ) : categories.length > 0
            ? <CategoryPieChart data={categories} />
            : <EmptyState illustration="pie" title="No categories" message="Upload data with product categories to see this." />
          }
        </div>
      </div>

      {/* Reorder recommendations */}
      {reorderItems.length > 0 && (
        <div className={`card reorder-panel ${isStale || generating ? 'is-stale-data' : ''}`} style={{ marginBottom: 28 }}>
          <div className="chart-card-header">
            <h3>
              <Boxes size={18} style={{ verticalAlign:'-3px', marginRight:6 }} />
              Reorder Recommendations
              {(isStale || generating) && (
                <span className={`updating-indicator-pill ${generating ? 'is-updating' : ''}`}>
                  {generating ? 'Updating...' : 'Stale'}
                </span>
              )}
            </h3>
            <span className="badge badge-warning">{reorderItems.length} need attention</span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Stock</th>
                  <th>Daily Demand</th>
                  <th>Days Left</th>
                  <th>Suggested Order</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reorderItems.map((r, i) => (
                  <tr key={i}>
                    <td data-label="Product" className="cell-stack"><strong>{r.product}</strong>{r.category && <div style={{ fontSize:'0.75rem', color:'var(--text-muted)'}}>{r.category}</div>}</td>
                    <td data-label="Stock">{r.stock} {r.unit}</td>
                    <td data-label="Daily Demand" className="col-hide-mobile">{r.dailyDemand > 0 ? `${r.dailyDemand} / day` : <span style={{ color:'var(--text-muted)'}}>—</span>}</td>
                    <td data-label="Days Left">
                      {r.daysLeft != null ? (
                        <span className={`days-pill days-pill--${r.severity}`}>
                          {r.daysLeft}d
                        </span>
                      ) : <span style={{ color:'var(--text-muted)'}}>—</span>}
                    </td>
                    <td data-label="Suggested Order"><strong style={{ color:'var(--primary-light)' }}>{r.suggestedQty} {r.unit}</strong></td>
                    <td data-label="Status">
                      <span className={
                        r.severity === 'critical' ? 'badge badge-danger' :
                        r.severity === 'warning'  ? 'badge badge-warning' : 'badge badge-info'
                      }>
                        {r.severity === 'critical' ? '🔴 Reorder now' : r.severity === 'warning' ? '🟡 Soon' : '🔵 Plan ahead'}
                      </span>
                    </td>
                    <td className="cell-actions">
                      <button
                        type="button"
                        className="reorder-table-btn"
                        onClick={() => setReorderTarget({ product: r.product, source: 'recommendation' })}
                        title="Create a draft purchase order"
                      >
                        <ShoppingCart size={12} /> Reorder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:10 }}>
            <Activity size={11} style={{ verticalAlign:'-1px' }} /> Reorder logic uses forecasted daily demand and a 7-day lead time with 25% safety stock.
          </p>
        </div>
      )}

      {/* Top Products */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div className="chart-card-header">
          <h3>Top Products by Revenue</h3>
          <span className="badge badge-success">Top {products.length}</span>
        </div>
        {loading ? (
          <div className="skeleton" style={{ height: 220, width: '100%' }} />
        ) : products.length > 0
          ? <TopProductsChart data={products} />
          : <EmptyState illustration="product" title="No product data" message="Upload a CSV or Excel file to get started." />
        }
      </div>

      {/* Monthly Trend Table */}
      {insights?.monthlyTrend?.length > 0 && (
        <div className="card" style={{ marginBottom: 28 }}>
          <div className="chart-card-header">
            <h3>Monthly Sales & Volume Trends</h3>
            <span className="badge badge-muted">{insights.monthlyTrend.length} months</span>
          </div>
          <div style={{ marginBottom: 24 }}>
            <MonthlyPerformanceChart data={insights.monthlyTrend} />
          </div>
          <div className="divider" style={{ margin: '20px 0' }} />
          <div className="chart-card-header" style={{ marginBottom: 12 }}>
            <h4 style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Performance Details</h4>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Revenue</th>
                  <th>Units Sold</th>
                  <th>Orders</th>
                  <th>Avg Order</th>
                </tr>
              </thead>
              <tbody>
                {insights.monthlyTrend.map(m => (
                  <tr key={m.period}>
                    <td data-label="Period"><strong>{m.period}</strong></td>
                    <td data-label="Revenue" style={{ color:'var(--primary-light)' }}>{fmt(m.revenue)}</td>
                    <td data-label="Units Sold">{m.quantity?.toLocaleString()}</td>
                    <td data-label="Orders">{m.orders}</td>
                    <td data-label="Avg Order">{fmt(m.revenue / (m.orders || 1))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
