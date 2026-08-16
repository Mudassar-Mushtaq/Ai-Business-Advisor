import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, Bell, FileText, Users, Activity,
  ChevronLeft, ChevronRight, ArrowLeft, Shield, X, LogOut
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './AdminSidebar.css';

const adminNavItems = [
  { to: '/admin',             icon: LayoutDashboard, label: 'Overview',      exact: true },
  { to: '/admin/alerts',      icon: Bell,            label: 'Manage Alerts'  },
  { to: '/admin/audit-logs',  icon: FileText,        label: 'Audit Logs'     },
  { to: '/admin/tenants',     icon: Users,           label: 'Manage Tenants' },
  { to: '/admin/health',      icon: Activity,        label: 'System Health'  },
];

export default function AdminSidebar({ mobileOpen = false, onMobileClose = () => {} }) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}

      <aside className={`admin-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Logo Header */}
        <div className="admin-sidebar-logo">
          <div className="admin-logo-icon"><Shield size={20} /></div>
          {!collapsed && (
            <div className="logo-title-group">
              <span className="logo-text">System Admin</span>
              <span className="logo-badge">Control Center</span>
            </div>
          )}
          <button className="collapse-btn desktop-only" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button className="collapse-btn mobile-only" onClick={onMobileClose}>
            <X size={16} />
          </button>
        </div>

        {/* Back to App Switcher */}
        <div className="admin-back-wrap">
          <NavLink to="/dashboard" className="admin-back-btn">
            <ArrowLeft size={16} />
            {!collapsed && <span>Back to SME App</span>}
          </NavLink>
        </div>

        {/* Navigation */}
        <nav className="admin-sidebar-nav">
          {!collapsed && <p className="nav-section-label">Admin Features</p>}
          {adminNavItems.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={onMobileClose}
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-item__icon-wrap">
                <Icon size={20} />
              </span>
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User Footer */}
        <div className="admin-sidebar-footer">
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
    </>
  );
}
