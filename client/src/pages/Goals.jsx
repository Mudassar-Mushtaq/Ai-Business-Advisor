import { useEffect, useMemo, useState } from 'react';
import { Target, Plus, X, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import GoalProgressCard from '../components/GoalProgressCard/GoalProgressCard';
import EmptyState from '../components/EmptyState/EmptyState';
import {
  getGoals, createGoal, updateGoal, deleteGoal, getTopProducts,
} from '../api';
import './Goals.css';

const METRIC_OPTIONS = [
  { value: 'revenue',         label: 'Total Revenue',     unit: '$',     hint: 'Total $ revenue across all products' },
  { value: 'orders',          label: 'Total Orders',      unit: 'orders',hint: 'Number of order rows recorded' },
  { value: 'units',           label: 'Units Sold',        unit: 'units', hint: 'Total quantity sold' },
  { value: 'profit',          label: 'Gross Profit',      unit: '$',     hint: 'Revenue minus cost' },
  { value: 'product_revenue', label: 'Product Revenue',   unit: '$',     hint: 'Revenue for one specific product' },
  { value: 'stockouts_max',   label: 'Max Stockouts',     unit: 'items', hint: 'Stay below this many out-of-stock items' },
];

const PERIOD_OPTIONS = [
  { value: 'month',   label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'custom',  label: 'Custom' },
];

const EMPTY_FORM = {
  label: '', metric: 'revenue', target: '', period: 'month',
  productFilter: '', startDate: '', endDate: '',
};

function todayIso() { return new Date().toISOString().slice(0, 10); }
function plusDaysIso(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function Goals() {
  const [goals, setGoals]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editId, setEditId]     = useState(null);
  const [saving, setSaving]     = useState(false);
  const [products, setProducts] = useState([]);
  const [tab, setTab]           = useState('active');

  const load = async () => {
    setLoading(true);
    try {
      const [g, prods] = await Promise.all([
        getGoals(tab === 'all' ? 'all' : 'active'),
        getTopProducts().catch(() => []),
      ]);
      setGoals(g || []);
      setProducts(prods || []);
    } catch {
      toast.error('Failed to load goals.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const stats = useMemo(() => {
    const onTrack  = goals.filter(g => g.status === 'active' && g.onTrack).length;
    const offTrack = goals.filter(g => g.status === 'active' && !g.onTrack && g.daysLeft > 0).length;
    const achieved = goals.filter(g => g.status === 'achieved').length;
    const missed   = goals.filter(g => g.status === 'missed').length;
    return { onTrack, offTrack, achieved, missed };
  }, [goals]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, startDate: todayIso(), endDate: plusDaysIso(30) });
    setEditId(null);
    setShowForm(true);
  };

  const openEdit = (goal) => {
    setForm({
      label:         goal.label,
      metric:        goal.metric,
      target:        String(goal.target),
      period:        goal.period,
      productFilter: goal.productFilter || '',
      startDate:     goal.startDate ? new Date(goal.startDate).toISOString().slice(0, 10) : '',
      endDate:       goal.endDate   ? new Date(goal.endDate).toISOString().slice(0, 10)   : '',
    });
    setEditId(goal.goalId);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) return toast.error('Give your goal a name.');
    if (!form.target || Number(form.target) < 0) return toast.error('Target must be a positive number.');
    if (form.metric === 'product_revenue' && !form.productFilter) {
      return toast.error('Pick a product for this goal.');
    }
    if (form.period === 'custom' && (!form.startDate || !form.endDate)) {
      return toast.error('Custom period needs both start and end dates.');
    }

    setSaving(true);
    try {
      const payload = {
        label:         form.label.trim(),
        metric:        form.metric,
        target:        Number(form.target),
        period:        form.period,
        productFilter: form.productFilter || null,
        startDate:     form.period === 'custom' ? form.startDate : undefined,
        endDate:       form.period === 'custom' ? form.endDate   : undefined,
      };
      if (editId) {
        await updateGoal(editId, payload);
        toast.success('Goal updated.');
      } else {
        await createGoal(payload);
        toast.success('Goal created.');
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditId(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save goal.');
    }
    setSaving(false);
  };

  const handleDelete = async (goal) => {
    if (!window.confirm(`Delete goal "${goal.label}"?`)) return;
    try {
      await deleteGoal(goal.goalId);
      toast.success('Goal deleted.');
      await load();
    } catch {
      toast.error('Failed to delete goal.');
    }
  };

  const selectedMetric = METRIC_OPTIONS.find(m => m.value === form.metric);

  return (
    <div className="page-wrapper page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title shimmer-text">
            <Target size={26} style={{ verticalAlign: '-4px', marginRight: 10 }} />
            Goals & Targets
          </h1>
          <p className="page-subtitle">
            Set targets that matter. Track them automatically. Get alerted when you're slipping.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> New Goal
        </button>
      </div>

      {/* Summary strip */}
      <div className="goals-stats stagger">
        <div className="goals-stat goals-stat--success">
          <span className="goals-stat__value">{stats.onTrack}</span>
          <span className="goals-stat__label">On track</span>
        </div>
        <div className="goals-stat goals-stat--warning">
          <span className="goals-stat__value">{stats.offTrack}</span>
          <span className="goals-stat__label">Off track</span>
        </div>
        <div className="goals-stat goals-stat--success">
          <span className="goals-stat__value">{stats.achieved}</span>
          <span className="goals-stat__label">Achieved</span>
        </div>
        <div className="goals-stat goals-stat--muted">
          <span className="goals-stat__value">{stats.missed}</span>
          <span className="goals-stat__label">Missed</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="goals-tabs">
        <button className={`goals-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
          Active
        </button>
        <button className={`goals-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          All time
        </button>
      </div>

      {/* Goals grid */}
      {loading ? (
        <div className="goals-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 180, borderRadius: 16 }} />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <EmptyState
          illustration="target"
          title="No goals yet"
          message={`Set a goal like "$50K revenue this month" or "Stay under 2 stockouts" — we'll track it automatically.`}
          action={<button className="btn btn-primary" onClick={openCreate}><Sparkles size={14} /> Create your first goal</button>}
        />
      ) : (
        <div className="goals-grid stagger">
          {goals.map(g => (
            <GoalProgressCard
              key={g.goalId}
              progress={g}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="goal-modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="goal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="goal-modal__head">
              <h3>{editId ? 'Edit Goal' : 'New Goal'}</h3>
              <button className="icon-btn" onClick={() => setShowForm(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="goal-modal__body">
              <div className="form-group">
                <label>Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. October revenue target"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Metric</label>
                  <select
                    className="form-select"
                    value={form.metric}
                    onChange={(e) => setForm({ ...form, metric: e.target.value })}
                  >
                    {METRIC_OPTIONS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  {selectedMetric && (
                    <small className="form-hint">{selectedMetric.hint}</small>
                  )}
                </div>

                <div className="form-group">
                  <label>Target ({selectedMetric?.unit || ''})</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-input"
                    placeholder="50000"
                    value={form.target}
                    onChange={(e) => setForm({ ...form, target: e.target.value })}
                  />
                </div>
              </div>

              {form.metric === 'product_revenue' && (
                <div className="form-group">
                  <label>Product</label>
                  <select
                    className="form-select"
                    value={form.productFilter}
                    onChange={(e) => setForm({ ...form, productFilter: e.target.value })}
                  >
                    <option value="">— Select a product —</option>
                    {products.map(p => (
                      <option key={p._id} value={p._id}>{p._id}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Period</label>
                <div className="period-toggle">
                  {PERIOD_OPTIONS.map(p => (
                    <button
                      type="button"
                      key={p.value}
                      className={`period-toggle__btn ${form.period === p.value ? 'active' : ''}`}
                      onClick={() => setForm({ ...form, period: p.value })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.period === 'custom' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Start date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>End date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="goal-modal__foot">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : (editId ? 'Save changes' : 'Create goal')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
