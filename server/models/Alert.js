const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:     { type: String, enum: ['low_stock', 'high_sales', 'forecast_ready', 'anomaly', 'goal_off_track', 'goal_achieved'], required: true },
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
  title:    { type: String, required: true },
  message:  { type: String, required: true },
  product:  { type: String, default: null },
  value:    { type: Number, default: null },
  read:     { type: Boolean, default: false },
  createdAt:{ type: Date, default: Date.now },
}, { timestamps: true });

AlertSchema.index({ userId: 1, read: 1 });

module.exports = mongoose.model('Alert', AlertSchema);
