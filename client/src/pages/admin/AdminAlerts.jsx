import { useEffect, useState } from 'react';
import {
  Bell, Plus, Trash2, Edit2, Filter, Search,
  RefreshCw, CheckCircle, AlertTriangle, Info, Send, X
} from 'lucide-react';
import { adminGetAlerts, adminCreateAlert, adminDeleteAlert, getTenants } from '../../api';
import toast from 'react-hot-toast';
import './AdminAlerts.css';

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Form state for creating a new alert
  const [tenants, setTenants] = useState([]);
  const [formData, setFormData] = useState({
    tenantId: 'all',
    type: 'anomaly',
    severity: 'warning',
    title: '',
    message: '',
    product: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchAlerts = async (page = 1) => {
    setLoading(true);
    try {
      const data = await adminGetAlerts({
        page,
        limit: 15,
        severity: severityFilter,
        search,
      });
      setAlerts(data.alerts || []);
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
    } catch {
      toast.error('Failed to load system alerts.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAlerts(1);
  }, [severityFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchAlerts(1);
  };

  const openCreateModal = async () => {
    setShowModal(true);
    try {
      const data = await getTenants({ limit: 100 });
      setTenants(data.tenants || []);
    } catch {
      console.error('Failed to load tenant list for modal.');
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.message) {
      toast.error('Please enter title and message.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminCreateAlert(formData);
      toast.success(res.message || 'Alert created successfully!');
      setShowModal(false);
      setFormData({ tenantId: 'all', type: 'anomaly', severity: 'warning', title: '', message: '', product: '' });
      fetchAlerts(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create alert.');
    }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this alert?')) return;
    try {
      await adminDeleteAlert(id);
      toast.success('Alert deleted.');
      fetchAlerts(pagination.page);
    } catch {
      toast.error('Failed to delete alert.');
    }
  };

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-header-banner">
        <div>
          <h1 className="admin-page-title"><Bell size={24} style={{ color: '#f59e0b' }} /> Manage System Alerts</h1>
          <p className="admin-page-subtitle">View, broadcast, and edit system alerts across all tenant accounts.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="admin-btn admin-btn-secondary" onClick={() => fetchAlerts(pagination.page)}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="admin-btn admin-btn-primary" onClick={openCreateModal}>
            <Plus size={16} /> Broadcast / Create Alert
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <form onSubmit={handleSearchSubmit} className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by title, message or product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div className="filter-group">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="admin-card">
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /><p>Loading alerts...</p></div>
        ) : alerts.length === 0 ? (
          <p className="empty-text">No alerts found matching current filter.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Title & Details</th>
                  <th>Target Tenant</th>
                  <th>Type</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a._id}>
                    <td>
                      <span className={`status-pill ${a.severity === 'critical' ? 'status-warning' : a.severity === 'warning' ? 'status-warning' : 'status-info'}`}>
                        {a.severity === 'critical' ? <AlertTriangle size={14} /> : <Info size={14} />}
                        {a.severity}
                      </span>
                    </td>
                    <td>
                      <div className="alert-detail">
                        <strong className="alert-title-text">{a.title}</strong>
                        <p className="alert-msg-text">{a.message}</p>
                      </div>
                    </td>
                    <td>
                      <span className="tenant-email-tag">
                        {a.userId?.email || 'System Wide'}
                      </span>
                    </td>
                    <td><span className="type-tag">{a.type}</span></td>
                    <td className="time-col">{new Date(a.createdAt).toLocaleString()}</td>
                    <td>
                      <button className="icon-action-btn danger" onClick={() => handleDelete(a._id)} title="Delete Alert">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.pages > 1 && (
          <div className="pagination-bar">
            <button
              disabled={pagination.page <= 1}
              onClick={() => fetchAlerts(pagination.page - 1)}
              className="admin-btn admin-btn-secondary"
            >
              Previous
            </button>
            <span>Page {pagination.page} of {pagination.pages}</span>
            <button
              disabled={pagination.page >= pagination.pages}
              onClick={() => fetchAlerts(pagination.page + 1)}
              className="admin-btn admin-btn-secondary"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Create Alert Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="admin-modal">
            <div className="modal-header">
              <h3><Send size={18} style={{ color: '#a855f7' }} /> Create / Broadcast Alert</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateSubmit} className="modal-body">
              <div className="form-group">
                <label>Target Tenant</label>
                <select
                  value={formData.tenantId}
                  onChange={(e) => setFormData({ ...formData, tenantId: e.target.value })}
                >
                  <option value="all">Broadcast to All Tenants</option>
                  {tenants.map(t => (
                    <option key={t._id} value={t._id}>{t.name} ({t.email})</option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Severity</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  >
                    <option value="anomaly">Anomaly</option>
                    <option value="low_stock">Low Stock</option>
                    <option value="high_sales">High Sales</option>
                    <option value="forecast_ready">Forecast Ready</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Alert Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Scheduled System Maintenance"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Alert Message *</label>
                <textarea
                  rows={4}
                  placeholder="e.g. System upgrade scheduled for midnight..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  required
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={submitting}>
                  {submitting ? 'Sending...' : 'Send Alert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
