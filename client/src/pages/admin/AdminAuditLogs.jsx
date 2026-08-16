import { useEffect, useState } from 'react';
import { FileText, Search, Filter, RefreshCw, Download } from 'lucide-react';
import { getAuditLogs, getAuditLogStats } from '../../api';
import toast from 'react-hot-toast';
import './AdminAuditLogs.css';

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState(null);

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const [logsData, statsData] = await Promise.all([
        getAuditLogs({ page, limit: 20, action: actionFilter, search }),
        getAuditLogStats().catch(() => null),
      ]);

      setLogs(logsData.logs || []);
      setPagination(logsData.pagination || { page: 1, pages: 1, total: 0 });
      setStats(statsData);
    } catch {
      toast.error('Failed to load audit logs.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs(1);
  }, [actionFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const headers = ['Timestamp', 'Actor Email', 'Action', 'Target Model', 'Target', 'IP Address'];
    const rows = logs.map(l => [
      new Date(l.createdAt).toISOString(),
      l.actorEmail,
      l.action,
      l.targetModel,
      `"${l.target.replace(/"/g, '""')}"`,
      l.ipAddress,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-header-banner">
        <div>
          <h1 className="admin-page-title"><FileText size={24} style={{ color: '#0ea5e9' }} /> System Audit Logs</h1>
          <p className="admin-page-subtitle">Complete chronological activity log & security audit trail.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="admin-btn admin-btn-secondary" onClick={() => fetchLogs(pagination.page)}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="admin-btn admin-btn-primary" onClick={handleExportCSV}>
            <Download size={16} /> Export to CSV
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <form onSubmit={handleSearchSubmit} className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search actor email, target, or action..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div className="filter-group">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">All Action Types</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="suspend">Suspend</option>
            <option value="activate">Activate</option>
            <option value="promote">Promote</option>
            <option value="alert_create">Alert Broadcast</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="admin-card">
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /><p>Loading audit trail...</p></div>
        ) : logs.length === 0 ? (
          <p className="empty-text">No audit logs found matching criteria.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Model</th>
                  <th>Target Details</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id}>
                    <td className="time-col">{new Date(log.createdAt).toLocaleString()}</td>
                    <td>
                      <span className="actor-badge">{log.actorEmail}</span>
                    </td>
                    <td>
                      <span className={`action-pill ${log.action}`}>{log.action}</span>
                    </td>
                    <td><span className="type-tag">{log.targetModel}</span></td>
                    <td className="target-col">{log.target}</td>
                    <td className="ip-col">{log.ipAddress}</td>
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
              onClick={() => fetchLogs(pagination.page - 1)}
              className="admin-btn admin-btn-secondary"
            >
              Previous
            </button>
            <span>Page {pagination.page} of {pagination.pages} (Total {pagination.total})</span>
            <button
              disabled={pagination.page >= pagination.pages}
              onClick={() => fetchLogs(pagination.page + 1)}
              className="admin-btn admin-btn-secondary"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
