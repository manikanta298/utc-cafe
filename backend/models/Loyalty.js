const mongoose = require('mongoose');

const loyaltySchema = new mongoose.Schema({
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderSession', default: null },
  franchise_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
  transaction_type: { type: String, enum: ['earn', 'redeem'], required: true },
  points_earned: { type: Number, default: 0 },
  points_used: { type: Number, default: 0 },
  points_value: { type: Number, default: 0 },
  balance_before: { type: Number, required: true },
  balance_after: { type: Number, required: true },
  bill_amount: { type: Number, default: 0 },
}, { timestamps: true });

loyaltySchema.index({ customer_id: 1, createdAt: -1 });
loyaltySchema.index({ session_id: 1, transaction_type: 1 });

module.exports = mongoose.model('Loyalty', loyaltySchema);
