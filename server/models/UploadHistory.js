const mongoose = require('mongoose');

const UploadHistorySchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fileName:        { type: String, required: true },
  fileSize:        { type: Number, required: true },            // bytes
  fileType:        { type: String, required: true },            // '.csv', '.xlsx', '.xls'
  rowsImported:    { type: Number, required: true },
  productsUpdated: { type: Number, default: 0 },
  status:          { type: String, enum: ['success', 'failed'], default: 'success' },
  errorMessage:    { type: String, default: null },
}, { timestamps: true });

UploadHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('UploadHistory', UploadHistorySchema);
