import { useState } from 'react';
import { X, Sparkles, Sliders, Layers, Tag, Package2, Info, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { bulkInventoryAlertConfig } from '../../api';
import CategorySelect from '../CategorySelect/CategorySelect';
import './BulkAlertSettings.css';

// Bulk-apply alert rules to many inventory items at once.
//
// UI flow:
//   1. Mode      → Auto | Manual
//   2. Scope     → All products | By category | Per product
//      ("Per product" just sends users to the per-row bell — no API call.)
//   3. Inputs    → number / lead-time / safety / category
//
// Hits POST /api/inventory/bulk-alert-config.
export default function BulkAlertSettings({ categories = [], itemCount = 0, onClose, onSaved }) {
  const [mode, setMode]           = useState('auto');
  const [scope, setScope]         = useState('all');
  const [category, setCategory]   = useState('');
  const [level, setLevel]         = useState('');
  const [leadTime, setLeadTime]   = useState(7);
  const [safetyPct, setSafetyPct] = useState(20);
  const [saving, setSaving]       = useState(false);

  const handleApply = async () => {
    if (scope === 'product') {
      toast('Use the bell icon on any row to set a per-product alert.', { icon: 'ℹ️' });
      onClose?.();
      return;
    }
    if (scope === 'category' && !category) {
      return toast.error('Pick a category.');
    }
    if (mode === 'manual') {
      const n = parseFloat(level);
      if (!Number.isFinite(n) || n < 0) return toast.error('Enter a valid reorder level.');
    }

    setSaving(true);
    try {
      const payload = { scope, alertMode: mode };
      if (scope === 'category') payload.category = category;
      if (mode === 'manual') payload.manualReorderLevel = parseFloat(level);
      if (mode === 'auto') {
        payload.leadTimeDays   = Number(leadTime);
        payload.safetyStockPct = Number(safetyPct);
      }
      const result = await bulkInventoryAlertConfig(payload);
      toast.success(`Updated ${result.modified} item${result.modified === 1 ? '' : 's'}.`);
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to apply.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bas-overlay" onClick={onClose}>
      <div className="bas-modal fade-in" onClick={(e) => e.stopPropagation()}>
        <header className="bas-header">
          <div>
            <h3>Bulk Alert Settings</h3>
            <p>Apply restock alert rules across many products at once · {itemCount} item{itemCount === 1 ? '' : 's'}</p>
          </div>
          <button className="bas-close" onClick={onClose} aria-label="Close"><X size={18}/></button>
        </header>

        {/* Step 1 — Mode */}
        <section className="bas-section">
          <div className="bas-step-label"><span>1</span> Choose mode</div>
          <div className="bas-tile-grid bas-tile-grid--2">
            <button
              type="button"
              className={`bas-tile ${mode === 'auto' ? 'bas-tile--active' : ''}`}
              onClick={() => setMode('auto')}
            >
              <div className="bas-tile-icon"><Sparkles size={18}/></div>
              <div>
                <h4>Auto <span className="bas-tag">Recommended</span></h4>
                <p>Forecast-based. Each product gets its own threshold from its 30-day forecast + your lead time and safety buffer.</p>
              </div>
            </button>
            <button
              type="button"
              className={`bas-tile ${mode === 'manual' ? 'bas-tile--active' : ''}`}
              onClick={() => setMode('manual')}
            >
              <div className="bas-tile-icon"><Sliders size={18}/></div>
              <div>
                <h4>Manual</h4>
                <p>You decide the reorder level. Apply one number to all, by category, or per product.</p>
              </div>
            </button>
          </div>
        </section>

        {/* Step 2 — Scope (Manual only shows the 3 sub-modes you asked for; Auto shows All/By category) */}
        <section className="bas-section">
          <div className="bas-step-label"><span>2</span> Apply to</div>
          <div className="bas-tile-grid bas-tile-grid--3">
            <button
              type="button"
              className={`bas-tile bas-tile--sm ${scope === 'all' ? 'bas-tile--active' : ''}`}
              onClick={() => setScope('all')}
            >
              <Layers size={15}/> <strong>All products</strong>
            </button>
            <button
              type="button"
              className={`bas-tile bas-tile--sm ${scope === 'category' ? 'bas-tile--active' : ''}`}
              onClick={() => setScope('category')}
            >
              <Tag size={15}/> <strong>By category</strong>
            </button>
            <button
              type="button"
              className={`bas-tile bas-tile--sm ${scope === 'product' ? 'bas-tile--active' : ''}`}
              onClick={() => setScope('product')}
            >
              <Package2 size={15}/> <strong>Per product</strong>
            </button>
          </div>

          {scope === 'product' && (
            <div className="bas-hint" style={{ marginTop: 12 }}>
              <Info size={14}/>
              <span>To configure a single product, close this and click the <b>bell icon</b> on that row.</span>
            </div>
          )}

          {scope === 'category' && (
            <div className="bas-field" style={{ marginTop: 14 }}>
              <label>Category</label>
              <CategorySelect
                options={categories}
                value={category}
                onChange={setCategory}
                placeholder="Choose a category"
                variant="filter"
              />
            </div>
          )}
        </section>

        {/* Step 3 — Inputs */}
        {scope !== 'product' && (
          <section className="bas-section">
            <div className="bas-step-label"><span>3</span> Set values</div>

            {mode === 'manual' ? (
              <div className="bas-field">
                <label>Reorder level</label>
                <input
                  type="number" min="0"
                  className="form-input"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  placeholder="e.g. 20"
                />
                <small>Alert fires when any selected product's stock falls to or below this number.</small>
              </div>
            ) : (
              <div className="bas-auto-fields">
                <div className="bas-field">
                  <label>Lead time <span className="bas-unit">days</span></label>
                  <div className="bas-slider-row">
                    <input type="range" min="1" max="60" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
                    <input type="number" min="1" max="365" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} className="bas-num"/>
                  </div>
                </div>
                <div className="bas-field">
                  <label>Safety buffer <span className="bas-unit">%</span></label>
                  <div className="bas-slider-row">
                    <input type="range" min="0" max="100" value={safetyPct} onChange={(e) => setSafetyPct(e.target.value)} />
                    <input type="number" min="0" max="500" value={safetyPct} onChange={(e) => setSafetyPct(e.target.value)} className="bas-num"/>
                  </div>
                </div>
                <div className="bas-hint">
                  <Info size={14}/>
                  <span>
                    Each product's reorder level becomes
                    {' '}<code>dailyDemand × leadTime × (1 + safety%)</code>.
                    Faster-selling products get higher thresholds automatically.
                  </span>
                </div>
              </div>
            )}
          </section>
        )}

        <footer className="bas-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleApply} disabled={saving}>
            {saving ? <div className="spinner"/> : <><Check size={14}/> Apply</>}
          </button>
        </footer>
      </div>
    </div>
  );
}
