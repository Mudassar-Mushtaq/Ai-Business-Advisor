import { Menu, Search, Sun, Moon, Command } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import './Topbar.css';

export default function Topbar({ onMenuClick, onSearchClick }) {
  const { theme, toggle } = useTheme();
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  return (
    <div className="topbar">
      <button className="topbar-menu-btn" onClick={onMenuClick} aria-label="Open menu">
        <Menu size={20} />
      </button>

      <button className="topbar-search" onClick={onSearchClick} aria-label="Open search">
        <Search size={15} />
        <span className="topbar-search-text">Search or jump to...</span>
        <span className="topbar-kbd">
          {isMac ? <Command size={11} /> : 'Ctrl'}<span>K</span>
        </span>
      </button>

      <div className="topbar-right">
        <button
          className="topbar-icon-btn"
          onClick={toggle}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </div>
  );
}
