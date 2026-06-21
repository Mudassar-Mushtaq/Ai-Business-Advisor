import { useEffect, useMemo, useState } from 'react';
import { X, Sparkles, Sliders, TrendingUp, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { updateInventoryAlertConfig } from '../../api';
import './AlertConfigPanel.css';

// Mirrors the server formula so the user sees the recommendation update live
// without a round-trip while they tweak the sliders.
function computeRecommended({ forecasted30dQty, leadTimeDays, safetyStockPct }) {
  if (!Number.isFinite(forecasted30dQty) || forecasted30dQty <= 0) return null;
  const daily = forecasted30dQty / 30;
  return Math.max(1, Math.ceil(daily * leadTimeDays * (1 + safetyStockPct / 100)));
}

export default function AlertConfigPanel({ recommendation, onClose, onSaved }) {
  // `recommendation` is one item from GET /api/inventory/recommendations
  const [mode, setMode]                   = useState('auto');
  const [manualLevel, setManualLevel]     = useState('');
  const [leadTime, setLeadTime]           = useState(7);
  const [safetyPct, setSafetyPct]         = useState(20);
  const [saving, setSaving]               = useState(false);

  useEffect(() => {
    if (!recommendation) return;
    setMode(recommendation.alertMode || 'auto');
    setManualLevel(recommendation.manualReorderLevel ?? recommendation.currentReorderLevel ?? '');
    setLeadTime(recommendation.leadTimeDays ?? 7);
    setSafetyPct(recommendation.safetyStockPct ?? 20);
  }, [recommendation]);

  const livePreview = useMemo(() => computeRecommended({
    forecasted30dQty: recommendation?.forecasted30dQty,
    leadTimeDays: Number(leadTime),
    safetyStockPct: Number(safetyPct),
  }), [recommendation, leadTime, safetyPct]);

  if (!recommendation) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        alertMode: mode,
        leadTimeDays: Number(leadTime),
        safetyStockPct: Number(safetyPct),
      };
      if (mode === 'manual') {
        const m = parseFloat(manualLevel);
        if (!Number.isFinite(m) || m < 0) {
          toast.error('Please enter a valid manual reorder level.');
          setSaving(false);
          return;
        }
        payload.manualReorderLevel = m;
      }
      await updateInventoryAlertConfig(recommendation._id, payload);
      toast.success('Alert configuration saved.');
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const effectivePreview = mode === 'manual'
    ? (Number.isFinite(parseFloat(manualLevel)) ? parseFloat(manualLevel) : recommendation.currentReorderLevel)
    : (livePreview ?? recommendation.currentReorderLevel);

  return (
    <>
      <div className="ac-overlay" onClick={onClose} />
      <aside className="ac-panel fade-in">
        <header className="ac-header">
          <div>
            <h3>Restock Alert</h3>
            <p className="ac-product">{recommendation.product}</p>
          </div>
          <button className="ac-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <section className="ac-summary">
          <div className="ac-stat">
            <span className="ac-stat-label">Current stock</span>
            <span className="ac-stat-value">{recommendation.stock} {recommendation.unit}</span>
          </div>
          <div className="ac-stat">
            <span className="ac-stat-label">30-day forecast</span>
            <span className="ac-stat-value">
              {recommendation.hasForecast
                ? <>{recommendation.forecasted30dQty} {recommendation.unit}</>
                : <span className="ac-muted">no forecast yet</span>}
            </span>
          </div>
          <div className="ac-stat ac-stat--accent">
            <span className="ac-stat-label">Alert when stock ≤</span>
            <span className="ac-stat-value ac-stat-value--big">{effectivePreview ?? '—'}</span>
          </div>
        </section>

        <div className="ac-mode-toggle">
          <button
            className={`ac-mode ${mode === 'auto' ? 'ac-mode--active' : ''}`}
            onClick={() => setMode('auto')}
            type="button"
          >
            <Sparkles size={14} />
            <span>Auto</span>
            <small>Forecast-based</small>
          </button>
          <button
            className={`ac-mode ${mode === 'manual' ? 'ac-mode--active' : ''}`}
            onClick={() => setMode('manual')}
            type="button"
          >
            <Sliders size={14} />
            <span>Manual</span>
            <small>I'll set the limit</small>
          </button>
        </div>

        {mode === 'auto' ? (
          <div className="ac-section">
            <div className="ac-hint">
              <TrendingUp size={14} />
              <span>
                We reserve enough stock to cover demand during your lead time,
                plus a safety buffer.
              </span>
            </div>

            <div className="ac-field">
              <label>Lead time <span className="ac-unit">days</span></label>
              <div className="ac-slider-row">
                <input
                  type="range" min="1" max="60" value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                />
                <input
                  className="ac-num"
                  type="number" min="1" max="365" value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                />
              </div>
            </div>

            <div className="ac-field">
              <label>Safety buffer <span className="ac-unit">%</span></label>
              <div className="ac-slider-row">
                <input
                  type="range" min="0" max="100" value={safetyPct}
                  onChange={(e) => setSafetyPct(e.target.value)}
                />
                <input
                  className="ac-num"
                  type="number" min="0" max="500" value={safetyPct}
                  onChange={(e) => setSafetyPct(e.target.value)}
                />
              </div>
            </div>

            {!recommendation.hasForecast && (
              <div className="ac-warn">
                <Info size={14} />
                <span>No forecast for this product yet. Generate forecasts first, or use Manual mode.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="ac-section">
            <div className="ac-field">
              <label>Reorder level <span className="ac-unit">{recommendation.unit}</span></label>
              <input
                className="form-input"
                type="number" min="0"
                value={manualLevel}
                onChange={(e) => setManualLevel(e.target.value)}
                placeholder="e.g. 25"
              />
              <small className="ac-hint-small">
                You'll be alerted when stock falls to or below this number.
              </small>
            </div>
            {recommendation.recommendedReorderLevel != null && (
              <button
                type="button"
                className="ac-suggest"
                onClick={() => setManualLevel(recommendation.recommendedReorderLevel)}
              >
                <Sparkles size={12} /> Use suggested ({recommendation.recommendedReorderLevel})
              </button>
            )}
          </div>
        )}

        <footer className="ac-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <div className="spinner" /> : 'Save'}
          </button>
        </footer>
      </aside>
    </>
  );
}
