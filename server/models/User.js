const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

const BriefSettingsSchema = new mongoose.Schema({
  enabled:    { type: Boolean, default: false },
  channels:   { type: [String], default: ['in_app'] }, // 'in_app' | 'email' | 'slack'
  dayOfWeek:  { type: Number, min: 0, max: 6, default: 1 }, // 0=Sun, 1=Mon, ...
  hour:       { type: Number, min: 0, max: 23, default: 8 },
  timezone:   { type: String, default: 'UTC' },
  emailOverride:    { type: String, default: '' },
  // Slack incoming webhook URL — encrypted at rest.
  slackWebhookEnc:  { type: String, default: null },
  lastDeliveredAt:  { type: Date, default: null },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  name:        { type: String, required: true, trim: true },
  authMethod:  { type: String, enum: ['google', 'email'], default: 'email' },
  avatar:      { type: String, default: '' },

  role:        { type: String, enum: ['user', 'admin'], default: 'user' },
  isActive:    { type: Boolean, default: true },
  briefSettings: { type: BriefSettingsSchema, default: () => ({}) },
}, {
  timestamps: true,
});

// Transparent encryption for the Slack webhook URL — same pattern as Connector.credentials.
UserSchema.virtual('slackWebhook')
  .get(function () {
    const enc = this.briefSettings?.slackWebhookEnc;
    if (!enc) return null;
    try { return decrypt(enc); }
    catch (err) {
      console.error('User: failed to decrypt slackWebhook', err.message);
      return null;
    }
  })
  .set(function (value) {
    if (!this.briefSettings) this.briefSettings = {};
    this.briefSettings.slackWebhookEnc = value ? encrypt(String(value)) : null;
  });

UserSchema.set('toJSON', {
  virtuals: false,
  transform: (_doc, ret) => {
    if (ret.briefSettings) delete ret.briefSettings.slackWebhookEnc;
    return ret;
  },
});

module.exports = mongoose.model('User', UserSchema);
