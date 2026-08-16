import { useEffect, useState } from 'react';
import {
  Activity, RefreshCw, Server, Database, Cpu, Zap,
  CheckCircle, AlertTriangle, XCircle, Clock, ShieldCheck
} from 'lucide-react';
import { getSystemHealth } from '../../api';
import toast from 'react-hot-toast';
import './AdminSystemHealth.css';

export default function AdminSystemHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const data = await getSystemHealth();
      setHealth(data);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch {
      toast.error('Failed to fetch system health metrics.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHealth();
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchHealth, 15000); // 15 sec polling
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const formatUptime = (sec) => {
    if (!sec) return '0m';
    const d = Math.floor(sec / (3600 * 24));
    const h = Math.floor((sec % (3600 * 24)) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${d > 0 ? d + 'd ' : ''}${h > 0 ? h + 'h ' : ''}${m}m`;
  };

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-header-banner">
        <div>
          <h1 className="admin-page-title"><Activity size={24} style={{ color: '#10b981' }} /> System Health Monitor</h1>
          <p className="admin-page-subtitle">Real-time status, network latency & infrastructure telemetry.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto Refresh (15s)</span>
          </label>
          <button className="admin-btn admin-btn-secondary" onClick={fetchHealth} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh Now
          </button>
        </div>
      </div>

      {lastRefreshed && (
        <div className="refresh-stamp-bar">
          <Clock size={14} /> Last updated at {lastRefreshed}
        </div>
      )}

      {/* Overall Health Status Banner */}
      <div className={`health-status-banner ${health?.overallStatus === 'healthy' ? 'banner-healthy' : 'banner-warning'}`}>
        <div className="banner-icon-wrap">
          {health?.overallStatus === 'healthy' ? (
            <ShieldCheck size={32} />
          ) : (
            <AlertTriangle size={32} />
          )}
        </div>
        <div className="banner-text">
          <h2>
            System Status: {health?.overallStatus === 'healthy' ? 'All Systems Operational' : 'Degraded Performance Detected'}
          </h2>
          <p>
            {health?.overallStatus === 'healthy'
              ? 'All core services (Node.js API, MongoDB, Redis, ML Engine) are responding normally.'
              : 'One or more services reported high latency or disconnection. Review service details below.'}
          </p>
        </div>
      </div>

      {/* Service Cards Grid */}
      <div className="health-cards-grid">
        {/* API Server Card */}
        <div className="health-card">
          <div className="health-card-header">
            <div className="service-title-group">
              <Server size={20} className="service-icon purple" />
              <div>
                <h3>Node.js Express Server</h3>
                <span className="sub-tag">API Runtime Engine</span>
              </div>
            </div>
            <span className="status-pill status-healthy"><CheckCircle size={14} /> Online</span>
          </div>
          <div className="telemetry-rows">
            <div className="telemetry-item">
              <span className="tel-label">Process Uptime</span>
              <span className="tel-val">{formatUptime(health?.server?.uptimeSeconds)}</span>
            </div>
            <div className="telemetry-item">
              <span className="tel-label">Heap Memory Used</span>
              <span className="tel-val">{health?.server?.memory?.heapUsedMB} MB</span>
            </div>
            <div className="telemetry-item">
              <span className="tel-label">RSS Memory</span>
              <span className="tel-val">{health?.server?.memory?.rssMB} MB</span>
            </div>
            <div className="telemetry-item">
              <span className="tel-label">Node Version</span>
              <span className="tel-val">{health?.server?.nodeVersion}</span>
            </div>
          </div>
        </div>

        {/* MongoDB Card */}
        <div className="health-card">
          <div className="health-card-header">
            <div className="service-title-group">
              <Database size={20} className="service-icon green" />
              <div>
                <h3>MongoDB Database</h3>
                <span className="sub-tag">Cosmos / Atlas Engine</span>
              </div>
            </div>
            <span className={`status-pill ${health?.database?.status === 'healthy' ? 'status-healthy' : 'status-warning'}`}>
              {health?.database?.status === 'healthy' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
              {health?.database?.status || 'checking'}
            </span>
          </div>
          <div className="telemetry-rows">
            <div className="telemetry-item">
              <span className="tel-label">Ping Latency</span>
              <span className="tel-val highlight">{health?.database?.latencyMs} ms</span>
            </div>
            <div className="telemetry-item">
              <span className="tel-label">Connection Host</span>
              <span className="tel-val font-mono">{health?.database?.connectionHost}</span>
            </div>
            <div className="telemetry-item">
              <span className="tel-label">Total Users Count</span>
              <span className="tel-val">{health?.database?.collections?.users || 0}</span>
            </div>
            <div className="telemetry-item">
              <span className="tel-label">Total Sales Records</span>
              <span className="tel-val">{health?.database?.collections?.sales || 0}</span>
            </div>
          </div>
        </div>

        {/* Redis Cache Card */}
        <div className="health-card">
          <div className="health-card-header">
            <div className="service-title-group">
              <Zap size={20} className="service-icon amber" />
              <div>
                <h3>Redis Cache</h3>
                <span className="sub-tag">In-Memory Store</span>
              </div>
            </div>
            <span className={`status-pill ${health?.redis?.status === 'healthy' ? 'status-healthy' : 'status-info'}`}>
              {health?.redis?.status}
            </span>
          </div>
          <div className="telemetry-rows">
            <div className="telemetry-item">
              <span className="tel-label">Cache Integration</span>
              <span className="tel-val">{health?.redis?.status === 'healthy' ? 'Active' : 'Optional / Standby'}</span>
            </div>
            <div className="telemetry-item">
              <span className="tel-label">Status</span>
              <span className="tel-val">{health?.redis?.status}</span>
            </div>
          </div>
        </div>

        {/* ML Forecast Engine Card */}
        <div className="health-card">
          <div className="health-card-header">
            <div className="service-title-group">
              <Cpu size={20} className="service-icon blue" />
              <div>
                <h3>ML Forecast Service</h3>
                <span className="sub-tag">FastAPI / Python Service</span>
              </div>
            </div>
            <span className={`status-pill ${health?.mlService?.status === 'healthy' ? 'status-healthy' : 'status-warning'}`}>
              {health?.mlService?.status === 'healthy' ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {health?.mlService?.status}
            </span>
          </div>
          <div className="telemetry-rows">
            <div className="telemetry-item">
              <span className="tel-label">Response Time</span>
              <span className="tel-val highlight">{health?.mlService?.latencyMs || 0} ms</span>
            </div>
            <div className="telemetry-item">
              <span className="tel-label">Target URL</span>
              <span className="tel-val font-mono">{health?.mlService?.url}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
