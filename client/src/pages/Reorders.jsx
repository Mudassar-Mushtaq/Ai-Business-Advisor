import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, RefreshCw, ChevronLeft, Search, Plus,
  FileSpreadsheet, FileText, FileDown, Truck, CheckCircle2,
  XCircle, Trash2, Package, DollarSign, Clock, Filter, ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

import {
  getReorders, getReorderStats, updateReorderStatus, deleteReorder,
  downloadReordersFile,
} from '../api';
import EmptyState from '../components/EmptyState/EmptyState';
import ReorderModal from '../components/ReorderModal/ReorderModal';
import { exportToCsv, printReport } from '../utils/exporter';
import './Reorders.css';

const STATUS_TABS = [
  { key: 'all',        label: 'All',        match: () => true },
  { key: 'draft',      label: 'Draft',      match: (s) => s === 'draft' },
  { key: 'ordered',    label: 'Ordered',    match: (s) => s === 'ordered' },
  { key: 'received',   label: 'Received',   match: (s) => s === 'received' },
  { key: 'cancelled',  label: 'Cancelled',  match: (s) => s === 'cancelled' },
];

const STATUS_META = {
  draft:     { label: 'Draft',     tone: 'info',     icon: Clock },
  ordered:   { label: 'Ordered',   tone: 'primary',  icon: Truck },
  received:  { label: 'Received',  tone: 'success',  icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', tone: 'danger',   icon: XCircle },
};

const fmtMoney = (n) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString() : '—';

export default function Reorders() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ draft: 0, ordered: 0, received: 0, cancelled: 0, total: 0, totalCost: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [list, st] = await Promise.all([
        getReorders().catch(() => []),
        getReorderStats().catch(() => null),
      ]);
      setItems(list || []);
      if (st) setStats(st);
    } catch {
      toast.error('Failed to load reorders.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matcher = STATUS_TABS.find(t => t.key === tab)?.match || (() => true);
    return items.filter(po => {
      if (!matcher(po.status)) return false;
      if (q && !`${po.product} ${po.supplier} ${po.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, tab, query]);

  const changeStatus = async (po, next) => {
    if (po.status === next) return;
    setBusyId(po._id);
    try {
      const updated = await updateReorderStatus(po._id, next);
      setItems(prev => prev.map(p => p._id === po._id ? updated : p));
      const labels = { ordered: 'Marked as ordered', received: 'Marked as received', cancelled: 'Cancelled', draft: 'Moved back to draft' };
      toast.success(labels[next] || 'Status updated');
      // received status mutates inventory — refresh stats
      if (next === 'received') {
        getReorderStats().then(setStats).catch(() => {});
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update status.');
    }
    setBusyId(null);
  };

  const removeReorder = async (po) => {
    if (!window.confirm(`Delete the reorder for "${po.product}"? This cannot be undone.`)) return;
    setBusyId(po._id);
    try {
      await deleteReorder(po._id);
      setItems(prev => prev.filter(p => p._id !== po._id));
      toast.success('Reorder deleted.');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not delete reorder.');
    }
    setBusyId(null);
  };

  // ---- Exports ----------------------------------------------------------------

  const exportRows = useMemo(() => filtered.map(po => ({
    Product:      po.product,
    Category:     po.category,
    Quantity:     po.quantity,
    Unit:         po.unit,
    'Cost / unit': (po.costPerUnit || 0).toFixed(2),
    'Total cost': (po.totalCost || 0).toFixed(2),
    Supplier:     po.supplier || '',
    Status:       po.status,
    'Expected':    fmtDate(po.expectedDate),
    'Ordered at':  fmtDate(po.orderedAt),
    'Received at': fmtDate(po.receivedAt),
    'Created at':  fmtDate(po.createdAt),
    Notes:        po.notes || '',
  })), [filtered]);

  const handleExportCsv = () => {
    if (exportRows.length === 0) return toast.error('Nothing to export with these filters.');
    exportToCsv(`reorders-${new Date().toISOString().slice(0,10)}.csv`, exportRows);
    toast.success('CSV downloaded.');
    setExportOpen(false);
  };

  const handleExportExcel = async () => {
    if (exportRows.length === 0) return toast.error('Nothing to export with these filters.');
    try {
      const params = {};
      if (tab !== 'all') params.status = tab;
      await downloadReordersFile('xlsx', params);
      toast.success('Excel file downloaded.');
    } catch {
      toast.error('Could not export Excel.');
    }
    setExportOpen(false);
  };

  const handleExportPdf = () => {
    if (exportRows.length === 0) return toast.error('Nothing to export with these filters.');
    const totalCost = filtered.reduce((s, p) => s + (p.totalCost || 0), 0);
    printReport({
      title: 'Purchase Orders',
      subtitle: `${filtered.length} reorder${filtered.length === 1 ? '' : 's'} · ${tab === 'all' ? 'All statuses' : `Status: ${tab}`}`,
      sections: [
        { type: 'kpis', heading: 'Summary', items: [
          { label: 'Total reorders', value: filtered.length },
          { label: 'Total cost',     value: fmtMoney(totalCost) },
          { label: 'Draft',          value: filtered.filter(p => p.status === 'draft').length },
          { label: 'Ordered',        value: filtered.filter(p => p.status === 'ordered').length },
        ]},
        { type: 'table', heading: 'Reorders', columns: [
          { key: 'Product',     label: 'Product' },
          { key: 'Quantity',    label: 'Qty' },
          { key: 'Unit',        label: 'Unit' },
          { key: 'Cost / unit', label: 'Cost/unit' },
          { key: 'Total cost',  label: 'Total' },
          { key: 'Supplier',    label: 'Supplier' },
          { key: 'Status',      label: 'Status' },
          { key: 'Expected',    label: 'Expected' },
        ], rows: exportRows },
      ],
    });
    setExportOpen(false);
  };

  // ---- Render ----------------------------------------------------------------

  return (
    <div className="page-wrapper page-enter reorders-page">
      <div className="page-header">
        <div>
          <Link to="/dashboard" className="reorders-page__back">
            <ChevronLeft size={14} /> Back to dashboard
          </Link>
          <h1 className="page-title">
            <ShoppingCart size={22} style={{ verticalAlign: '-4px', marginRight: 8 }} />
            Reorders &amp; Purchase Orders
          </h1>
          <p className="page-subtitle">
            Track every replenishment from draft → ordered → received, with one-click exports.
          </p>
        </div>
        <div className="dashboard-controls" style={{ flexWrap: 'wrap' }}>
          <div className="reorders-export">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setExportOpen(o => !o)}
              disabled={loading}
            >
              <FileDown size={14} /> Export
            </button>
            {exportOpen && (
              <div className="reorders-export__menu" role="menu">
                <button onClick={handleExportExcel}>
                  <FileSpreadsheet size={14} /> Excel (.xlsx)
                </button>
                <button onClick={handleExportCsv}>
                  <FileDown size={14} /> CSV
                </button>
                <button onClick={handleExportPdf}>
                  <FileText size={14} /> PDF / Print
                </button>
              </div>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary btn-sm hide-mobile-when-fab" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New reorder
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="reorders-summary">
        <SummaryTile label="Total"     value={stats.total}     tone="primary" icon={<Package size={16} />} />
        <SummaryTile label="Draft"     value={stats.draft}     tone="info"    icon={<Clock size={16} />} />
        <SummaryTile label="Ordered"   value={stats.ordered}   tone="warning" icon={<Truck size={16} />} />
        <SummaryTile label="Received"  value={stats.received}  tone="success" icon={<CheckCircle2 size={16} />} />
        <SummaryTile label="Open spend" value={fmtMoney(stats.totalCost)} tone="purple" icon={<DollarSign size={16} />} />
      </div>

      {/* Toolbar */}
      <div className="reorders-toolbar">
        <div className="reorders-tabs" role="tablist" aria-label="Status filter">
          {STATUS_TABS.map(({ key, label }) => {
            const count = key === 'all' ? stats.total : (stats[key] || 0);
            return (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                className={`reorders-tab ${tab === key ? 'reorders-tab--active' : ''} reorders-tab--${key}`}
                onClick={() => setTab(key)}
              >
                <Filter size={12} className="reorders-tab__leadicon" />
                <span>{label}</span>
                <span className="reorders-tab__count">{count}</span>
              </button>
            );
          })}
        </div>

        <label className="reorders-search">
          <Search size={14} />
          <input
            type="search"
            placeholder="Search product, supplier…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
      </div>

      {/* Body */}
      {loading ? (
        <div className="reorders-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton reorders-skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          illustration={items.length === 0 ? 'check' : 'chart'}
          title={items.length === 0 ? 'No reorders yet' : 'No reorders match these filters'}
          message={items.length === 0
            ? 'Click "Reorder" on a low-stock alert or use "New reorder" to create one.'
            : 'Try switching tabs or clearing the search.'}
          action={items.length === 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create reorder
            </button>
          )}
        />
      ) : (
        <div className="reorders-table-wrap">
          <table className="reorders-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Supplier</th>
                <th>Expected</th>
                <th>Status</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(po => {
                const meta = STATUS_META[po.status] || STATUS_META.draft;
                const StatusIcon = meta.icon;
                const isBusy = busyId === po._id;
                return (
                  <tr key={po._id} className={isBusy ? 'reorders-row--busy' : ''}>
                    <td data-label="Product">
                      <div className="reorders-product">
                        <div className="reorders-product__name">{po.product}</div>
                        {po.category && <div className="reorders-product__cat">{po.category}</div>}
                      </div>
                    </td>
                    <td data-label="Qty">
                      <strong>{po.quantity}</strong> <span className="reorders-muted">{po.unit}</span>
                    </td>
                    <td data-label="Total">
                      <div className="reorders-money">{fmtMoney(po.totalCost)}</div>
                      <div className="reorders-muted">{fmtMoney(po.costPerUnit)} / {po.unit}</div>
                    </td>
                    <td data-label="Supplier" className="col-hide-mobile">{po.supplier || <span className="reorders-muted">—</span>}</td>
                    <td data-label="Expected" className="col-hide-mobile">{fmtDate(po.expectedDate)}</td>
                    <td data-label="Status">
                      <span className={`reorders-status reorders-status--${meta.tone}`}>
                        <StatusIcon size={11} /> {meta.label}
                      </span>
                    </td>
                    <td className="reorders-actions">
                      {po.status === 'draft' && (
                        <>
                          <button
                            className="reorders-action reorders-action--primary"
                            onClick={() => changeStatus(po, 'ordered')}
                            disabled={isBusy}
                            title="Mark as ordered"
                          >
                            Mark ordered <ArrowRight size={11} />
                          </button>
                          <button
                            className="reorders-action reorders-action--ghost"
                            onClick={() => changeStatus(po, 'cancelled')}
                            disabled={isBusy}
                            title="Cancel this reorder"
                          >
                            <XCircle size={12} />
                          </button>
                          <button
                            className="reorders-action reorders-action--danger"
                            onClick={() => removeReorder(po)}
                            disabled={isBusy}
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                      {po.status === 'ordered' && (
                        <>
                          <button
                            className="reorders-action reorders-action--success"
                            onClick={() => changeStatus(po, 'received')}
                            disabled={isBusy}
                            title="Mark as received (auto-bumps inventory stock)"
                          >
                            <CheckCircle2 size={11} /> Receive
                          </button>
                          <button
                            className="reorders-action reorders-action--ghost"
                            onClick={() => changeStatus(po, 'cancelled')}
                            disabled={isBusy}
                            title="Cancel this reorder"
                          >
                            <XCircle size={12} />
                          </button>
                        </>
                      )}
                      {po.status === 'cancelled' && (
                        <>
                          <button
                            className="reorders-action reorders-action--ghost"
                            onClick={() => changeStatus(po, 'draft')}
                            disabled={isBusy}
                            title="Reopen as draft"
                          >
                            Reopen
                          </button>
                          <button
                            className="reorders-action reorders-action--danger"
                            onClick={() => removeReorder(po)}
                            disabled={isBusy}
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                      {po.status === 'received' && (
                        <span className="reorders-muted reorders-receivedTag">
                          Received {fmtDate(po.receivedAt)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ReorderModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(po) => {
          setShowCreate(false);
          setItems(prev => [po, ...prev]);
          getReorderStats().then(setStats).catch(() => {});
        }}
      />

      {/* Mobile floating "New reorder" button */}
      <button
        className="page-fab"
        onClick={() => setShowCreate(true)}
        aria-label="Create new reorder"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}

function SummaryTile({ label, value, tone = 'primary', icon }) {
  return (
    <div className={`reorders-summary__tile reorders-summary__tile--${tone}`}>
      <div className="reorders-summary__icon">{icon}</div>
      <div className="reorders-summary__body">
        <div className="reorders-summary__value">{value}</div>
        <div className="reorders-summary__label">{label}</div>
      </div>
    </div>
  );
}
