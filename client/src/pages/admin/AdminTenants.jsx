import { useEffect, useState } from 'react';
import {
  Users, Search, Filter, RefreshCw, Shield,
  Ban, CheckCircle, Trash2, Edit, ShieldAlert, Eye, X
} from 'lucide-react';
import {
  getTenants, suspendTenant, updateTenantRole, deleteTenant,
  getTenantDetails, updateTenant
} from '../../api';
import toast from 'react-hot-toast';
import './AdminTenants.css';

export default function AdminTenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal details state
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [detailModal, setDetailModal] = useState(false);
  const [editModal, setEditModal] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({ name: '', email: '' });

  const fetchTenants = async (page = 1) => {
    setLoading(true);
    try {
      const data = await getTenants({ page, limit: 15, search, status: statusFilter });
      setTenants(data.tenants || []);
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
    } catch {
      toast.error('Failed to load tenant accounts.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTenants(1);
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchTenants(1);
  };

  const handleToggleSuspend = async (tenant) => {
    const actionWord = tenant.isActive ? 'suspend' : 'activate';
    if (!window.confirm(`Are you sure you want to ${actionWord} account ${tenant.email}?`)) return;

    try {
      const res = await suspendTenant(tenant._id);
      toast.success(res.message);
      fetchTenants(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${actionWord} tenant.`);
    }
  };

  const handleToggleRole = async (tenant) => {
    const newRole = tenant.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Are you sure you want to change role of ${tenant.email} to ${newRole}?`)) return;

    try {
      const res = await updateTenantRole(tenant._id, newRole);
      toast.success(res.message);
      fetchTenants(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user role.');
    }
  };

  const handleDeleteTenant = async (tenant) => {
    if (!window.confirm(`DANGER: Are you sure you want to PERMANENTLY delete ${tenant.email} and ALL their sales/inventory data? This cannot be undone!`)) return;

    try {
      const res = await deleteTenant(tenant._id);
      toast.success(res.message);
      fetchTenants(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete tenant.');
    }
  };

  const openDetails = async (id) => {
    try {
      const data = await getTenantDetails(id);
      setSelectedTenant(data.tenant);
      setDetailModal(true);
    } catch {
      toast.error('Failed to load tenant details.');
    }
  };

  const openEdit = (tenant) => {
    setSelectedTenant(tenant);
    setEditForm({ name: tenant.name, email: tenant.email });
    setEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateTenant(selectedTenant._id, editForm);
      toast.success('Tenant info updated.');
      setEditModal(false);
      fetchTenants(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update tenant.');
    }
  };

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-header-banner">
        <div>
          <h1 className="admin-page-title"><Users size={24} style={{ color: '#a855f7' }} /> Manage Tenant Accounts</h1>
          <p className="admin-page-subtitle">Inspect registered SME accounts, manage roles, suspend or remove tenants.</p>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={() => fetchTenants(pagination.page)}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <form onSubmit={handleSearchSubmit} className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search tenant name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div className="filter-group">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Accounts</option>
            <option value="active">Active Tenants</option>
            <option value="suspended">Suspended Tenants</option>
            <option value="admin">Admin Users</option>
          </select>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="admin-card">
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /><p>Loading tenant accounts...</p></div>
        ) : tenants.length === 0 ? (
          <p className="empty-text">No tenant accounts found matching search.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User / Tenant</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Data Usage</th>
                  <th>Joined Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t._id}>
                    <td>
                      <div className="user-cell">
                        {t.avatar ? (
                          <img src={t.avatar} alt={t.name} className="user-avatar-sm" />
                        ) : (
                          <div className="avatar-placeholder-sm">{t.name?.[0]}</div>
                        )}
                        <div className="user-name-group">
                          <strong className="user-name-text">{t.name}</strong>
                          <span className="user-email-text">{t.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge ${t.role}`}>
                        {t.role === 'admin' ? <Shield size={12} /> : null}
                        {t.role}
                      </span>
                    </td>
                    <td>
                      {t.isActive !== false ? (
                        <span className="status-pill status-healthy"><CheckCircle size={12} /> Active</span>
                      ) : (
                        <span className="status-pill status-warning"><Ban size={12} /> Suspended</span>
                      )}
                    </td>
                    <td>
                      <div className="data-counts">
                        <span>Sales: {t.stats?.salesCount || 0}</span> &bull;{' '}
                        <span>Items: {t.stats?.inventoryCount || 0}</span>
                      </div>
                    </td>
                    <td className="time-col">{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="action-buttons-cell">
                        <button className="icon-action-btn" onClick={() => openDetails(t._id)} title="View Details">
                          <Eye size={16} />
                        </button>
                        <button className="icon-action-btn" onClick={() => openEdit(t)} title="Edit Info">
                          <Edit size={16} />
                        </button>
                        <button
                          className={`icon-action-btn ${t.role === 'admin' ? 'warning' : ''}`}
                          onClick={() => handleToggleRole(t)}
                          title={t.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                        >
                          <ShieldAlert size={16} />
                        </button>
                        <button
                          className={`icon-action-btn ${t.isActive !== false ? 'warning' : 'success'}`}
                          onClick={() => handleToggleSuspend(t)}
                          title={t.isActive !== false ? 'Suspend Account' : 'Activate Account'}
                        >
                          <Ban size={16} />
                        </button>
                        <button className="icon-action-btn danger" onClick={() => handleDeleteTenant(t)} title="Delete Tenant">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="pagination-bar">
            <button
              disabled={pagination.page <= 1}
              onClick={() => fetchTenants(pagination.page - 1)}
              className="admin-btn admin-btn-secondary"
            >
              Previous
            </button>
            <span>Page {pagination.page} of {pagination.pages}</span>
            <button
              disabled={pagination.page >= pagination.pages}
              onClick={() => fetchTenants(pagination.page + 1)}
              className="admin-btn admin-btn-secondary"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Tenant Details Modal */}
      {detailModal && selectedTenant && (
        <div className="modal-backdrop">
          <div className="admin-modal">
            <div className="modal-header">
              <h3><Users size={18} style={{ color: '#a855f7' }} /> Tenant Account Details</h3>
              <button className="close-btn" onClick={() => setDetailModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="detail-profile-header">
                <div className="user-avatar-lg">{selectedTenant.name?.[0]}</div>
                <div>
                  <h4>{selectedTenant.name}</h4>
                  <p>{selectedTenant.email}</p>
                </div>
              </div>

              <div className="detail-stats-grid">
                <div className="detail-stat-box">
                  <span className="stat-num">{selectedTenant.stats?.salesCount || 0}</span>
                  <span className="stat-lbl">Sales Records</span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-num">{selectedTenant.stats?.inventoryCount || 0}</span>
                  <span className="stat-lbl">Inventory Items</span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-num">{selectedTenant.stats?.forecastsCount || 0}</span>
                  <span className="stat-lbl">Forecasts</span>
                </div>
                <div className="detail-stat-box">
                  <span className="stat-num">{selectedTenant.stats?.alertsCount || 0}</span>
                  <span className="stat-lbl">Alerts</span>
                </div>
              </div>

              <div className="modal-footer">
                <button className="admin-btn admin-btn-secondary" onClick={() => setDetailModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tenant Modal */}
      {editModal && selectedTenant && (
        <div className="modal-backdrop">
          <div className="admin-modal">
            <div className="modal-header">
              <h3><Edit size={18} style={{ color: '#a855f7' }} /> Edit Tenant Profile</h3>
              <button className="close-btn" onClick={() => setEditModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="modal-body">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setEditModal(false)}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
