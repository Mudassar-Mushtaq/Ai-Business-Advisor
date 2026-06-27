const mongoose = require('mongoose');

const ForecastSchema = new mongoose.Schema({
  userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  product:          { type: String, required: true },
  period:           { type: String, default: '30d' },
  forecastedSales:  { type: Number, default: 0 },
  forecastedRevenue:{ type: Number, default: 0 },
  confidence:       { type: Number, default: 0 },
  dailyBreakdown: [{
    date:     Date,
    quantity: Number,
    revenue:  Number,
  }],
  modelAccuracy:  { type: Number, default: 0 },
  model:          { type: String, enum: ['rf', 'prophet', 'fallback'], default: 'rf' },
  forecastMethod: { type: String, enum: ['ml', 'ema_trend', 'ema'], default: 'ml' },
  generatedAt:    { type: Date, default: Date.now },
}, { timestamps: true });

ForecastSchema.index({ userId: 1, product: 1, generatedAt: -1 });

module.exports = mongoose.model('Forecast', ForecastSchema);
