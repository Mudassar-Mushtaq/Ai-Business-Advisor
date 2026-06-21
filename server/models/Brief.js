const mongoose = require('mongoose');

const BULLET_KINDS = ['win', 'risk', 'anomaly', 'recommendation', 'goal', 'info'];

const BulletSchema = new mongoose.Schema({
  kind: { type: String, enum: BULLET_KINDS, default: 'info' },
  text: { type: String, required: true, maxlength: 600 },
}, { _id: false });

const BriefSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // Both stored as UTC; the user's timezone defines the week boundary.
  weekStart: { type: Date, required: true },
  weekEnd:   { type: Date, required: true },

  // The 5-bullet narrative. We keep it as an array (not a single blob) so the UI
  // can render each bullet as its own card with its kind tag.
  headline:  { type: String, default: '' },
  bullets:   { type: [BulletSchema], default: [] },

  // Snapshot of the metrics fed to the LLM. Useful for debugging "why did it say that?"
  // and for re-rendering without another OpenAI call.
  context:   { type: mongoose.Schema.Types.Mixed, default: {} },

  // Where this brief was actually delivered.
  deliveredVia: [{ type: String, enum: ['in_app', 'email', 'slack'] }],

  status:    { type: String, enum: ['ready', 'generating', 'failed'], default: 'ready' },
  error:     { type: String, default: null },

  // Which run generated this — manual button or scheduled cron.
  trigger:   { type: String, enum: ['scheduled', 'manual'], default: 'scheduled' },

  generatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Idempotency: prevents two cron ticks from generating the same week twice.
BriefSchema.index({ userId: 1, weekStart: 1 }, { unique: true });
BriefSchema.index({ userId: 1, generatedAt: -1 });

BriefSchema.statics.BULLET_KINDS = BULLET_KINDS;

module.exports = mongoose.model('Brief', BriefSchema);
