import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Plus, X, Search } from 'lucide-react';
import './CategorySelect.css';

/**
 * Reusable category picker.
 *
 * Props:
 *   options          — string[] OR { value, label, count? }[]
 *   value            — current value (string) or '' for none
 *   onChange         — (newValue) => void
 *   allowCreate      — if true, user can type a brand-new category
 *   placeholder      — input placeholder
 *   clearable        — show an "x" to clear
 *   variant          — 'filter' (compact) | 'input' (form field) | 'pill' (rounded chip)
 *   size             — 'sm' | 'md'
 */
export default function CategorySelect({
  options = [],
  value = '',
  onChange,
  allowCreate = false,
  placeholder = 'Select category',
  clearable = true,
  variant = 'filter',
  size = 'md',
}) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const rootRef             = useRef(null);
  const inputRef            = useRef(null);

  // Normalize options to { value, label, count? }
  const normalized = useMemo(() => {
    return (options || [])
      .map((o) => (typeof o === 'string' ? { value: o, label: o } : { ...o, label: o.label || o.value }))
      .filter((o) => o.value != null && o.value !== '');
  }, [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [normalized, query]);

  const canCreate = allowCreate
    && query.trim().length > 0
    && !normalized.some((o) => String(o.label).toLowerCase() === query.trim().toLowerCase());

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Focus the search input when opening
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const select = (val) => {
    onChange?.(val);
    setQuery('');
    setOpen(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length) select(filtered[0].value);
      else if (canCreate) select(query.trim());
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const displayLabel = value
    ? (normalized.find((o) => o.value === value)?.label || value)
    : '';

  return (
    <div
      ref={rootRef}
      className={`cs cs--${variant} cs--${size} ${open ? 'cs--open' : ''}`}
    >
      <button
        type="button"
        className="cs-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`cs-value ${!displayLabel ? 'cs-value--placeholder' : ''}`}>
          {displayLabel || placeholder}
        </span>
        <span className="cs-actions">
          {clearable && value && (
            <span
              role="button"
              tabIndex={-1}
              className="cs-clear"
              onClick={(e) => { e.stopPropagation(); select(''); }}
              aria-label="Clear"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={15} className="cs-caret" />
        </span>
      </button>

      {open && (
        <div className="cs-menu" role="listbox">
          <div className="cs-search">
            <Search size={13} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder={allowCreate ? 'Search or type new…' : 'Search…'}
            />
          </div>

          <div className="cs-list">
            {filtered.length === 0 && !canCreate && (
              <div className="cs-empty">No matches</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`cs-option ${o.value === value ? 'cs-option--selected' : ''}`}
                onClick={() => select(o.value)}
              >
                <span className="cs-option-label">{o.label}</span>
                <span className="cs-option-right">
                  {o.count != null && <span className="cs-option-count">{o.count}</span>}
                  {o.value === value && <Check size={13} />}
                </span>
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                className="cs-option cs-option--create"
                onClick={() => select(query.trim())}
              >
                <Plus size={13} />
                <span>Add &ldquo;<strong>{query.trim()}</strong>&rdquo;</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
