const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

const ConnectorSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider:  { type: String, required: true, enum: ['google_sheets', 'daraz'] },
  status:    { type: String, enum: ['connected', 'error', 'revoked'], default: 'connected' },

  // Encrypted at rest (AES-256-GCM). Use the virtuals below to read/write decrypted JSON.
  credentialsEnc: { type: String, default: null },

  // Provider-specific config (sheet id, range, column map, etc.)
  config: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Sync state
  lastSyncAt:    { type: Date, default: null },
  lastSyncRows:  { type: Number, default: 0 },
  syncCount:     { type: Number, default: 0 },
  lastError:     { type: String, default: null },

  // Optional override of the global cron interval (minutes)
  intervalMinutes: { type: Number, default: 15 },

  // For incremental pulls — last seen externalId / row index / cursor token
  cursor: { type: mongoose.Schema.Types.Mixed, default: {} },

  label: { type: String, default: '' }, // user-facing nickname
}, { timestamps: true });

ConnectorSchema.index({ userId: 1, provider: 1 }, { unique: true });

// Virtual getter/setter that handles encryption transparently.
ConnectorSchema.virtual('credentials')
  .get(function () {
    if (!this.credentialsEnc) return null;
    try {
      return JSON.parse(decrypt(this.credentialsEnc));
    } catch (err) {
      console.error('Connector: failed to decrypt credentials', err.message);
      return null;
    }
  })
  .set(function (value) {
    if (value == null) {
      this.credentialsEnc = null;
    } else {
      this.credentialsEnc = encrypt(JSON.stringify(value));
    }
  });

// Strip secrets from JSON output
ConnectorSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret) => {
    delete ret.credentialsEnc;
    return ret;
  },
});

module.exports = mongoose.model('Connector', ConnectorSchema);
