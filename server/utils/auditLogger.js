const AuditLog = require('../models/AuditLog');

/**
 * Creates an audit log record for admin and critical user actions.
 */
async function logAudit(req, action, targetModel, target, targetId = null, details = {}) {
  try {
    const actor = req.user?._id;
    const actorEmail = req.user?.email || 'system';
    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    await AuditLog.create({
      actor,
      actorEmail,
      action,
      targetModel,
      target,
      targetId,
      details,
      ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
    });
  } catch (err) {
    console.error('Failed to log audit event:', err.message);
  }
}

module.exports = { logAudit };
