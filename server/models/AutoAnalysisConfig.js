const mongoose = require('mongoose');

// Per-run history entry — kept inline so we don't need a second collection.
const RunSchema = new mongoose.Schema({
  ranAt:         { type: Date, default: Date.now },
  trigger:       { type: String, enum: ['manual', 'auto', 'connector'], default: 'auto' },
  status:        { type: String, enum: ['success', 'skipped', 'error'], required: true },
  reason:        { type: String, default: null },         // why skipped, or error summary
  productsForecasted: { type: Number, default: 0 },
  durationMs:    { type: Number, default: 0 },
  forecastDays:  { type: Number, default: 30 },
  newRowsSeen:   { type: Number, default: 0 },            // sales rows newer than the prior run
}, { _id: false });

const AutoAnalysisConfigSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },

  // Has the user picked a mode yet? Drives the first-run picker on the Forecasts page.
  setupComplete: { type: Boolean, default: false },

  // 'manual' = user clicks "Generate"; 'auto' = scheduler runs forecast on cadence.
  mode: { type: String, enum: ['manual', 'auto'], default: 'manual' },

  // Auto-mode controls
  enabled:         { type: Boolean, default: false },     // pause/resume without changing mode
  intervalHours:   { type: Number, default: 3, min: 1, max: 168 },
  forecastDays:    { type: Number, default: 30, min: 1, max: 180 },

  // Only re-train if at least this many new sales rows arrived since last run. Saves compute.
  minNewRowsToRun: { type: Number, default: 1, min: 0 },

  // Scheduler bookkeeping
  lastRunAt:   { type: Date, default: null },
  nextRunAt:   { type: Date, default: null },
  lastStatus:  { type: String, enum: ['success', 'skipped', 'error', null], default: null },
  lastError:   { type: String, default: null },
  lastRowCount:{ type: Number, default: 0 },              // sales row count at end of last run

  runHistory:  { type: [RunSchema], default: [] },
}, { timestamps: true });

// Cap history length (keep most recent 25)
AutoAnalysisConfigSchema.methods.recordRun = function (entry) {
  this.runHistory.unshift(entry);
  if (this.runHistory.length > 25) this.runHistory = this.runHistory.slice(0, 25);
};

module.exports = mongoose.model('AutoAnalysisConfig', AutoAnalysisConfigSchema);
