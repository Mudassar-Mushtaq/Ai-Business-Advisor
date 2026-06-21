import { useEffect, useRef, useState } from 'react';
import { X, Package, ShoppingCart, Truck, Calendar, DollarSign, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  suggestReorder, createReorder, createReorderFromAlert,
} from '../../api';
import './ReorderModal.css';

/**
 * Reorder confirmation modal.
 *
 * Props:
 *   open           — boolean
 *   onClose        — () => void
 *   onCreated      — (purchaseOrder) => void  (called after a successful create)
 *   alert          — optional alert object (low_stock alerts can spawn a PO)
 *   product        — optional { product, inventoryId } to pre-fill
 */
export default function ReorderModal({ open, onClose, onCreated, alert, product }) {
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    product: '',
    quantity: 1,
    unit: 'units',
    costPerUnit: 0,
    supplier: '',
    expectedDate: '',
    notes: '',
    inventoryId: null,
    currentStock: null,
    reorderLevel: null,
    category: 'General',
  });
  const firstFieldRef = useRef(null);

  // Reset & fetch suggestion when modal opens.
  // The form renders immediately with seed values; the AI suggestion patches
  // in when it arrives so a slow /suggest call never hides the modal.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const seed = {
      product: alert?.meta?.product || alert?.product || product?.product || '',
      inventoryId: product?.inventoryId || null,
    };

    setForm(f => ({
      ...f,
      product: seed.product,
      quantity: 1,
      unit: 'units',
      costPerUnit: 0,
      supplier: '',
      inventoryId: seed.inventoryId,
      currentStock: null,
      reorderLevel: null,
      category: 'General',
    }));

    setLoadingSuggestion(true);
    suggestReorder(seed)
      .then(s => {
        if (cancelled) return;
        setForm(f => ({
          ...f,
          product: s.product || f.product,
          quantity: s.suggestedQty || f.quantity || 1,
          unit: s.unit || f.unit,
          costPerUnit: s.costPerUnit || f.costPerUnit,
          supplier: s.supplier || f.supplier,
          inventoryId: s.inventoryId || f.inventoryId,
          currentStock: s.currentStock,
          reorderLevel: s.reorderLevel,
          category: s.category || f.category,
        }));
      })
      .catch(() => { /* keep seed values */ })
      .finally(() => { if (!cancelled) setLoadingSuggestion(false); });

    return () => { cancelled = true; };
  }, [open, alert, product]);

  // Focus + ESC close
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => firstFieldRef.current?.focus(), 80);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  const totalCost = (Number(form.quantity) || 0) * (Number(form.costPerUnit) || 0);

  const update = (patch) => setForm(f => ({ ...f, ...patch }));

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.product.trim()) return toast.error('Product is required.');
    const qty = Number(form.quantity);
    if (!Number.isFinite(qty) || qty < 1) return toast.error('Quantity must be at least 1.');

    const payload = {
      product:      form.product.trim(),
      quantity:     qty,
      unit:         form.unit,
      costPerUnit:  Number(form.costPerUnit) || 0,
      supplier:     form.supplier.trim(),
      notes:        form.notes.trim(),
      expectedDate: form.expectedDate || null,
      inventoryId:  form.inventoryId,
      category:     form.category,
    };

    setSubmitting(true);
    try {
      const po = alert?.id && alert.source === 'notification'
        ? await createReorderFromAlert(alert.id, payload)
        : await createReorder(payload);
      toast.success(`Draft reorder created for ${po.product}`);
      onCreated?.(po);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not create reorder.');
    }
    setSubmitting(false);
  };

  return (
    <div className="reorder-modal__backdrop" onClick={onClose}>
      <div
        className="reorder-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reorder-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="reorder-modal__head">
          <div className="reorder-modal__heading">
            <span className="reorder-modal__head-icon"><ShoppingCart size={18} /></span>
            <div>
              <h2 id="reorder-modal-title">Create reorder</h2>
              <p>Draft a purchase order — you can review and edit before sending.</p>
            </div>
          </div>
          <button className="reorder-modal__close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <>
            {loadingSuggestion && (
              <div className="reorder-modal__loading reorder-modal__loading--inline">
                <Loader size={14} className="spin" /> Fetching AI suggestion…
              </div>
            )}
            {(form.currentStock != null || form.reorderLevel != null) && (
              <div className="reorder-modal__context">
                {form.currentStock != null && (
                  <span className="reorder-modal__chip reorder-modal__chip--stock">
                    <Package size={12} /> Stock: <b>{form.currentStock}</b> {form.unit}
                  </span>
                )}
                {form.reorderLevel != null && (
                  <span className="reorder-modal__chip">
                    Reorder level: <b>{form.reorderLevel}</b> {form.unit}
                  </span>
                )}
                <span className="reorder-modal__chip reorder-modal__chip--ai">
                  AI-suggested qty
                </span>
              </div>
            )}

            <form onSubmit={submit} className="reorder-modal__form">
              <label className="reorder-field reorder-field--full">
                <span>Product</span>
                <input
                  ref={firstFieldRef}
                  type="text"
                  value={form.product}
                  onChange={e => update({ product: e.target.value })}
                  placeholder="Product name"
                  required
                />
              </label>

              <label className="reorder-field">
                <span>Quantity</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.quantity}
                  onChange={e => update({ quantity: e.target.value })}
                  required
                />
              </label>

              <label className="reorder-field">
                <span>Unit</span>
                <input
                  type="text"
                  value={form.unit}
                  onChange={e => update({ unit: e.target.value })}
                  placeholder="units"
                />
              </label>

              <label className="reorder-field">
                <span>Cost / unit</span>
                <div className="reorder-field__addon">
                  <DollarSign size={13} />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.costPerUnit}
                    onChange={e => update({ costPerUnit: e.target.value })}
                  />
                </div>
              </label>

              <label className="reorder-field">
                <span>Total</span>
                <div className="reorder-field__total">${totalCost.toFixed(2)}</div>
              </label>

              <label className="reorder-field reorder-field--full">
                <span>Supplier</span>
                <div className="reorder-field__addon">
                  <Truck size={13} />
                  <input
                    type="text"
                    value={form.supplier}
                    onChange={e => update({ supplier: e.target.value })}
                    placeholder="Supplier name (optional)"
                  />
                </div>
              </label>

              <label className="reorder-field reorder-field--full">
                <span>Expected delivery</span>
                <div className="reorder-field__addon">
                  <Calendar size={13} />
                  <input
                    type="date"
                    value={form.expectedDate}
                    onChange={e => update({ expectedDate: e.target.value })}
                  />
                </div>
              </label>

              <label className="reorder-field reorder-field--full">
                <span>Notes</span>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={e => update({ notes: e.target.value })}
                  placeholder="Internal notes (optional)"
                  maxLength={1000}
                />
              </label>

              <footer className="reorder-modal__foot">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={submitting || !form.product.trim()}
                >
                  {submitting ? <><Loader size={14} className="spin" /> Creating…</> : <>Create draft</>}
                </button>
              </footer>
            </form>
          </>
      </div>
    </div>
  );
}
