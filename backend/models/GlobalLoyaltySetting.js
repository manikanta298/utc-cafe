const mongoose = require('mongoose');

// One global document only. It is intentionally NOT franchise-scoped.
const globalLoyaltySettingSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global' },
  earningAmount: { type: Number, required: true, min: 0.01, default: 100 },
  earningPoints: { type: Number, required: true, min: 0, default: 10 },
  rupeesPerPoint: { type: Number, required: true, min: 0.0001, default: 0.10 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('GlobalLoyaltySetting', globalLoyaltySettingSchema);
