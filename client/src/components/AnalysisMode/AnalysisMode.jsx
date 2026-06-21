import { useEffect, useMemo, useState } from 'react';
import {
  Cpu, Hand, Zap, Pause, Play, RefreshCw, Clock, Database, Sheet,
  CheckCircle2, AlertCircle, ChevronRight, Settings2, Activity, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getAutoAnalysis, updateAutoAnalysis, runAutoAnalysisNow,
  startGoogleSheetsConnect, syncConnectorNow,
} from '../../api';
import './AnalysisMode.css';

const INTERVAL_OPTIONS = [
  { hours: 1,  label: '1h'  },
  { hours: 3,  label: '3h'  },
  { hours: 6,  label: '6h'  },
  { hours: 12, label: '12h' },
  { hours: 24, label: '24h' },
];

const HORIZON_OPTIONS = [
  { days: 7,  label: '7d'  },
  { days: 14, label: '14d' },
  { days: 30, label: '30d' },
  { days: 60, label: '60d' },
  { days: 90, label: '90d' },
];

function relativeTime(date) {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const min = Math.round(abs / 60000);
  if (min < 1) return future ? 'in <1 min' : 'just now';
  if (min < 60) return future ? `in ${min} min` : `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return future ? `in ${hr}h` : `${hr}h ago`;
  const day = Math.round(hr / 24);
  return future ? `in ${day}d` : `${day}d ago`;
}

function statusTone(status) {
  if (status === 'success') return 'success';
  if (status === 'error')   return 'danger';
  if (status === 'skipped') return 'muted';
  return 'muted';
}

function CountdownPill({ nextRunAt, paused }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (paused || !nextRunAt) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [nextRunAt, paused]);

  if (paused)      return <span className="am-pill am-pill--muted"><Pause size={12} /> Paused</span>;
  if (!nextRunAt)  return <span className="am-pill am-pill--muted"><Clock size={12} /> —</span>;

  const ms = new Date(nextRunAt).getTime() - Date.now();
  if (ms <= 0) return <span className="am-pill am-pill--info"><Zap size={12}/> Running soon…</span>;

  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const fmt = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return <span className="am-pill am-pill--info"><Clock size={12} /> Next run in {fmt}</span>;
}

function ConnectorRow({ connector, onSync }) {
  const isGS = connector.provider === 'google_sheets';
  const [busy, setBusy] = useState(false);
  const handleSync = async () => {
    setBusy(true);
    try { await onSync(connector._id); } finally { setBusy(false); }
  };
  const tone = connector.status === 'connected' ? 'success' : connector.status === 'error' ? 'danger' : 'muted';
  return (
    <div className="am-connector">
      <div className="am-connector-icon"><Sheet size={18} /></div>
      <div className="am-connector-body">
        <div className="am-connector-title">
          {isGS ? 'Google Sheets' : connector.provider}
          {connector.label ? <span className="am-connector-label"> · {connector.label}</span> : null}
        </div>
        <div className="am-connector-meta">
          {connector.configured ? (
            <>
              <span className={`am-dot am-dot--${tone}`} />
              {connector.status === 'connected' ? 'Connected' : connector.status === 'error' ? 'Error' : connector.status}
              {connector.lastSyncAt && <> · synced {relativeTime(connector.lastSyncAt)}</>}
              {connector.lastSyncRows !== undefined && <> · {connector.lastSyncRows} rows</>}
              <> · every {connector.intervalMinutes}m</>
            </>
          ) : (
            <>
              <span className="am-dot am-dot--warning" />
              Authenticated — needs sheet ID
            </>
          )}
        </div>
        {connector.lastError && (
          <div className="am-connector-error"><AlertCircle size={12}/> {connector.lastError}</div>
        )}
      </div>
      <button
        className="btn btn-secondary btn-sm"
        onClick={handleSync}
        disabled={!connector.configured || busy}
        title={connector.configured ? 'Sync now' : 'Configure sheet ID first'}
      >
        {busy ? <div className="spinner" /> : <RefreshCw size={13}/>} Sync
      </button>
    </div>
  );
}

export default function AnalysisMode({ onAfterRun }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState(null);
  const [running, setRunning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = async () => {
    try {
      const res = await getAutoAnalysis();
      setData(res);
    } catch {
      toast.error('Failed to load analysis settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Live status: while auto mode is enabled, refresh every 30s so countdown + last-run stay fresh.
  useEffect(() => {
    if (!data?.config?.enabled || data?.config?.mode !== 'auto') return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.config?.enabled, data?.config?.mode]);

  const update = async (patch, fieldKey) => {
    setSavingField(fieldKey || 'config');
    try {
      const res = await updateAutoAnalysis(patch);
      setData((d) => ({ ...d, config: res.config }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update settings.');
    } finally {
      setSavingField(null);
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    const id = toast.loading('Running forecast on latest data…');
    try {
      const res = await runAutoAnalysisNow();
      const r = res.result;
      if (r.status === 'success') {
        toast.success(`Forecast ready · ${r.productsForecasted} product(s) analyzed`, { id });
      } else if (r.status === 'skipped') {
        toast(`Skipped: ${r.reason || 'nothing new to analyze'}`, { id, icon: 'ℹ️' });
      } else {
        toast.error('Forecast run finished with an issue.', { id });
      }
      setData((d) => ({ ...d, config: res.config }));
      if (onAfterRun) await onAfterRun();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Run failed.', { id });
    } finally {
      setRunning(false);
    }
  };

  const handleConnectGoogleSheets = async () => {
    try {
      const { url } = await startGoogleSheetsConnect();
      window.location.href = url;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not start Google sign-in.');
    }
  };

  const handleSyncConnector = async (id) => {
    const tid = toast.loading('Syncing Google Sheet…');
    try {
      await syncConnectorNow(id);
      toast.success('Synced.', { id: tid });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sync failed.', { id: tid });
    }
  };

  const sheetsConnector = useMemo(
    () => (data?.connectors || []).find((c) => c.provider === 'google_sheets'),
    [data]
  );

  if (loading) {
    return (
      <div className="am-card">
        <span className="skeleton" style={{ display:'block', height:24, width:'40%', marginBottom:14 }} />
        <span className="skeleton" style={{ display:'block', height:64, marginBottom:12 }} />
        <span className="skeleton" style={{ display:'block', height:80 }} />
      </div>
    );
  }

  const cfg = data.config;
  const isAuto = cfg.mode === 'auto';
  const isRunning = isAuto && cfg.enabled;

  return (
    <div className={`am-card am-card--${isAuto ? 'auto' : 'manual'}`}>
      {/* Header */}
      <div className="am-header">
        <div className="am-header-left">
          <div className={`am-mode-icon am-mode-icon--${isAuto ? 'auto' : 'manual'}`}>
            {isAuto ? <Cpu size={20} /> : <Hand size={20} />}
          </div>
          <div>
            <div className="am-title">
              Analysis Mode
              <span className={`am-mode-badge am-mode-badge--${isAuto ? 'auto' : 'manual'}`}>
                {isAuto ? <><Sparkles size={11}/> AUTOMATIC</> : <><Hand size={11}/> MANUAL</>}
              </span>
            </div>
            <div className="am-subtitle">
              {isAuto
                ? `Re-running forecast every ${cfg.intervalHours}h · predicting next ${cfg.forecastDays} days`
                : 'Forecasts run only when you click Generate.'}
            </div>
          </div>
        </div>
        {isAuto && (
          <div className="am-header-right">
            <CountdownPill nextRunAt={cfg.nextRunAt} paused={!cfg.enabled} />
            {cfg.lastStatus && (
              <span className={`am-pill am-pill--${statusTone(cfg.lastStatus)}`}>
                {cfg.lastStatus === 'success' && <CheckCircle2 size={12}/>}
                {cfg.lastStatus === 'error'   && <AlertCircle  size={12}/>}
                {cfg.lastStatus === 'skipped' && <ChevronRight size={12}/>}
                Last run: {cfg.lastStatus} · {relativeTime(cfg.lastRunAt) || '—'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Mode toggle */}
      <div className="am-mode-toggle" role="tablist">
        <button
          role="tab"
          aria-selected={!isAuto}
          className={`am-mode-tab ${!isAuto ? 'am-mode-tab--active' : ''}`}
          onClick={() => update({ mode: 'manual', enabled: false }, 'mode')}
          disabled={savingField === 'mode'}
        >
          <Hand size={15}/>
          <div className="am-mode-tab-text">
            <strong>Manual</strong>
            <small>I'll click Generate when I need it</small>
          </div>
        </button>
        <button
          role="tab"
          aria-selected={isAuto}
          className={`am-mode-tab ${isAuto ? 'am-mode-tab--active' : ''}`}
          onClick={() => update({ mode: 'auto', enabled: true }, 'mode')}
          disabled={savingField === 'mode'}
        >
          <Cpu size={15}/>
          <div className="am-mode-tab-text">
            <strong>Automatic</strong>
            <small>Re-analyze in the background on a schedule</small>
          </div>
          <span className="am-mode-tab-shine" />
        </button>
      </div>

      {/* AUTO controls */}
      {isAuto && (
        <div className="am-auto-grid fade-in">
          <div className="am-control">
            <label className="am-control-label">
              <Clock size={13}/> Re-analyze every
            </label>
            <div className="am-segment">
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.hours}
                  className={`am-segment-btn ${cfg.intervalHours === opt.hours ? 'am-segment-btn--active' : ''}`}
                  onClick={() => update({ intervalHours: opt.hours }, 'interval')}
                  disabled={savingField === 'interval'}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="am-control">
            <label className="am-control-label">
              <Activity size={13}/> Forecast horizon
            </label>
            <div className="am-segment">
              {HORIZON_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  className={`am-segment-btn ${cfg.forecastDays === opt.days ? 'am-segment-btn--active' : ''}`}
                  onClick={() => update({ forecastDays: opt.days }, 'horizon')}
                  disabled={savingField === 'horizon'}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="am-actions">
            <button
              className={`am-pause-btn ${cfg.enabled ? 'am-pause-btn--running' : 'am-pause-btn--paused'}`}
              onClick={() => update({ enabled: !cfg.enabled }, 'pause')}
              disabled={savingField === 'pause'}
            >
              {cfg.enabled ? <><Pause size={14}/> Pause auto-runs</> : <><Play size={14}/> Resume</>}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleRunNow} disabled={running}>
              {running ? <><div className="spinner"/> Running…</> : <><Zap size={14}/> Run now</>}
            </button>
          </div>

          <button
            type="button"
            className="am-advanced-toggle"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <Settings2 size={12}/> {showAdvanced ? 'Hide' : 'Show'} advanced
          </button>

          {showAdvanced && (
            <div className="am-advanced fade-in">
              <label className="am-control-label">
                <Database size={13}/> Skip run if fewer than
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={cfg.minNewRowsToRun}
                  onChange={(e) => update({ minNewRowsToRun: Number(e.target.value) || 0 }, 'minrows')}
                  className="am-num-input"
                />
                new sales rows arrived since last run
              </label>
              <p className="am-hint">
                Saves compute when nothing in the data has changed. Currently {data.salesRowCount} rows total in your database.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Live activity strip — only shown in auto */}
      {isAuto && cfg.runHistory?.length > 0 && (
        <div className="am-history fade-in">
          <div className="am-history-title">
            <Activity size={13}/> Recent runs
          </div>
          <ul className="am-history-list">
            {cfg.runHistory.slice(0, 5).map((r, i) => (
              <li key={i} className={`am-history-item am-history-item--${statusTone(r.status)}`}>
                <span className={`am-dot am-dot--${statusTone(r.status)}`} />
                <span className="am-history-when">{relativeTime(r.ranAt)}</span>
                <span className="am-history-status">{r.status}</span>
                <span className="am-history-meta">
                  {r.status === 'success' && `${r.productsForecasted} products · ${r.forecastDays}d horizon`}
                  {r.status === 'skipped' && `${r.reason || 'skipped'}`}
                  {r.status === 'error'   && `${r.reason || 'error'}`}
                  {r.newRowsSeen > 0 && r.status !== 'skipped' && ` · ${r.newRowsSeen} new rows`}
                </span>
                <span className="am-history-trigger">{r.trigger}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Connector / data source panel */}
      <div className="am-connectors">
        <div className="am-connectors-title">
          <Database size={13}/> Data source
          <span className="am-connectors-count">{data.salesRowCount} rows</span>
        </div>

        {sheetsConnector ? (
          <ConnectorRow connector={sheetsConnector} onSync={handleSyncConnector} />
        ) : (
          <div className="am-connect-cta">
            <div className="am-connect-cta-icon"><Sheet size={20}/></div>
            <div className="am-connect-cta-body">
              <strong>Connect Google Sheets</strong>
              <p>Auto-pull the latest sales rows from a sheet — every {sheetsConnector?.intervalMinutes || 15} minutes by default.</p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleConnectGoogleSheets}>
              Connect <ChevronRight size={14}/>
            </button>
          </div>
        )}

        <p className="am-connectors-hint">
          {isAuto
            ? 'On each tick the scheduler re-trains the forecast using whatever sales data is in your database — uploaded CSVs and synced sheet rows alike.'
            : 'Switch to Automatic mode to keep forecasts fresh as new sales data arrives.'}
        </p>
      </div>
    </div>
  );
}
