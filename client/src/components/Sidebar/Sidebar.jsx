import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Upload, TrendingUp, Package,
  BarChart2, LogOut, Bot, ChevronLeft, ChevronRight,
  Zap, X, Plug, Target, Sparkles, BellRing, ShoppingCart, Shield
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getNotifications } from '../../api';
import Chatbot from '../Chatbot/Chatbot';
import './Sidebar.css';

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/upload',     icon: Upload,          label: 'Upload Data' },
  { to: '/connections',icon: Plug,            label: 'Connections' },
  { to: '/sales',      icon: BarChart2,       label: 'Sales'       },
  { to: '/forecasts',  icon: TrendingUp,      label: 'Forecasts'   },
  { to: '/inventory',  icon: Package,         label: 'Inventory'   },
  { to: '/reorders',   icon: ShoppingCart,    label: 'Reorders'    },
  { to: '/goals',      icon: Target,          label: 'Goals'       },
  { to: '/briefs',     icon: Sparkles,        label: 'Weekly Brief' },
  { to: '/alerts',     icon: BellRing,        label: 'Alerts',       badgeKey: 'alerts' },
];

export default function Sidebar({ mobileOpen = false, onMobileClose = () => {} }) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    const open = () => setChatOpen(true);
    window.addEventListener('aiba:open-chat', open);
    return () => window.removeEventListener('aiba:open-chat', open);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const notifs = await getNotifications();
        if (cancelled) return;
        setUnreadAlerts((notifs || []).filter(n => !n.read).length);
      } catch { /* ignore — sidebar count is non-critical */ }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60_000);
    window.addEventListener('aiba:notifications-updated', fetchUnread);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('aiba:notifications-updated', fetchUnread);
    };
  }, [user]);

  const badgeFor = (key) => key === 'alerts' ? unreadAlerts : 0;

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}

      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="logo-icon"><Zap size={20} /></div>
          {!collapsed && <span className="logo-text">AI Business Advisor</span>}
          <button className="collapse-btn desktop-only" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button className="collapse-btn mobile-only" onClick={onMobileClose} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {!collapsed && <p className="nav-section-label">Menu</p>}
          {navItems.map(({ to, icon: Icon, label, badgeKey }) => {
            const count = badgeKey ? badgeFor(badgeKey) : 0;
            return (
              <NavLink
                key={to}
                to={to}
                onClick={onMobileClose}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-item__icon-wrap">
                  <Icon size={20} />
                  {collapsed && count > 0 && <span className="nav-item__dot" />}
                </span>
                {!collapsed && <span>{label}</span>}
                {!collapsed && count > 0 && (
                  <span className="nav-item__badge">{count > 99 ? '99+' : count}</span>
                )}
              </NavLink>
            );
          })}
          {user?.role === 'admin' && (
            <NavLink
              to="/admin"
              onClick={onMobileClose}
              className={({ isActive }) => `nav-item admin-link ${isActive ? 'active' : ''}`}
              style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, color: '#a855f7' }}
            >
              <span className="nav-item__icon-wrap">
                <Shield size={20} />
              </span>
              {!collapsed && <span style={{ fontWeight: 600 }}>Admin Panel</span>}
            </NavLink>
          )}
        </nav>

        {/* AI Chatbot Toggle */}
        <div className="sidebar-footer">
          <button className="nav-item chatbot-btn" onClick={() => setChatOpen(true)}>
            <Bot size={20} />
            {!collapsed && <span>AI Advisor</span>}
            {!collapsed && <span className="pulse-dot" style={{ marginLeft: 'auto' }} />}
          </button>

          {/* User profile */}
          {user && (
            <div className="user-profile">
              {user.avatar
                ? <img src={user.avatar} alt={user.name} className="user-avatar" referrerPolicy="no-referrer" />
                : <div className="user-avatar-placeholder">{user.name?.[0]}</div>
              }
              {!collapsed && (
                <div className="user-info">
                  <span className="user-name">{user.name}</span>
                  <span className="user-email">{user.email}</span>
                </div>
              )}
              {!collapsed && (
                <button className="logout-btn" onClick={logout} title="Logout">
                  <LogOut size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* AI Chatbot Panel */}
      <Chatbot open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
