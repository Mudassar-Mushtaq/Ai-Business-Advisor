const mongoose = require('mongoose');

const PurchaseOrderSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  inventoryId:   { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', default: null, index: true },

  // Product snapshot — kept on the PO so a deleted inventory item doesn't break history.
  product:       { type: String, required: true, trim: true },
  category:      { type: String, default: 'General' },
  unit:          { type: String, default: 'units' },

  quantity:      { type: Number, required: true, min: 1 },
  costPerUnit:   { type: Number, default: 0, min: 0 },
  totalCost:     { type: Number, default: 0, min: 0 },

  supplier:      { type: String, default: '', trim: true },
  notes:         { type: String, default: '', trim: true, maxlength: 1000 },

  status: {
    type: String,
    enum: ['draft', 'ordered', 'received', 'cancelled'],
    default: 'draft',
    index: true,
  },

  expectedDate:  { type: Date, default: null },
  orderedAt:     { type: Date, default: null },
  receivedAt:    { type: Date, default: null },
  cancelledAt:   { type: Date, default: null },

  // Provenance — useful to trace which alert spawned this PO.
  sourceAlertId: { type: mongoose.Schema.Types.ObjectId, ref: 'Alert', default: null },
  source:        { type: String, enum: ['alert', 'manual', 'recommendation'], default: 'manual' },
}, { timestamps: true });

PurchaseOrderSchema.index({ userId: 1, status: 1, createdAt: -1 });

PurchaseOrderSchema.pre('save', function (next) {
  // Keep totalCost in sync with quantity * costPerUnit unless explicitly overridden.
  if (this.isModified('quantity') || this.isModified('costPerUnit')) {
    this.totalCost = +(this.quantity * this.costPerUnit).toFixed(2);
  }
  next();
});

module.exports = mongoose.model('PurchaseOrder', PurchaseOrderSchema);
