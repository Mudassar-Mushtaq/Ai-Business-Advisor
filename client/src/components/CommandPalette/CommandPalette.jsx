import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Upload, TrendingUp, Package, BarChart2,
  Search, Sun, Moon, FileDown, Cpu, Bot, ArrowRight, BellRing, ShoppingCart
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import './CommandPalette.css';

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const commands = useMemo(() => [
    { id:'go-dashboard', group:'Navigate', label:'Go to Dashboard',  shortcut:'G D', icon: LayoutDashboard, action: () => navigate('/dashboard') },
    { id:'go-upload',    group:'Navigate', label:'Upload Data',      shortcut:'G U', icon: Upload,         action: () => navigate('/upload') },
    { id:'go-sales',     group:'Navigate', label:'View Sales',       shortcut:'G S', icon: BarChart2,      action: () => navigate('/sales') },
    { id:'go-forecasts', group:'Navigate', label:'Open Forecasts',   shortcut:'G F', icon: TrendingUp,     action: () => navigate('/forecasts') },
    { id:'go-inventory', group:'Navigate', label:'Open Inventory',   shortcut:'G I', icon: Package,        action: () => navigate('/inventory') },
    { id:'go-alerts',    group:'Navigate', label:'View Alerts',      shortcut:'G A', icon: BellRing,       action: () => navigate('/alerts') },
    { id:'go-reorders',  group:'Navigate', label:'View Reorders',    shortcut:'G R', icon: ShoppingCart,   action: () => navigate('/reorders') },
    { id:'theme-toggle', group:'Settings', label:`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
      icon: theme === 'dark' ? Sun : Moon, action: toggle },
    { id:'gen-forecast', group:'Actions',  label:'Generate Forecasts', icon: Cpu,
      action: () => { navigate('/forecasts'); setTimeout(() => window.dispatchEvent(new CustomEvent('aiba:generate-forecasts')), 250); } },
    { id:'export-csv',   group:'Actions',  label:'Export Sales as CSV', icon: FileDown,
      action: () => window.dispatchEvent(new CustomEvent('aiba:export-csv')) },
    { id:'open-chat',    group:'Actions',  label:'Open AI Advisor',  icon: Bot,
      action: () => window.dispatchEvent(new CustomEvent('aiba:open-chat')) },
  ], [navigate, theme, toggle]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(c => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [query, commands]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
      else if (e.key === 'Enter')     {
        e.preventDefault();
        const cmd = filtered[active];
        if (cmd) { cmd.action(); onClose(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, active, onClose]);

  if (!open) return null;

  let lastGroup = null;

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk-panel" onClick={e => e.stopPropagation()} role="dialog" aria-label="Command Palette">
        <div className="cmdk-input-wrap">
          <Search size={16} />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Type a command or search..."
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
          />
          <span className="cmdk-esc">esc</span>
        </div>

        <div className="cmdk-list">
          {filtered.length === 0 ? (
            <div className="cmdk-empty">No results for "{query}"</div>
          ) : filtered.map((cmd, i) => {
            const showGroup = cmd.group !== lastGroup;
            lastGroup = cmd.group;
            const Icon = cmd.icon;
            return (
              <div key={cmd.id}>
                {showGroup && <div className="cmdk-group">{cmd.group}</div>}
                <button
                  className={`cmdk-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { cmd.action(); onClose(); }}
                >
                  <Icon size={16} />
                  <span className="cmdk-item-label">{cmd.label}</span>
                  {cmd.shortcut && <span className="cmdk-shortcut">{cmd.shortcut}</span>}
                  <ArrowRight size={14} className="cmdk-arrow" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="cmdk-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
