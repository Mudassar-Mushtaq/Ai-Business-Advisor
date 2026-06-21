import { useEffect, useMemo, useState } from 'react';
import { Package, Plus, Pencil, Trash2, Check, X, AlertTriangle, Bell, Sparkles, Settings2 } from 'lucide-react';
import {
  getInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem,
  getInventoryRecommendations, getInventoryCategories,
} from '../api';
import toast from 'react-hot-toast';
import AlertConfigPanel from '../components/AlertConfigPanel/AlertConfigPanel';
import BulkAlertSettings from '../components/BulkAlertSettings/BulkAlertSettings';
import CategorySelect from '../components/CategorySelect/CategorySelect';
import './Inventory.css';

const EMPTY_FORM = { product:'', category:'', stock:'', reorderLevel:'10', unit:'units', costPerUnit:'', supplier:'' };

function StatusBadge({ status }) {
  const map = {
    in_stock:     { cls:'badge-success', label:'In Stock'    },
    low_stock:    { cls:'badge-warning', label:'Low Stock'   },
    out_of_stock: { cls:'badge-danger',  label:'Out of Stock'},
  };
  const { cls, label } = map[status] || map.in_stock;
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function Inventory() {
  const [items, setItems]                 = useState([]);
  const [recommendations, setRecs]        = useState([]);
  const [categories, setCategories]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showForm, setShowForm]           = useState(false);
  const [form, setForm]                   = useState(EMPTY_FORM);
  const [editId, setEditId]               = useState(null);
  const [saving, setSaving]               = useState(false);
  const [search, setSearch]               = useState('');
  const [filter, setFilter]               = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [deleteId, setDeleteId]           = useState(null);
  const [alertConfigFor, setAlertConfigFor] = useState(null); // recommendation row
  const [showBulkAlerts, setShowBulkAlerts] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Run all three in parallel — same auth header, independent endpoints.
      const [inv, recs, cats] = await Promise.all([
        getInventory(),
        getInventoryRecommendations().catch(() => []),
        getInventoryCategories().catch(() => []),
      ]);
      setItems(inv);
      setRecs(recs);
      setCategories(cats);
    } catch {
      toast.error('Failed to load inventory.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Recommendations keyed by item _id for fast lookup in the table.
  const recsById = useMemo(() => {
    const m = new Map();
    recommendations.forEach((r) => m.set(String(r._id), r));
    return m;
  }, [recommendations]);

  const handleSave = async () => {
    if (!form.product.trim()) return toast.error('Product name is required.');
    setSaving(true);
    try {
      const payload = {
        ...form,
        stock: parseFloat(form.stock) || 0,
        reorderLevel: parseFloat(form.reorderLevel) || 10,
        costPerUnit: parseFloat(form.costPerUnit) || 0,
      };
      if (editId) {
        await updateInventoryItem(editId, payload);
        toast.success('Item updated!');
      } else {
        await addInventoryItem(payload);
        toast.success('Item added!');
      }
      setShowForm(false); setForm(EMPTY_FORM); setEditId(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed.');
    }
    setSaving(false);
  };

  const handleEdit = (item) => {
    setEditId(item._id);
    setForm({ product: item.product, category: item.category||'', stock: item.stock, reorderLevel: item.reorderLevel, unit: item.unit||'units', costPerUnit: item.costPerUnit||'', supplier: item.supplier||'' });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    try {
      await deleteInventoryItem(id);
      toast.success('Item deleted.');
      setDeleteId(null);
      await load();
    } catch { toast.error('Delete failed.'); }
  };

  const filtered = items
    .filter(i => i.product.toLowerCase().includes(search.toLowerCase()))
    .filter(i => filter === 'all' ? true : i.status === filter)
    .filter(i => !categoryFilter || (i.category || 'General') === categoryFilter);

  const lowCount = items.filter(i => i.status !== 'in_stock').length;

  return (
    <div className="page-wrapper fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Manage stock levels and track low-stock alerts</p>
        </div>
        <div className="btn-row" style={{ gap:10 }}>
          <button className="btn btn-secondary" onClick={() => setShowBulkAlerts(true)}>
            <Settings2 size={16}/> Bulk Alerts
          </button>
          <button className="btn btn-primary hide-mobile-when-fab" onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY_FORM); }}>
            <Plus size={16}/> Add Item
          </button>
        </div>
      </div>

      {/* Low stock warning */}
      {lowCount > 0 && (
        <div className="inv-alert-bar">
          <AlertTriangle size={16}/> {lowCount} item{lowCount>1?'s':''} need{lowCount===1?'s':''} attention (low or out of stock)
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div className="card inv-form-card fade-in" style={{ marginBottom:24 }}>
          <h3 style={{ marginBottom:20 }}>{editId ? 'Edit Item' : 'Add New Item'}</h3>
          <div className="inv-form-grid">
            <div className="form-group">
              <label className="form-label">Product Name *</label>
              <input className="form-input" value={form.product} onChange={e=>setForm({...form,product:e.target.value})} placeholder="e.g. Widget Pro" />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <CategorySelect
                options={categories}
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                allowCreate
                placeholder="Pick or add a category"
                variant="input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Current Stock *</label>
              <input className="form-input" type="number" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Reorder Level</label>
              <input className="form-input" type="number" value={form.reorderLevel} onChange={e=>setForm({...form,reorderLevel:e.target.value})} placeholder="10" />
            </div>
            <div className="form-group">
              <label className="form-label">Unit</label>
              <input className="form-input" value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder="units / kg / boxes" />
            </div>
            <div className="form-group">
              <label className="form-label">Cost Per Unit ($)</label>
              <input className="form-input" type="number" value={form.costPerUnit} onChange={e=>setForm({...form,costPerUnit:e.target.value})} placeholder="0.00" />
            </div>
            <div className="form-group" style={{ gridColumn:'span 2' }}>
              <label className="form-label">Supplier</label>
              <input className="form-input" value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})} placeholder="Supplier name" />
            </div>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:8 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><div className="spinner"/></> : <><Check size={15}/></>} {editId ? 'Update' : 'Save'} Item
            </button>
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditId(null); }}>
              <X size={15}/> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="inv-filters" style={{ marginBottom:20 }}>
        <input className="form-input" style={{ width:260 }} placeholder="Search products..." value={search} onChange={e=>setSearch(e.target.value)} />
        <div className="inv-category-filter">
          <CategorySelect
            options={categories}
            value={categoryFilter}
            onChange={setCategoryFilter}
            placeholder="All categories"
            variant="filter"
            size="sm"
          />
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {['all','in_stock','low_stock','out_of_stock'].map(f => (
            <button key={f} className={`filter-chip ${filter===f?'active':''}`} onClick={()=>setFilter(f)}>
              {f.replace('_',' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner spinner-lg"/></div>
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th><th>Category</th><th>Stock</th>
                  <th>Reorder At</th><th>Mode</th><th>Status</th><th>Supplier</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign:'center', padding:'48px', color:'var(--text-muted)' }}>No items found</td></tr>
                ) : filtered.map(item => {
                  const rec = recsById.get(String(item._id));
                  const mode = rec?.alertMode || 'auto';
                  return (
                    <tr key={item._id} className={item.status !== 'in_stock' ? 'row-alert' : ''}>
                      <td data-label="Product"><strong>{item.product}</strong></td>
                      <td data-label="Category"><span className="badge badge-muted">{item.category || '—'}</span></td>
                      <td data-label="Stock">
                        <span className={`stock-qty ${item.status !== 'in_stock' ? 'stock-qty--low' : ''}`}>
                          {item.stock} {item.unit}
                        </span>
                      </td>
                      <td data-label="Reorder At" className="col-hide-mobile" style={{ color:'var(--text-secondary)' }}>{item.reorderLevel}</td>
                      <td data-label="Mode" className="col-hide-mobile">
                        <span className={`inv-mode-chip inv-mode-chip--${mode}`}>
                          {mode === 'auto' ? <><Sparkles size={11}/> Auto</> : 'Manual'}
                        </span>
                      </td>
                      <td data-label="Status"><StatusBadge status={item.status}/></td>
                      <td data-label="Supplier" className="col-hide-mobile" style={{ color:'var(--text-secondary)', fontSize:'0.82rem' }}>{item.supplier || '—'}</td>
                      <td className="cell-actions">
                        <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                          <button
                            className="icon-btn icon-btn--alert"
                            onClick={() => setAlertConfigFor(rec || {
                              _id: item._id, product: item.product, unit: item.unit, stock: item.stock,
                              alertMode: 'auto', leadTimeDays: 7, safetyStockPct: 20,
                              currentReorderLevel: item.reorderLevel,
                              recommendedReorderLevel: null,
                              forecasted30dQty: 0, hasForecast: false,
                            })}
                            title="Configure alert"
                          ><Bell size={14}/></button>
                          <button className="icon-btn icon-btn--edit" onClick={()=>handleEdit(item)} title="Edit"><Pencil size={14}/></button>
                          <button className="icon-btn icon-btn--delete" onClick={()=>setDeleteId(item._id)} title="Delete"><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteId && (
        <div className="modal-overlay" onClick={()=>setDeleteId(null)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3>Delete Item?</h3>
            <p>This action cannot be undone.</p>
            <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
              <button className="btn btn-secondary" onClick={()=>setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={()=>handleDelete(deleteId)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Alert config side panel */}
      {alertConfigFor && (
        <AlertConfigPanel
          recommendation={alertConfigFor}
          onClose={() => setAlertConfigFor(null)}
          onSaved={load}
        />
      )}

      {/* Bulk alert settings modal */}
      {showBulkAlerts && (
        <BulkAlertSettings
          categories={categories}
          itemCount={items.length}
          onClose={() => setShowBulkAlerts(false)}
          onSaved={load}
        />
      )}

      {/* Mobile floating "Add Item" button */}
      <button
        className="page-fab"
        onClick={() => {
          setShowForm(true); setEditId(null); setForm(EMPTY_FORM);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        aria-label="Add inventory item"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
