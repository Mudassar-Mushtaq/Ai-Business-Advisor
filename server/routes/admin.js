const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/asyncHandler');
const User = require('../models/User');
const Alert = require('../models/Alert');
const AuditLog = require('../models/AuditLog');
const SalesData = require('../models/SalesData');
const InventoryItem = require('../models/InventoryItem');
const Forecast = require('../models/Forecast');
const cache = require('../config/cache');
const { logAudit } = require('../utils/auditLogger');

const router = express.Router();

// Apply auth and admin check to all admin routes
router.use(requireAuth);
router.use(requireAdmin);

// ============================================================================
// 1. MANAGE ALERTS (Cross-tenant CRUD)
// ============================================================================

// GET /api/admin/alerts — List all alerts across tenants with filtering & pagination
router.get('/alerts', asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const severity = req.query.severity;
  const type = req.query.type;
  const search = req.query.search;

  const query = {};
  if (severity && severity !== 'all') query.severity = severity;
  if (type && type !== 'all') query.type = type;
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { message: { $regex: search, $options: 'i' } },
      { product: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await Alert.countDocuments(query);
  const alerts = await Alert.find(query)
    .populate('userId', 'name email avatar')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  res.json({
    alerts,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    },
  });
}));

// POST /api/admin/alerts — Create a system alert (broadcast to specific tenant or all tenants)
router.post('/alerts', asyncHandler(async (req, res) => {
  const { tenantId, type, severity, title, message, product, value } = req.body;

  if (!title || !message) {
    throw new AppError('Title and message are required.', 400);
  }

  const alertType = type || 'anomaly';
  const alertSeverity = severity || 'warning';

  let createdAlerts = [];

  if (tenantId && tenantId !== 'all') {
    const user = await User.findById(tenantId);
    if (!user) throw new AppError('Target tenant account not found.', 404);

    const alert = await Alert.create({
      userId: tenantId,
      type: alertType,
      severity: alertSeverity,
      title,
      message,
      product: product || null,
      value: value ? Number(value) : null,
    });
    createdAlerts.push(alert);
    await logAudit(req, 'alert_create', 'Alert', `Alert: ${title} to ${user.email}`, alert._id);
  } else {
    // Broadcast to all users
    const allUsers = await User.find({ isActive: true }).select('_id email');
    const docs = allUsers.map(u => ({
      userId: u._id,
      type: alertType,
      severity: alertSeverity,
      title,
      message,
      product: product || null,
      value: value ? Number(value) : null,
    }));
    if (docs.length > 0) {
      createdAlerts = await Alert.insertMany(docs);
    }
    await logAudit(req, 'alert_create', 'Alert', `Broadcast alert: ${title} to ${allUsers.length} tenants`);
  }

  res.status(201).json({
    message: `Successfully created ${createdAlerts.length} alert(s).`,
    count: createdAlerts.length,
  });
}));

// PUT /api/admin/alerts/:id — Edit an existing alert
router.put('/alerts/:id', asyncHandler(async (req, res) => {
  const { title, message, severity, type } = req.body;
  const alert = await Alert.findById(req.params.id);
  if (!alert) throw new AppError('Alert not found.', 404);

  if (title) alert.title = title;
  if (message) alert.message = message;
  if (severity) alert.severity = severity;
  if (type) alert.type = type;

  await alert.save();
  await logAudit(req, 'alert_update', 'Alert', `Alert: ${alert.title}`, alert._id);

  res.json({ message: 'Alert updated successfully.', alert });
}));

// DELETE /api/admin/alerts/:id — Delete an alert
router.delete('/alerts/:id', asyncHandler(async (req, res) => {
  const alert = await Alert.findById(req.params.id);
  if (!alert) throw new AppError('Alert not found.', 404);

  await Alert.findByIdAndDelete(req.params.id);
  await logAudit(req, 'alert_delete', 'Alert', `Alert: ${alert.title}`, alert._id);

  res.json({ message: 'Alert deleted successfully.' });
}));


// ============================================================================
// 2. VIEW AUDIT LOGS
// ============================================================================

// GET /api/admin/audit-logs — List system audit logs with filters & search
router.get('/audit-logs', asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '25', 10);
  const action = req.query.action;
  const search = req.query.search;

  const query = {};
  if (action && action !== 'all') query.action = action;
  if (search) {
    query.$or = [
      { actorEmail: { $regex: search, $options: 'i' } },
      { target: { $regex: search, $options: 'i' } },
      { targetModel: { $regex: search, $options: 'i' } },
      { action: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await AuditLog.countDocuments(query);
  const logs = await AuditLog.find(query)
    .populate('actor', 'name email avatar role')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  res.json({
    logs,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    },
  });
}));

// GET /api/admin/audit-logs/stats — Audit log analytics
router.get('/audit-logs/stats', asyncHandler(async (req, res) => {
  const recentLogsCount = await AuditLog.countDocuments({
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  });

  const actionDistribution = await AuditLog.aggregate([
    { $group: { _id: '$action', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  res.json({
    recentLogsCount,
    actionDistribution,
  });
}));


// ============================================================================
// 3. MANAGE TENANT ACCOUNTS
// ============================================================================

// GET /api/admin/tenants — List all user/tenant accounts with data counts
router.get('/tenants', asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const search = req.query.search;
  const status = req.query.status;

  const query = {};
  if (status === 'active') query.isActive = true;
  if (status === 'suspended') query.isActive = false;
  if (status === 'admin') query.role = 'admin';

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await User.countDocuments(query);
  const users = await User.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  // Attach data counts per tenant
  const tenantsWithStats = await Promise.all(users.map(async (u) => {
    const [salesCount, inventoryCount, forecastsCount] = await Promise.all([
      SalesData.countDocuments({ userId: u._id }),
      InventoryItem.countDocuments({ userId: u._id }),
      Forecast.countDocuments({ userId: u._id }),
    ]);

    return {
      ...u,
      stats: {
        salesCount,
        inventoryCount,
        forecastsCount,
      },
    };
  }));

  res.json({
    tenants: tenantsWithStats,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    },
  });
}));

// GET /api/admin/tenants/:id — Detailed single tenant view
router.get('/tenants/:id', asyncHandler(async (req, res) => {
  const tenant = await User.findById(req.params.id).lean();
  if (!tenant) throw new AppError('Tenant account not found.', 404);

  const [salesCount, inventoryCount, forecastsCount, alertsCount, recentAuditLogs] = await Promise.all([
    SalesData.countDocuments({ userId: tenant._id }),
    InventoryItem.countDocuments({ userId: tenant._id }),
    Forecast.countDocuments({ userId: tenant._id }),
    Alert.countDocuments({ userId: tenant._id }),
    AuditLog.find({ actor: tenant._id }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  res.json({
    tenant: {
      ...tenant,
      stats: {
        salesCount,
        inventoryCount,
        forecastsCount,
        alertsCount,
      },
      recentAuditLogs,
    },
  });
}));

// PUT /api/admin/tenants/:id — Update tenant name/email
router.put('/tenants/:id', asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  const tenant = await User.findById(req.params.id);
  if (!tenant) throw new AppError('Tenant account not found.', 404);

  if (name) tenant.name = name.trim();
  if (email) tenant.email = email.toLowerCase().trim();

  await tenant.save();
  await logAudit(req, 'update', 'User', `Tenant: ${tenant.email}`, tenant._id);

  res.json({ message: 'Tenant profile updated successfully.', tenant });
}));

// PUT /api/admin/tenants/:id/suspend — Toggle account suspension
router.put('/tenants/:id/suspend', asyncHandler(async (req, res) => {
  const tenant = await User.findById(req.params.id);
  if (!tenant) throw new AppError('Tenant account not found.', 404);

  if (tenant._id.toString() === req.user._id.toString()) {
    throw new AppError('You cannot suspend your own admin account.', 400);
  }

  tenant.isActive = !tenant.isActive;
  await tenant.save();

  const actionName = tenant.isActive ? 'activate' : 'suspend';
  await logAudit(req, actionName, 'User', `Tenant: ${tenant.email}`, tenant._id);

  res.json({
    message: `Tenant account has been ${tenant.isActive ? 'activated' : 'suspended'}.`,
    isActive: tenant.isActive,
  });
}));

// PUT /api/admin/tenants/:id/role — Promote to admin or demote to user
router.put('/tenants/:id/role', asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) {
    throw new AppError('Invalid role specified.', 400);
  }

  const tenant = await User.findById(req.params.id);
  if (!tenant) throw new AppError('Tenant account not found.', 404);

  if (tenant._id.toString() === req.user._id.toString() && role === 'user') {
    throw new AppError('You cannot demote your own admin account.', 400);
  }

  tenant.role = role;
  await tenant.save();

  await logAudit(req, 'promote', 'User', `Set role of ${tenant.email} to ${role}`, tenant._id);

  res.json({ message: `User role updated to ${role}.`, role: tenant.role });
}));

// DELETE /api/admin/tenants/:id — Permanently delete tenant and all related data
router.delete('/tenants/:id', asyncHandler(async (req, res) => {
  const tenant = await User.findById(req.params.id);
  if (!tenant) throw new AppError('Tenant account not found.', 404);

  if (tenant._id.toString() === req.user._id.toString()) {
    throw new AppError('You cannot delete your own admin account.', 400);
  }

  const tenantId = tenant._id;

  // Cascade delete tenant records
  await Promise.all([
    SalesData.deleteMany({ userId: tenantId }),
    InventoryItem.deleteMany({ userId: tenantId }),
    Forecast.deleteMany({ userId: tenantId }),
    Alert.deleteMany({ userId: tenantId }),
    User.findByIdAndDelete(tenantId),
  ]);

  await logAudit(req, 'delete', 'User', `Deleted tenant account: ${tenant.email}`, tenantId);

  res.json({ message: `Tenant ${tenant.email} and all associated data permanently deleted.` });
}));


// ============================================================================
// 4. MONITOR SYSTEM HEALTH
// ============================================================================

// GET /api/admin/health — Live health metrics across Server, DB, Redis, ML
router.get('/health', asyncHandler(async (req, res) => {
  const startTime = Date.now();

  // 1. Server Process Metrics
  const memoryUsage = process.memoryUsage();
  const uptimeSeconds = Math.floor(process.uptime());

  // 2. MongoDB Status & Latency
  let dbStatus = 'healthy';
  let dbLatency = 0;
  let dbStats = { users: 0, sales: 0, inventory: 0, alerts: 0 };
  try {
    const dbStart = Date.now();
    await mongoose.connection.db.admin().ping();
    dbLatency = Date.now() - dbStart;

    const [users, sales, inventory, alerts] = await Promise.all([
      User.countDocuments(),
      SalesData.countDocuments(),
      InventoryItem.countDocuments(),
      Alert.countDocuments(),
    ]);
    dbStats = { users, sales, inventory, alerts };
  } catch (err) {
    dbStatus = 'degraded';
    console.error('Admin Health DB Check Error:', err.message);
  }

  // 3. Redis Cache Status
  const redisConnected = cache.isReady();
  const redisStatus = redisConnected ? 'healthy' : 'disabled';

  // 4. ML Service Health Check
  let mlStatus = 'unreachable';
  let mlLatency = 0;
  const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
  try {
    const mlStart = Date.now();
    const mlRes = await axios.get(`${mlServiceUrl}/health`, { timeout: 3000 });
    if (mlRes.status === 200) {
      mlStatus = 'healthy';
      mlLatency = Date.now() - mlStart;
    }
  } catch (err) {
    // If FastAPI doesn't have /health, try root or mark unreachable
    try {
      const mlStart = Date.now();
      await axios.get(`${mlServiceUrl}/`, { timeout: 3000 });
      mlStatus = 'healthy';
      mlLatency = Date.now() - mlStart;
    } catch (_) {
      mlStatus = 'unreachable';
    }
  }

  res.json({
    timestamp: new Date().toISOString(),
    overallStatus: (dbStatus === 'healthy' && (mlStatus === 'healthy' || mlStatus === 'unreachable')) ? 'healthy' : 'warning',
    server: {
      uptimeSeconds,
      nodeVersion: process.version,
      memory: {
        rssMB: (memoryUsage.rss / 1024 / 1024).toFixed(1),
        heapUsedMB: (memoryUsage.heapUsed / 1024 / 1024).toFixed(1),
        heapTotalMB: (memoryUsage.heapTotal / 1024 / 1024).toFixed(1),
      },
    },
    database: {
      status: dbStatus,
      latencyMs: dbLatency,
      connectionHost: mongoose.connection.host || 'connected',
      collections: dbStats,
    },
    redis: {
      status: redisStatus,
    },
    mlService: {
      status: mlStatus,
      url: mlServiceUrl,
      latencyMs: mlLatency,
    },
  });
}));

module.exports = router;
