import { Target, TrendingUp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import './GoalProgressCard.css';

const METRIC_LABELS = {
  revenue:         'Revenue',
  product_revenue: 'Product Revenue',
  orders:          'Orders',
  units:           'Units Sold',
  profit:          'Gross Profit',
  stockouts_max:   'Max Stockouts',
};

const CURRENCY_METRICS = new Set(['revenue', 'product_revenue', 'profit']);

function formatValue(metric, value) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (CURRENCY_METRICS.has(metric)) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000)     return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  }
  return Math.round(value).toLocaleString();
}

function statusFlavor(progress) {
  if (progress.status === 'achieved')          return { tone: 'success', icon: CheckCircle2, label: 'Achieved' };
  if (progress.status === 'missed')            return { tone: 'danger',  icon: AlertTriangle, label: 'Missed' };
  if (progress.daysLeft === 0)                 return { tone: 'muted',   icon: Clock,        label: 'Period over' };
  if (!progress.onTrack)                       return { tone: 'warning', icon: AlertTriangle, label: 'Off track' };
  return                                              { tone: 'success', icon: TrendingUp,    label: 'On track' };
}

export default function GoalProgressCard({ progress, compact = false, onEdit, onDelete }) {
  const flavor = statusFlavor(progress);
  const Icon = flavor.icon;
  const inverted = progress.inverted;
  const pct = Math.min(progress.percent, 100);
  const paceMarker = Math.min(progress.paceTargetPercent, 100);

  return (
    <div className={`goal-card goal-card--${flavor.tone} ${compact ? 'goal-card--compact' : ''}`}>
      <div className="goal-card__head">
        <div className="goal-card__title">
          <Target size={16} />
          <span>{progress.label}</span>
        </div>
        <span className={`goal-card__pill goal-card__pill--${flavor.tone}`}>
          <Icon size={12} /> {flavor.label}
        </span>
      </div>

      <div className="goal-card__values">
        <span className="goal-card__current">{formatValue(progress.metric, progress.current)}</span>
        <span className="goal-card__sep">of</span>
        <span className="goal-card__target">{formatValue(progress.metric, progress.target)}</span>
        <span className="goal-card__metric-label">{METRIC_LABELS[progress.metric]}</span>
      </div>

      <div className="goal-card__bar-wrap">
        <div className="goal-card__bar">
          <div
            className={`goal-card__bar-fill goal-card__bar-fill--${flavor.tone}`}
            style={{ width: `${pct}%` }}
          />
          {!inverted && progress.daysLeft > 0 && (
            <div className="goal-card__bar-pace" style={{ left: `${paceMarker}%` }} title={`Pace target: ${paceMarker}%`} />
          )}
        </div>
        <div className="goal-card__bar-meta">
          <span>{progress.percent}%</span>
          <span>
            {progress.daysLeft > 0
              ? `${progress.daysLeft} day${progress.daysLeft === 1 ? '' : 's'} left`
              : 'Period ended'}
          </span>
        </div>
      </div>

      {!compact && (
        <div className="goal-card__foot">
          {progress.productFilter && (
            <span className="goal-card__chip">{progress.productFilter}</span>
          )}
          <span className="goal-card__chip goal-card__chip--muted">{progress.period}</span>
          {!inverted && progress.projected != null && progress.daysLeft > 0 && (
            <span className="goal-card__chip">
              Projected: {formatValue(progress.metric, progress.projected)}
            </span>
          )}
          <div className="goal-card__actions">
            {onEdit && (
              <button className="btn btn-ghost btn-xs" onClick={() => onEdit(progress)}>Edit</button>
            )}
            {onDelete && (
              <button className="btn btn-ghost btn-xs goal-card__delete" onClick={() => onDelete(progress)}>Delete</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
