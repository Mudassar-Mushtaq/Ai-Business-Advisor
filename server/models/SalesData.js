const mongoose = require('mongoose');

const SalesDataSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date:       { type: Date, required: true },
  product:    { type: String, required: true, trim: true },
  category:   { type: String, default: 'General', trim: true },
  quantity:   { type: Number, required: true },
  revenue:    { type: Number, required: true },
  cost:       { type: Number, default: 0 },
  region:     { type: String, default: 'Global' },
  uploadedAt: { type: Date, default: Date.now },

  // Where this row came from. 'upload' for CSV/Excel imports, otherwise the connector provider.
  source:     { type: String, default: 'upload', enum: ['upload', 'google_sheets', 'daraz'] },
  // Stable ID from the source system — used to dedupe on re-sync.
  externalId: { type: String, default: null },
}, { timestamps: true });

SalesDataSchema.index({ userId: 1, date: -1 });
SalesDataSchema.index({ userId: 1, product: 1 });
// Idempotent upserts for connector-sourced rows. Sparse so 'upload' rows (null externalId) don't collide.
SalesDataSchema.index(
  { userId: 1, source: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } }
);

module.exports = mongoose.model('SalesData', SalesDataSchema);
