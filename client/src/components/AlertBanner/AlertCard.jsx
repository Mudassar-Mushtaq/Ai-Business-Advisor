import { AlertOctagon, AlertTriangle, Info, X, Clock, ShoppingCart } from 'lucide-react';
import { getAlertMeta, timeAgo } from '../../utils/alerts';
import './AlertCard.css';

const SEVERITY_ICONS = {
  critical: AlertOctagon,
  warning:  AlertTriangle,
  info:     Info,
};

const SEVERITY_LABELS = {
  critical: 'Critical',
  warning:  'Warning',
  info:     'Info',
};

export default function AlertCard({
  alert,
  compact = false,
  onDismiss,
  onReorder,
  className = '',
}) {
  if (!alert) return null;
  const meta = getAlertMeta(alert.type);
  const SeverityIcon = SEVERITY_ICONS[alert.severity] || Info;
  const canReorder = alert.type === 'low_stock' && typeof onReorder === 'function';

  return (
    <article
      className={[
        'alert-card-v2',
        `alert-card-v2--${alert.severity || 'info'}`,
        compact ? 'alert-card-v2--compact' : '',
        alert.read ? 'alert-card-v2--read' : '',
        className,
      ].join(' ').trim()}
    >
      <div className="alert-card-v2__accent" aria-hidden="true" />

      <div className="alert-card-v2__icon">
        <span className="alert-card-v2__emoji" aria-hidden="true">{meta.icon}</span>
        <SeverityIcon size={12} className="alert-card-v2__sev-badge" aria-hidden="true" />
      </div>

      <div className="alert-card-v2__body">
        <div className="alert-card-v2__head">
          <h4 className="alert-card-v2__title" title={alert.title}>{alert.title}</h4>
          <span className={`alert-card-v2__pill alert-card-v2__pill--${alert.severity || 'info'}`}>
            {SEVERITY_LABELS[alert.severity] || 'Alert'}
          </span>
        </div>
        <p className="alert-card-v2__msg">{alert.message}</p>
        <div className="alert-card-v2__meta">
          <span className="alert-card-v2__tag">{meta.label}</span>
          {alert.createdAt && (
            <span className="alert-card-v2__time">
              <Clock size={11} /> {timeAgo(alert.createdAt)}
            </span>
          )}
          {!alert.read && alert.source === 'notification' && (
            <span className="alert-card-v2__dot" title="Unread" />
          )}
          {canReorder && (
            <button
              type="button"
              className="alert-card-v2__action"
              onClick={() => onReorder(alert)}
              title="Create a draft purchase order for this product"
            >
              <ShoppingCart size={12} /> Reorder
            </button>
          )}
        </div>
      </div>

      {onDismiss && (
        <button
          type="button"
          className="alert-card-v2__dismiss"
          onClick={() => onDismiss(alert)}
          aria-label="Mark as read"
          title="Mark as read"
        >
          <X size={14} />
        </button>
      )}
    </article>
  );
}
