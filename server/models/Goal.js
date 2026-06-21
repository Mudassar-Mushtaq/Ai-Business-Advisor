const mongoose = require('mongoose');

const METRICS = ['revenue', 'orders', 'profit', 'units', 'stockouts_max', 'product_revenue'];
const PERIODS = ['month', 'quarter', 'custom'];
const STATUSES = ['active', 'achieved', 'missed', 'archived'];

const GoalSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  label:         { type: String, required: true, trim: true, maxlength: 120 },
  metric:        { type: String, enum: METRICS, required: true },
  target:        { type: Number, required: true, min: 0 },
  period:        { type: String, enum: PERIODS, required: true },
  startDate:     { type: Date, required: true },
  endDate:       { type: Date, required: true },
  productFilter: { type: String, default: null, trim: true },
  status:        { type: String, enum: STATUSES, default: 'active', index: true },

  // Cached at last evaluation — kept so the dashboard can render without re-aggregating
  lastEvaluatedAt: { type: Date, default: null },
  lastProgress:    { type: Number, default: 0 },
}, { timestamps: true });

GoalSchema.index({ userId: 1, status: 1 });
GoalSchema.index({ userId: 1, endDate: 1 });

GoalSchema.statics.METRICS = METRICS;
GoalSchema.statics.PERIODS = PERIODS;
GoalSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('Goal', GoalSchema);
