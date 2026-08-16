const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  actor:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorEmail:  { type: String, required: true },
  action:      { type: String, required: true, index: true }, // e.g. 'create', 'update', 'delete', 'suspend', 'activate', 'promote'
  target:      { type: String, required: true },
  targetModel: { type: String, required: true, index: true },
  targetId:    { type: mongoose.Schema.Types.ObjectId, default: null },
  details:     { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress:   { type: String, default: 'N/A' },
}, {
  timestamps: true,
});

AuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
