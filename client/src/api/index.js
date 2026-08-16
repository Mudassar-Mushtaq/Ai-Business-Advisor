import axios from 'axios';
import { auth } from '../config/firebase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/',
});

// Automatically attach Firebase ID token to every request
api.interceptors.request.use(async (config) => {
  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.error('Token attach error:', err);
  }
  return config;
});

// Handle 401 errors — redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const syncFirebaseUser = (data) => api.post('/auth/firebase-sync', data).then((r) => r.data);

// Sales
export const getSales = (params) => api.get('/api/sales', { params }).then((r) => r.data);
export const getSalesInsights = () => api.get('/api/sales/insights').then((r) => r.data);
export const getSalesTrend = (period = 30) => api.get('/api/sales/trend', { params: { period } }).then((r) => r.data);
export const getTopProducts = () => api.get('/api/sales/products').then((r) => r.data);
export const getCategories = () => api.get('/api/sales/categories').then((r) => r.data);

// Inventory
export const getInventory = () => api.get('/api/inventory').then((r) => r.data);
export const addInventoryItem = (data) => api.post('/api/inventory', data).then((r) => r.data);
export const updateInventoryItem = (id, data) => api.put(`/api/inventory/${id}`, data).then((r) => r.data);
export const deleteInventoryItem = (id) => api.delete(`/api/inventory/${id}`).then((r) => r.data);
export const getInventoryRecommendations = () =>
  api.get('/api/inventory/recommendations').then((r) => r.data);
export const updateInventoryAlertConfig = (id, data) =>
  api.put(`/api/inventory/${id}/alert-config`, data).then((r) => r.data);
export const getInventoryCategories = () =>
  api.get('/api/inventory/categories').then((r) => r.data);
export const bulkInventoryAlertConfig = (data) =>
  api.post('/api/inventory/bulk-alert-config', data).then((r) => r.data);
export const getNotifications = (params) => api.get('/api/inventory/notifications', { params }).then((r) => r.data);
export const markNotificationRead = (id) => api.put(`/api/inventory/notifications/${id}/read`).then((r) => r.data);
export const markAllNotificationsRead = () => api.put('/api/inventory/notifications/read-all').then((r) => r.data);

// Reorders (Purchase Orders)
export const getReorders = (params) => api.get('/api/reorders', { params }).then((r) => r.data);
export const getReorderStats = () => api.get('/api/reorders/stats').then((r) => r.data);
export const createReorder = (data) => api.post('/api/reorders', data).then((r) => r.data);
export const createReorderFromAlert = (alertId, data = {}) =>
  api.post(`/api/reorders/from-alert/${alertId}`, data).then((r) => r.data);
export const suggestReorder = (data) => api.post('/api/reorders/suggest', data).then((r) => r.data);
export const updateReorder = (id, data) => api.put(`/api/reorders/${id}`, data).then((r) => r.data);
export const updateReorderStatus = (id, status) =>
  api.put(`/api/reorders/${id}/status`, { status }).then((r) => r.data);
export const deleteReorder = (id) => api.delete(`/api/reorders/${id}`).then((r) => r.data);
export const downloadReordersFile = async (format = 'xlsx', params = {}) => {
  const res = await api.get('/api/reorders/export', {
    params: { ...params, format },
    responseType: 'blob',
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([res.data], { type: res.headers['content-type'] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reorders-${stamp}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 250);
};

// Upload
export const uploadFile = (formData, onProgress) =>
  api
    .post('/api/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 5 * 60 * 1000, // 5 minutes for large files
      onUploadProgress: (e) => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
    })
    .then((r) => r.data);

export const getUploadHistory = (limit = 10) =>
  api.get('/api/upload/history', { params: { limit } }).then((r) => r.data);

// Forecast
export const generateForecasts = (forecastDays, model) => {
  const body = {};
  if (forecastDays) body.forecastDays = forecastDays;
  if (model)        body.model = model;
  return api.post('/api/forecast/generate', body).then((r) => r.data);
};
export const getForecasts = () => api.get('/api/forecast').then((r) => r.data);
export const getForecastStatus = () => api.get('/api/forecast/status').then((r) => r.data);
export const resetForecastStatus = () => api.post('/api/forecast/reset-status').then((r) => r.data);

// Auto-analysis
export const getAutoAnalysis = () => api.get('/api/auto-analysis').then((r) => r.data);
export const updateAutoAnalysis = (data) => api.put('/api/auto-analysis', data).then((r) => r.data);
export const runAutoAnalysisNow = () => api.post('/api/auto-analysis/run-now').then((r) => r.data);

// Connectors
export const listConnectors = () => api.get('/api/connectors').then((r) => r.data);
export const startGoogleSheetsConnect = () =>
  api.post('/api/connectors/google_sheets/connect').then((r) => r.data);
export const updateConnectorConfig = (id, data) =>
  api.put(`/api/connectors/${id}/config`, data).then((r) => r.data);
export const describeConnectorSheet = (id, sheetId) =>
  api.get(`/api/connectors/${id}/describe`, { params: { sheetId } }).then((r) => r.data);
export const syncConnectorNow = (id) => api.post(`/api/connectors/${id}/sync`).then((r) => r.data);
export const syncConnector = syncConnectorNow;
export const deleteConnector = (id) => api.delete(`/api/connectors/${id}`).then((r) => r.data);

// Chat
export const sendChatMessage = (messages) => api.post('/api/chat', { messages }).then((r) => r.data);

// Goals
export const getGoals        = (status = 'active') => api.get('/api/goals', { params: { status } }).then((r) => r.data);
export const createGoal      = (data) => api.post('/api/goals', data).then((r) => r.data);
export const updateGoal      = (id, data) => api.put(`/api/goals/${id}`, data).then((r) => r.data);
export const deleteGoal      = (id) => api.delete(`/api/goals/${id}`).then((r) => r.data);
export const getGoalProgress = (id) => api.get(`/api/goals/${id}/progress`).then((r) => r.data);

// Briefs
export const getBriefs           = (limit = 12) => api.get('/api/brief', { params: { limit } }).then((r) => r.data);
export const getLatestBrief      = () => api.get('/api/brief/latest').then((r) => r.data);
export const generateBriefNow    = () => api.post('/api/brief/generate-now').then((r) => r.data);
export const getBriefSettings    = () => api.get('/api/brief/settings').then((r) => r.data);
export const updateBriefSettings = (data) => api.put('/api/brief/settings', data).then((r) => r.data);
export const testBriefDelivery   = (channel) => api.post('/api/brief/settings/test', { channel }).then((r) => r.data);

// Admin - Alerts
export const adminGetAlerts    = (params) => api.get('/api/admin/alerts', { params }).then((r) => r.data);
export const adminCreateAlert  = (data) => api.post('/api/admin/alerts', data).then((r) => r.data);
export const adminUpdateAlert  = (id, data) => api.put(`/api/admin/alerts/${id}`, data).then((r) => r.data);
export const adminDeleteAlert  = (id) => api.delete(`/api/admin/alerts/${id}`).then((r) => r.data);

// Admin - Audit Logs
export const getAuditLogs     = (params) => api.get('/api/admin/audit-logs', { params }).then((r) => r.data);
export const getAuditLogStats = () => api.get('/api/admin/audit-logs/stats').then((r) => r.data);

// Admin - Tenants
export const getTenants        = (params) => api.get('/api/admin/tenants', { params }).then((r) => r.data);
export const getTenantDetails  = (id) => api.get(`/api/admin/tenants/${id}`).then((r) => r.data);
export const updateTenant       = (id, data) => api.put(`/api/admin/tenants/${id}`, data).then((r) => r.data);
export const suspendTenant      = (id) => api.put(`/api/admin/tenants/${id}/suspend`).then((r) => r.data);
export const updateTenantRole   = (id, role) => api.put(`/api/admin/tenants/${id}/role`, { role }).then((r) => r.data);
export const deleteTenant       = (id) => api.delete(`/api/admin/tenants/${id}`).then((r) => r.data);

// Admin - System Health
export const getSystemHealth   = () => api.get('/api/admin/health').then((r) => r.data);

export default api;
