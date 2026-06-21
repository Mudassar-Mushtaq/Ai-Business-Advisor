import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plug, RefreshCw, Trash2, FileSpreadsheet, Plus, CheckCircle2, AlertCircle, ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listConnectors,
  startGoogleSheetsConnect,
  updateConnectorConfig,
  syncConnector,
  deleteConnector,
} from '../api';
import './Connections.css';

const PROVIDER_META = {
  google_sheets: {
    label: 'Google Sheets',
    icon: FileSpreadsheet,
    blurb: 'Live sync from a Google Sheet. We pull new rows on a schedule.',
  },
};

function relTime(d) {
  if (!d) return 'never';
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function ConnectorCard({ connector, onChanged }) {
  const meta = PROVIDER_META[connector.provider] || { label: connector.provider, icon: Plug };
  const Icon = meta.icon;
  const [sheetId, setSheetId] = useState(connector.config?.sheetId || '');
  const [range, setRange] = useState(connector.config?.range || 'A:Z');
  const [interval, setInterval] = useState(connector.intervalMinutes || 15);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const save = async () => {
    if (!sheetId.trim()) return toast.error('Sheet ID is required');
    setSaving(true);
    try {
      await updateConnectorConfig(connector._id, {
        sheetId: sheetId.trim(),
        range: range.trim() || 'A:Z',
        intervalMinutes: Number(interval) || 15,
      });
      toast.success('Configuration saved');
      onChanged();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await syncConnector(connector._id);
      toast.success(`Synced ${r.rowsImported} rows (${r.totalRowsSeen} seen)`);
      onChanged();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    if (!confirm(`Disconnect ${meta.label}? Your imported sales data will remain.`)) return;
    try {
      await deleteConnector(connector._id);
      toast.success('Disconnected');
      onChanged();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Disconnect failed');
    }
  };

  const statusColor =
    connector.status === 'connected' ? 'var(--success, #10b981)' :
    connector.status === 'error' ? 'var(--danger, #ef4444)' : 'var(--text-secondary)';

  return (
    <div className="connector-card">
      <div className="connector-card-head">
        <div className="connector-card-title">
          <div className="connector-icon"><Icon size={20} /></div>
          <div>
            <h3>{meta.label}</h3>
            <p style={{ color: statusColor, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {connector.status === 'connected' && <CheckCircle2 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
              {connector.status === 'error' && <AlertCircle size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
              {connector.status}
            </p>
          </div>
        </div>
        <button className="btn-icon-danger" onClick={disconnect} title="Disconnect">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="connector-card-body">
        <label>
          <span>Sheet ID</span>
          <input
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
            placeholder="1AbC...xyz (from the sheet's URL)"
          />
          <small>
            Open your sheet → copy the long ID in the URL between <code>/d/</code> and <code>/edit</code>.
          </small>
        </label>

        <label>
          <span>Range</span>
          <input
            value={range}
            onChange={(e) => setRange(e.target.value)}
            placeholder="Sheet1!A:Z"
          />
          <small>Default <code>A:Z</code>. First row must be headers (Date, Product, Quantity, Revenue, ...).</small>
        </label>

        <label>
          <span>Sync every (minutes)</span>
          <input
            type="number"
            min={5}
            max={1440}
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          />
        </label>

        {connector.lastError && (
          <div className="connector-error">
            <AlertCircle size={14} /> {connector.lastError}
          </div>
        )}

        <div className="connector-meta">
          <span>Last sync: <strong>{relTime(connector.lastSyncAt)}</strong></span>
          <span>Last batch: <strong>{connector.lastSyncRows ?? 0} rows</strong></span>
          <span>Total syncs: <strong>{connector.syncCount ?? 0}</strong></span>
        </div>

        <div className="connector-actions">
          <button className="btn-secondary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save config'}
          </button>
          <button className="btn-primary" onClick={sync} disabled={syncing || !connector.config?.sheetId}>
            <RefreshCw size={14} className={syncing ? 'spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Connections() {
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [params, setParams] = useSearchParams();

  const refresh = async () => {
    try {
      const { connectors } = await listConnectors();
      setConnectors(connectors);
    } catch (err) {
      toast.error('Failed to load connectors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // Handle the OAuth callback redirect
  useEffect(() => {
    const status = params.get('status');
    if (status === 'connected') {
      toast.success('Google Sheets connected — now configure the sheet ID below.');
      setParams({}, { replace: true });
      refresh();
    } else if (status === 'error') {
      toast.error(`Connection failed: ${params.get('reason') || 'unknown error'}`);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const connectGoogleSheets = async () => {
    setConnecting(true);
    try {
      const { url } = await startGoogleSheetsConnect();
      window.location.href = url;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not start OAuth flow');
      setConnecting(false);
    }
  };

  const hasGoogleSheets = connectors.some((c) => c.provider === 'google_sheets');

  return (
    <main className="page connections-page">
      <header className="page-header">
        <div>
          <h1>Connections</h1>
          <p className="page-subtitle">Pull live data from your business tools — no more weekly CSVs.</p>
        </div>
      </header>

      <section className="connections-providers">
        <div className="provider-row">
          <div className="provider-info">
            <FileSpreadsheet size={28} />
            <div>
              <h3>Google Sheets</h3>
              <p>Live sync from any Google Sheet. New rows are pulled automatically.</p>
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={connectGoogleSheets}
            disabled={connecting || hasGoogleSheets}
            title={hasGoogleSheets ? 'Already connected' : ''}
          >
            <Plus size={14} />
            {hasGoogleSheets ? 'Connected' : connecting ? 'Redirecting…' : 'Connect'}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 16 }}>Your connections</h2>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : connectors.length === 0 ? (
          <div className="empty-state-card">
            <Plug size={32} />
            <h3>No connections yet</h3>
            <p>Connect Google Sheets above to start pulling live data.</p>
          </div>
        ) : (
          <div className="connector-grid">
            {connectors.map((c) => (
              <ConnectorCard key={c._id} connector={c} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>

      <section className="connections-help">
        <h3>How Google Sheets sync works</h3>
        <ol>
          <li>Click <strong>Connect</strong> above and grant read access to your Google account.</li>
          <li>Paste your sheet ID and (optionally) a range like <code>Sheet1!A:Z</code>.</li>
          <li>Make sure row 1 has headers — supported names: <code>Date</code>, <code>Product</code>, <code>Quantity</code>, <code>Revenue</code>, <code>Category</code>, <code>Cost</code>, <code>Region</code>.</li>
          <li>Click <strong>Sync now</strong> for an immediate pull, or wait for the schedule.</li>
        </ol>
        <p>
          <ExternalLink size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Your tokens are encrypted at rest with AES-256-GCM. We only request read-only access.
        </p>
      </section>
    </main>
  );
}
