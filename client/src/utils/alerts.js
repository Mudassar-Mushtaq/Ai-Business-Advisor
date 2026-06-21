// Shared helpers for normalizing alerts coming from different sources
// (server-side stored notifications + client-derived anomalies) into one shape.

export const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

export const ALERT_META = {
  low_stock:      { label: 'Low stock',        icon: '📦', kind: 'inventory'  },
  high_sales:     { label: 'Sales surge',      icon: '🚀', kind: 'sales'      },
  forecast_ready: { label: 'Forecast ready',   icon: '🤖', kind: 'ai'         },
  anomaly:        { label: 'Anomaly',          icon: '👀', kind: 'analytics'  },
  goal_off_track: { label: 'Goal off track',   icon: '🎯', kind: 'goals'      },
  goal_achieved:  { label: 'Goal achieved',    icon: '🏆', kind: 'goals'      },
};

export function getAlertMeta(type) {
  return ALERT_META[type] || { label: 'Alert', icon: '🔔', kind: 'general' };
}

export function timeAgo(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (Number.isNaN(diff) || diff < 0) return '';
  if (diff < 60)      return 'just now';
  if (diff < 3600)    return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800)  return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

/**
 * Merge stored notifications and client-side anomalies into a unified list,
 * sorted by severity then recency. Each entry has:
 *   { id, source, type, severity, title, message, createdAt, read, meta }
 */
export function buildUnifiedAlerts(notifications = [], anomalies = []) {
  const fromNotifications = (notifications || []).map(n => ({
    id: n._id || `notif-${n.createdAt}`,
    source: 'notification',
    type: n.type,
    severity: n.severity || 'info',
    title: n.title,
    message: n.message,
    createdAt: n.createdAt || new Date().toISOString(),
    read: !!n.read,
    meta: { product: n.product, value: n.value },
  }));

  const fromAnomalies = (anomalies || []).map(a => ({
    id: `anom-${a.date}-${a.direction}`,
    source: 'anomaly',
    type: 'anomaly',
    severity: a.severity || 'warning',
    title: `${a.direction === 'spike' ? 'Sales spike' : 'Sales drop'} on ${a.date}`,
    message:
      `${a.direction === 'spike' ? 'Revenue jumped' : 'Revenue fell'} ` +
      `${Math.abs(a.pct)}% vs the prior 7-day average (z=${a.z}). ` +
      `Investigate and confirm before acting.`,
    createdAt: a.date ? new Date(a.date).toISOString() : new Date().toISOString(),
    read: false,
    meta: { direction: a.direction, pct: a.pct, z: a.z, value: a.value },
  }));

  return [...fromNotifications, ...fromAnomalies].sort((a, b) => {
    const s = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (s !== 0) return s;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}
