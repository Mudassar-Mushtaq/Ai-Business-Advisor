import { useEffect, useState } from 'react';
import { TrendingUp, RefreshCw, Cpu, Target, Calendar, ChevronDown, ChevronUp, FileDown, FileText, Activity, BrainCircuit } from 'lucide-react';
import { getForecasts, generateForecasts } from '../api';
import { ForecastChart } from '../components/Charts/Charts';
import EmptyState from '../components/EmptyState/EmptyState';
import AnalysisMode from '../components/AnalysisMode/AnalysisMode';
import { withConfidenceBand } from '../utils/analytics';
import { exportToCsv, printReport } from '../utils/exporter';
import toast from 'react-hot-toast';
import './Forecasts.css';

// Prophet returns p10/p50/p90 directly in dailyBreakdown (from yhat_lower /
// yhat / yhat_upper). RF doesn't, so we derive a band heuristically from the
// confidence score for it.
function bandFor(forecast) {
  const daily = forecast.dailyBreakdown || [];
  const accuracy = forecast.modelAccuracy || forecast.confidence || 0;
  const hasNativeBand = daily.length > 0 && daily[0].p10 != null && daily[0].p90 != null;
  if (hasNativeBand) {
    return daily.map(d => ({
      ...d,
      p50: d.p50 ?? d.quantity,
      bandLow: d.bandLow ?? d.p10,
      bandRange: d.bandRange ?? Math.max(0, (d.p90 ?? 0) - (d.p10 ?? 0)),
    }));
  }
  return withConfidenceBand(daily, { confidence: accuracy });
}

const MODEL_LABEL = {
  rf:       'Random Forest',
  prophet:  'Prophet',
  fallback: 'Statistical Fallback',
  ema_trend: 'EMA + Trend',
  ema:      'Weighted Average',
};

function ForecastCard({ forecast }) {
  const [expanded, setExpanded] = useState(false);
  const fmt = (n) => n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${(n||0).toFixed(0)}`;
  const accuracy = forecast.modelAccuracy || forecast.confidence || 0;
  const color = accuracy >= 75 ? 'success' : accuracy >= 50 ? 'warning' : 'danger';
  
  const method = forecast.forecastMethod || 'ml';
  const modelKey = method === 'ml' ? (forecast.model || 'rf') : method;
  const modelLabel = MODEL_LABEL[modelKey] || 'Random Forest';

  const banded = bandFor(forecast);

  const totalP10 = banded.reduce((s, d) => s + (d.p10 || 0), 0);
  const totalP90 = banded.reduce((s, d) => s + (d.p90 || 0), 0);

  return (
    <div className="forecast-card">
      <div className="forecast-card-header">
        <div className="forecast-product">
          <div className="forecast-product-icon">📦</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h4 style={{ margin: 0 }}>{forecast.product}</h4>
              <span className={`method-badge method-badge--${method}`}>
                {method === 'ml' ? 'ML Model' : method === 'ema_trend' ? 'EMA + Trend' : 'Weighted Avg'}
              </span>
            </div>
            <span className="forecast-period">
              <Calendar size={12} /> {forecast.period || '30d'} forecast
            </span>
          </div>
        </div>
        <div className={`accuracy-badge accuracy-badge--${color}`}>
          <Target size={12} /> {accuracy.toFixed(0)}% accuracy
        </div>
      </div>

      <div className="forecast-stats">
        <div className="forecast-stat">
          <span className="forecast-stat-value">{Math.round(forecast.forecastedSales).toLocaleString()}</span>
          <span className="forecast-stat-label">Units Forecast (P50)</span>
        </div>
        <div className="forecast-stat">
          <span className="forecast-stat-value" style={{ color:'var(--success)' }}>{fmt(forecast.forecastedRevenue)}</span>
          <span className="forecast-stat-label">Revenue Forecast</span>
        </div>
        <div className="forecast-stat">
          <span className="forecast-stat-value" style={{ color:'var(--text-secondary)', fontSize:'0.95rem' }}>
            {Math.round(totalP10).toLocaleString()}–{Math.round(totalP90).toLocaleString()}
          </span>
          <span className="forecast-stat-label">P10 – P90 Range</span>
        </div>
      </div>

      <div className="confidence-bar-wrap">
        <div className="confidence-bar">
          <div className={`confidence-fill confidence-fill--${color}`} style={{ width:`${accuracy}%` }} />
        </div>
      </div>

      {method === 'ml' && banded.length > 0 && (
        <>
          <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
            {expanded ? <><ChevronUp size={15}/> Hide Forecast Band</> : <><ChevronDown size={15}/> Show P10/P50/P90 Band</>}
          </button>
          {expanded && (
            <div className="forecast-chart-wrap fade-in">
              <ForecastChart data={banded} showBand />
              <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:8, textAlign:'center' }}>
                {modelKey === 'prophet'
                  ? 'Shaded band shows Prophet’s 80% prediction interval (yhat_lower / yhat_upper).'
                  : 'Shaded band shows the 10th–90th percentile range from tree variance.'}
              </p>
            </div>
          )}
        </>
      )}

      <div className="forecast-generated">
        Generated {new Date(forecast.generatedAt).toLocaleDateString()} · {modelLabel}
      </div>
    </div>
  );
}

export default function Forecasts() {
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [model, setModel] = useState(() => localStorage.getItem('aiba:forecast-model') || 'rf');

  useEffect(() => { localStorage.setItem('aiba:forecast-model', model); }, [model]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getForecasts();
      setForecasts(data);
    } catch {
      toast.error('Failed to load forecasts.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    const loadingMsg = model === 'prophet'
      ? 'Fitting Prophet model… (this can take a moment)'
      : 'Training Random Forest model…';
    const id = toast.loading(loadingMsg);
    try {
      const res = await generateForecasts(undefined, model);
      toast.success(res.message || 'Forecasts generated!', { id });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Forecast generation failed.', { id });
    }
    setGenerating(false);
  };

  // Listen for command palette "Generate Forecasts" event
  useEffect(() => {
    const fn = () => handleGenerate();
    window.addEventListener('aiba:generate-forecasts', fn);
    return () => window.removeEventListener('aiba:generate-forecasts', fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalForecastedRevenue = forecasts.reduce((s,f) => s + (f.forecastedRevenue||0), 0);
  const totalForecastedSales   = forecasts.reduce((s,f) => s + (f.forecastedSales||0),   0);
  const avgAccuracy = forecasts.length
    ? (forecasts.reduce((s,f) => s + (f.modelAccuracy||f.confidence||0), 0) / forecasts.length).toFixed(0)
    : 0;

  const fmt = (n) => n >= 1000000 ? `$${(n/1000000).toFixed(2)}M` : n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${(n||0).toFixed(0)}`;

  const handleExportCsv = () => {
    if (forecasts.length === 0) return toast.error('No forecasts to export yet.');
    const rows = forecasts.map(f => ({
      product: f.product,
      period: f.period || '30d',
      forecasted_units: Math.round(f.forecastedSales || 0),
      forecasted_revenue: Math.round(f.forecastedRevenue || 0),
      accuracy_pct: (f.modelAccuracy || f.confidence || 0).toFixed(1),
      generated_at: new Date(f.generatedAt).toISOString(),
    }));
    exportToCsv(`forecasts-${new Date().toISOString().slice(0,10)}.csv`, rows);
    toast.success('CSV downloaded.');
  };

  const handlePrintReport = () => {
    if (forecasts.length === 0) return toast.error('No forecasts to report yet.');
    printReport({
      title: 'Forecast Report',
      subtitle: `30-day demand forecast across ${forecasts.length} product${forecasts.length>1?'s':''}`,
      sections: [
        { type: 'kpis', heading: 'Summary', items: [
          { label: 'Forecasted Revenue', value: fmt(totalForecastedRevenue) },
          { label: 'Forecasted Units',   value: Math.round(totalForecastedSales).toLocaleString() },
          { label: 'Avg Model Accuracy', value: `${avgAccuracy}%` },
          { label: 'Products',           value: forecasts.length },
        ]},
        { type: 'table', heading: 'Per-Product Forecast', columns: [
          { key:'product',  label:'Product' },
          { key:'units',    label:'Units' },
          { key:'revenue',  label:'Revenue' },
          { key:'accuracy', label:'Accuracy' },
          { key:'range',    label:'P10–P90' },
        ], rows: forecasts.map(f => {
          const banded = withConfidenceBand(f.dailyBreakdown || [], { confidence: f.modelAccuracy || f.confidence || 70 });
          const lo = Math.round(banded.reduce((s,d) => s+(d.p10||0), 0));
          const hi = Math.round(banded.reduce((s,d) => s+(d.p90||0), 0));
          return {
            product: f.product,
            units: Math.round(f.forecastedSales || 0).toLocaleString(),
            revenue: fmt(f.forecastedRevenue || 0),
            accuracy: `${(f.modelAccuracy || f.confidence || 0).toFixed(0)}%`,
            range: `${lo.toLocaleString()} – ${hi.toLocaleString()}`,
          };
        }) },
        { type: 'note', text: 'Forecasts are point estimates with a 80% confidence interval (P10/P90) computed from tree variance. Use for planning, not commitments.' },
      ],
    });
  };

  return (
    <div className="page-wrapper page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title shimmer-text">AI Forecasts</h1>
          <p className="page-subtitle">
            {model === 'prophet'
              ? 'Prophet (Meta) · trend + weekly/yearly seasonality with native 80% confidence intervals'
              : 'Random Forest with engineered time-series features · P10/P50/P90 from tree variance'}
          </p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <div className="model-toggle" role="tablist" aria-label="Forecasting model">
            <button
              role="tab"
              aria-selected={model === 'rf'}
              className={`model-toggle-btn ${model === 'rf' ? 'is-active' : ''}`}
              onClick={() => setModel('rf')}
              disabled={generating}
              title="Random Forest with engineered features"
            >
              <Cpu size={13}/> Random Forest
            </button>
            <button
              role="tab"
              aria-selected={model === 'prophet'}
              className={`model-toggle-btn ${model === 'prophet' ? 'is-active' : ''}`}
              onClick={() => setModel('prophet')}
              disabled={generating}
              title="Meta Prophet — purpose-built for time-series"
            >
              <BrainCircuit size={13}/> Prophet
            </button>
          </div>
          {forecasts.length > 0 && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
                <FileDown size={14}/> Export CSV
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handlePrintReport}>
                <FileText size={14}/> Print Report
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
            {generating
              ? <><div className="spinner" /> Generating…</>
              : <><Activity size={16}/> Generate Forecasts</>}
          </button>
        </div>
      </div>

      {/* Analysis Mode panel — manual / automatic + connector status */}
      <AnalysisMode onAfterRun={load} />

      {/* Summary KPIs */}
      {forecasts.length > 0 && (
        <div className="forecast-summary stagger">
          <div className="forecast-summary-card">
            <TrendingUp size={22} style={{ color:'var(--primary-light)' }} />
            <div>
              <div className="fs-value">{fmt(totalForecastedRevenue)}</div>
              <div className="fs-label">Total Forecasted Revenue (30d)</div>
            </div>
          </div>
          <div className="forecast-summary-card">
            <Target size={22} style={{ color:'var(--success)' }} />
            <div>
              <div className="fs-value">{Math.round(totalForecastedSales).toLocaleString()}</div>
              <div className="fs-label">Total Forecasted Units (30d)</div>
            </div>
          </div>
          <div className="forecast-summary-card">
            <Cpu size={22} style={{ color:'var(--accent)' }} />
            <div>
              <div className="fs-value">{avgAccuracy}%</div>
              <div className="fs-label">Average Model Accuracy</div>
            </div>
          </div>
          <div className="forecast-summary-card">
            <Calendar size={22} style={{ color:'var(--secondary)' }} />
            <div>
              <div className="fs-value">{forecasts.length}</div>
              <div className="fs-label">Products Forecasted</div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="forecasts-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="forecast-card">
              <span className="skeleton" style={{ display:'block', height:18, width:'60%', marginBottom:14 }} />
              <span className="skeleton" style={{ display:'block', height:60, marginBottom:12 }} />
              <span className="skeleton" style={{ display:'block', height:6, marginBottom:14 }} />
              <span className="skeleton" style={{ display:'block', height:32 }} />
            </div>
          ))}
        </div>
      ) : forecasts.length === 0 ? (
        <div className="card">
          <EmptyState
            illustration="forecast"
            title="No Forecasts Yet"
            message={`Upload your sales data first, then click "Generate Forecasts" to train the ${model === 'prophet' ? 'Prophet' : 'Random Forest'} model.`}
            action={
              <button className="btn btn-primary" onClick={handleGenerate} style={{ marginTop:8 }}>
                <Cpu size={16} /> Generate Now
              </button>
            }
          />
        </div>
      ) : (
        <div className="forecasts-grid stagger">
          {forecasts.map(f => <ForecastCard key={f._id} forecast={f} />)}
        </div>
      )}
    </div>
  );
}
