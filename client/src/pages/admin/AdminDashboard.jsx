import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Bell, FileText, Activity, Shield,
  ArrowUpRight, RefreshCw, AlertTriangle, CheckCircle, Server
} from 'lucide-react';
import { getTenants, adminGetAlerts, getAuditLogs, getSystemHealth } from '../../api';
import toast from 'react-hot-toast';
import './AdminDashboard.css';

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ tenants: 0, alerts: 0, logs: 0, health: 'checking' });
  const [recentLogs, setRecentLogs] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tenantsRes, alertsRes, logsRes, healthRes] = await Promise.all([
        getTenants({ limit: 1 }).catch(() => ({ pagination: { total: 0 } })),
        adminGetAlerts({ limit: 5 }).catch(() => ({ pagination: { total: 0 }, alerts: [] })),
        getAuditLogs({ limit: 6 }).catch(() => ({ pagination: { total: 0 }, logs: [] })),
        getSystemHealth().catch(() => null),
      ]);

      setStats({
        tenants: tenantsRes.pagination?.total || 0,
        alerts: alertsRes.pagination?.total || 0,
        logs: logsRes.pagination?.total || 0,
        health: healthRes?.overallStatus || 'unknown',
      });

      setRecentLogs(logsRes.logs || []);
      setRecentAlerts(alertsRes.alerts || []);
      setSystemHealth(healthRes);
    } catch {
      toast.error('Failed to load admin overview data.');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="admin-page-container">
      <div className="admin-header-banner">
        <div>
          <h1 className="admin-page-title"><Shield size={24} style={{ color: '#a855f7' }} /> System Admin Overview</h1>
          <p className="admin-page-subtitle">Platform health, multi-tenant monitoring & administrative controls.</p>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card">
          <div className="kpi-icon-wrap violet"><Users size={22} /></div>
          <div className="kpi-content">
            <span className="kpi-label">Total Tenants</span>
            <span className="kpi-value">{loading ? '...' : stats.tenants}</span>
            <span className="kpi-subtext">Registered SME accounts</span>
          </div>
          <Link to="/admin/tenants" className="kpi-arrow-btn"><ArrowUpRight size={18} /></Link>
        </div>

        <div className="admin-kpi-card">
          <div className="kpi-icon-wrap amber"><Bell size={22} /></div>
          <div className="kpi-content">
            <span className="kpi-label">Active System Alerts</span>
            <span className="kpi-value">{loading ? '...' : stats.alerts}</span>
            <span className="kpi-subtext">Across all accounts</span>
          </div>
          <Link to="/admin/alerts" className="kpi-arrow-btn"><ArrowUpRight size={18} /></Link>
        </div>

        <div className="admin-kpi-card">
          <div className="kpi-icon-wrap blue"><FileText size={22} /></div>
          <div className="kpi-content">
            <span className="kpi-label">Audit Log Records</span>
            <span className="kpi-value">{loading ? '...' : stats.logs}</span>
            <span className="kpi-subtext">Recorded actions</span>
          </div>
          <Link to="/admin/audit-logs" className="kpi-arrow-btn"><ArrowUpRight size={18} /></Link>
        </div>

        <div className="admin-kpi-card">
          <div className="kpi-icon-wrap green"><Activity size={22} /></div>
          <div className="kpi-content">
            <span className="kpi-label">System Health</span>
            <span className="kpi-value badge-wrap">
              {stats.health === 'healthy' && <span className="status-pill status-healthy"><CheckCircle size={14} /> Healthy</span>}
              {stats.health !== 'healthy' && <span className="status-pill status-warning"><AlertTriangle size={14} /> Issues</span>}
            </span>
            <span className="kpi-subtext">Services status</span>
          </div>
          <Link to="/admin/health" className="kpi-arrow-btn"><ArrowUpRight size={18} /></Link>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="admin-dashboard-grid">
        {/* System Services Status */}
        <div className="admin-card">
          <div className="card-header">
            <h3><Server size={18} style={{ color: '#a855f7' }} /> Core Services Status</h3>
            <Link to="/admin/health" className="card-link">Full Health Monitor &rarr;</Link>
          </div>
          <div className="services-status-list">
            <div className="service-row">
              <span className="service-name">API Server (Express / Node.js)</span>
              <span className="status-pill status-healthy">
                <CheckCircle size={14} /> Online ({systemHealth?.server?.memory?.heapUsedMB || 0} MB Heap)
              </span>
            </div>
            <div className="service-row">
              <span className="service-name">MongoDB Database</span>
              <span className={`status-pill ${systemHealth?.database?.status === 'healthy' ? 'status-healthy' : 'status-warning'}`}>
                <CheckCircle size={14} /> {systemHealth?.database?.status || 'checking'} ({systemHealth?.database?.latencyMs || 0}ms)
              </span>
            </div>
            <div className="service-row">
              <span className="service-name">Redis Cache</span>
              <span className="status-pill status-info">
                {systemHealth?.redis?.status || 'checking'}
              </span>
            </div>
            <div className="service-row">
              <span className="service-name">ML Forecast Engine</span>
              <span className={`status-pill ${systemHealth?.mlService?.status === 'healthy' ? 'status-healthy' : 'status-warning'}`}>
                {systemHealth?.mlService?.status || 'unreachable'} ({systemHealth?.mlService?.latencyMs || 0}ms)
              </span>
            </div>
          </div>
        </div>

        {/* Recent System Alerts */}
        <div className="admin-card">
          <div className="card-header">
            <h3><Bell size={18} style={{ color: '#f59e0b' }} /> Recent System Alerts</h3>
            <Link to="/admin/alerts" className="card-link">View All &rarr;</Link>
          </div>
          {recentAlerts.length === 0 ? (
            <p className="empty-text">No active alerts recorded.</p>
          ) : (
            <div className="recent-list">
              {recentAlerts.map(a => (
                <div key={a._id} className="recent-item">
                  <div className={`severity-indicator ${a.severity}`} />
                  <div className="recent-content">
                    <span className="recent-title">{a.title}</span>
                    <span className="recent-meta">Tenant: {a.userId?.email || 'Global'} &bull; {new Date(a.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Audit Logs */}
        <div className="admin-card full-width">
          <div className="card-header">
            <h3><FileText size={18} style={{ color: '#0ea5e9' }} /> Recent Audit Trail</h3>
            <Link to="/admin/audit-logs" className="card-link">View Full Logs &rarr;</Link>
          </div>
          {recentLogs.length === 0 ? (
            <p className="empty-text">No audit logs recorded yet.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map(log => (
                    <tr key={log._id}>
                      <td className="time-col">{new Date(log.createdAt).toLocaleString()}</td>
                      <td>
                        <span className="actor-badge">{log.actorEmail}</span>
                      </td>
                      <td>
                        <span className={`action-pill ${log.action}`}>{log.action}</span>
                      </td>
                      <td className="target-col">{log.target}</td>
                      <td className="ip-col">{log.ipAddress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
