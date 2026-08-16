import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BellRing, AlertOctagon, AlertTriangle, Info, CheckCircle2,
  RefreshCw, ChevronLeft, Filter, Search, Inbox, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getNotifications, markNotificationRead, markAllNotificationsRead, getSalesTrend,
} from '../api';
import AlertCard from '../components/AlertBanner/AlertCard';
import EmptyState from '../components/EmptyState/EmptyState';
import ReorderModal from '../components/ReorderModal/ReorderModal';
import { detectRevenueAnomalies } from '../utils/analytics';
import { buildUnifiedAlerts } from '../utils/alerts';
import './Alerts.css';

const SEVERITY_TABS = [
  { key: 'all',      label: 'All',      icon: Filter },
  { key: 'critical', label: 'Critical', icon: AlertOctagon },
  { key: 'warning',  label: 'Warning',  icon: AlertTriangle },
  { key: 'info',     label: 'Info',     icon: Info },
];

export default function Alerts() {
  const [notifications, setNotifications] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [showRead, setShowRead] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [reorderTarget, setReorderTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [notifs, trend] = await Promise.all([
        getNotifications().catch(() => []),
        getSalesTrend(30).catch(() => []),
      ]);
      setNotifications(notifs || []);
      setAnomalies(detectRevenueAnomalies(trend || []));
    } catch {
      toast.error('Failed to load alerts.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const unified = useMemo(
    () => buildUnifiedAlerts(notifications, anomalies),
    [notifications, anomalies]
  );

  const stats = useMemo(() => ({
    total:    unified.length,
    critical: unified.filter(a => a.severity === 'critical').length,
    warning:  unified.filter(a => a.severity === 'warning').length,
    info:     unified.filter(a => a.severity === 'info').length,
    unread:   unified.filter(a => !a.read).length,
  }), [unified]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return unified.filter(a => {
      if (tab !== 'all' && a.severity !== tab) return false;
      if (!showRead && a.read) return false;
      if (q && !(`${a.title} ${a.message}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [unified, tab, showRead, query]);

  const dismissOne = async (alert) => {
    if (alert.source !== 'notification') {
      // anomalies are client-derived — just hide locally
      setAnomalies(prev => prev.filter(a => `anom-${a.date}-${a.direction}` !== alert.id));
      window.dispatchEvent(new Event('aiba:notifications-updated'));
      return;
    }
    setNotifications(prev => prev.map(n => n._id === alert.id ? { ...n, read: true } : n));
    try {
      await markNotificationRead(alert.id);
      window.dispatchEvent(new Event('aiba:notifications-updated'));
    } catch {
      toast.error('Could not mark as read.');
    }
  };

  const markAllRead = async () => {
    const targets = notifications.filter(n => !n.read);
    if (targets.length === 0) return;
    setBusy(true);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await markAllNotificationsRead();
      toast.success(`Marked all notifications as read.`);
      window.dispatchEvent(new Event('aiba:notifications-updated'));
    } catch {
      toast.error('Could not mark all as read.');
    }
    setBusy(false);
  };

  return (
    <div className="page-wrapper page-enter alerts-page">
      <div className="page-header">
        <div>
          <Link to="/dashboard" className="alerts-page__back">
            <ChevronLeft size={14} /> Back to dashboard
          </Link>
          <h1 className="page-title">
            <BellRing size={22} style={{ verticalAlign: '-4px', marginRight: 8 }} />
            Alerts &amp; Notifications
          </h1>
          <p className="page-subtitle">
            Everything your AI advisor is watching — anomalies, low stock, forecasts, and more.
          </p>
        </div>
        <div className="dashboard-controls" style={{ flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={markAllRead}
            disabled={busy || stats.unread === 0}
            title="Mark all notifications as read"
          >
            <CheckCircle2 size={14} /> Mark all read
          </button>
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="alerts-summary">
        <SummaryTile label="Total"    value={stats.total}    tone="primary" icon={<BellRing size={16} />} />
        <SummaryTile label="Critical" value={stats.critical} tone="danger"  icon={<AlertOctagon size={16} />} />
        <SummaryTile label="Warning"  value={stats.warning}  tone="warning" icon={<AlertTriangle size={16} />} />
        <SummaryTile label="Info"     value={stats.info}     tone="info"    icon={<Info size={16} />} />
        <SummaryTile label="Unread"   value={stats.unread}   tone="purple"  icon={<Inbox size={16} />} />
      </div>

      {/* Filters */}
      <div className="alerts-toolbar">
        <div className="alerts-tabs" role="tablist" aria-label="Severity filter">
          {SEVERITY_TABS.map(({ key, label, icon: Icon }) => {
            const count = key === 'all' ? stats.total : stats[key];
            return (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                className={`alerts-tab ${tab === key ? 'alerts-tab--active' : ''} alerts-tab--${key}`}
                onClick={() => setTab(key)}
              >
                <Icon size={14} />
                <span>{label}</span>
                <span className="alerts-tab__count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="alerts-toolbar__right">
          <label className="alerts-search">
            <Search size={14} />
            <input
              type="search"
              placeholder="Search alerts…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
          <label className={`alerts-toggle-switch ${showRead ? 'alerts-toggle-switch--active' : ''}`} title="Toggle read alerts visibility">
            <input
              type="checkbox"
              checked={showRead}
              onChange={e => setShowRead(e.target.checked)}
              aria-label="Show read alerts"
            />
            <span className="alerts-toggle-switch__slider">
              <span className="alerts-toggle-switch__thumb">
                {showRead && <Check size={10} strokeWidth={3} />}
              </span>
            </span>
            <span className="alerts-toggle-switch__label">Show read</span>
          </label>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="alerts-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton alerts-skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          illustration="check"
          title={unified.length === 0 ? "You're all caught up" : 'No alerts match these filters'}
          message={unified.length === 0
            ? 'No active alerts right now — keep an eye here for AI-detected issues.'
            : 'Try clearing the search box or switching the severity tab.'}
        />
      ) : (
        <div className="alerts-list">
          {filtered.map(a => (
            <AlertCard
              key={a.id}
              alert={a}
              onDismiss={a.source === 'notification' && !a.read ? dismissOne : undefined}
              onReorder={a.type === 'low_stock' ? setReorderTarget : undefined}
            />
          ))}
        </div>
      )}

      <ReorderModal
        open={!!reorderTarget}
        alert={reorderTarget}
        onClose={() => setReorderTarget(null)}
        onCreated={() => {
          // The server marks the source alert read — refresh to reflect that.
          load();
        }}
      />
    </div>
  );
}

function SummaryTile({ label, value, tone = 'primary', icon }) {
  return (
    <div className={`alerts-summary__tile alerts-summary__tile--${tone}`}>
      <div className="alerts-summary__icon">{icon}</div>
      <div className="alerts-summary__body">
        <div className="alerts-summary__value">{value}</div>
        <div className="alerts-summary__label">{label}</div>
      </div>
    </div>
  );
}
