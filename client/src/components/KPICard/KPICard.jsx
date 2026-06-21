import AnimatedNumber from '../AnimatedNumber/AnimatedNumber';
import Sparkline from '../Sparkline/Sparkline';
import './KPICard.css';

const colorMap = {
  primary: '#818cf8',
  success: '#10b981',
  warning: '#f59e0b',
  purple:  '#a78bfa',
};

export default function KPICard({
  title, value, subtitle, icon: Icon, color = 'primary',
  trend, trendLabel, sparkline, numericValue, format,
  loading = false,
}) {
  const isPositive = parseFloat(trend) >= 0;

  if (loading) {
    return (
      <div className={`kpi-card kpi-card--${color}`}>
        <div className="kpi-header">
          <span className="skeleton" style={{ width: 90, height: 12, display: 'block' }} />
          <span className="skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
        </div>
        <span className="skeleton" style={{ width: 130, height: 28, display: 'block', marginBottom: 8 }} />
        <span className="skeleton" style={{ width: 80, height: 10, display: 'block' }} />
      </div>
    );
  }

  return (
    <div className={`kpi-card kpi-card--${color}`}>
      <div className="kpi-header">
        <span className="kpi-title">{title}</span>
        {Icon && (
          <div className={`kpi-icon kpi-icon--${color}`}>
            <Icon size={18} />
          </div>
        )}
      </div>
      <div className="kpi-value">
        {numericValue !== undefined && format ? (
          <AnimatedNumber value={numericValue} format={format} />
        ) : value}
      </div>
      {subtitle && <div className="kpi-subtitle">{subtitle}</div>}

      <div className="kpi-bottom">
        {trend !== undefined ? (
          <div className={`kpi-trend ${isPositive ? 'positive' : 'negative'}`}>
            <span>{isPositive ? '▲' : '▼'} {Math.abs(trend)}%</span>
            {trendLabel && <span className="kpi-trend-label">{trendLabel}</span>}
          </div>
        ) : <span />}
        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} color={colorMap[color]} />
        )}
      </div>
    </div>
  );
}
