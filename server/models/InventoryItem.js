const mongoose = require('mongoose');

const InventoryItemSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  product:      { type: String, required: true, trim: true },
  category:     { type: String, default: 'General' },
  stock:        { type: Number, required: true, default: 0 },
  // `reorderLevel` is the canonical threshold the alert pipeline reads.
  // In manual mode it's set directly; in auto mode it's recomputed from the
  // latest forecast (see services/reorderRecommender.js).
  reorderLevel: { type: Number, default: 10, min: 0 },
  unit:         { type: String, default: 'units' },
  costPerUnit:  { type: Number, default: 0 },
  supplier:     { type: String, default: '' },
  lastUpdated:  { type: Date, default: Date.now },

  // --- Alert configuration ---
  alertMode: {
    type: String,
    enum: ['auto', 'manual'],
    default: 'auto',
  },
  // Used when alertMode === 'manual'
  manualReorderLevel: { type: Number, default: null, min: 0 },
  // Days between placing a restock order and receiving it
  leadTimeDays: { type: Number, default: 7, min: 0, max: 365 },
  // Buffer % added on top of expected lead-time demand
  safetyStockPct: { type: Number, default: 20, min: 0, max: 500 },
}, { timestamps: true });

InventoryItemSchema.index({ userId: 1, product: 1 }, { unique: true });

module.exports = mongoose.model('InventoryItem', InventoryItemSchema);
