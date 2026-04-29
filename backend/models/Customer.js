const mongoose = require('mongoose');

// Customers are CENTRAL — not isolated per franchise
// Phone number is the unique identifier — no app required
const customerSchema = new mongoose.Schema(
  {
    phone_no: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, default: '' },
    total_points: { type: Number, default: 0, min: 0 },
    total_orders: { type: Number, default: 0 },
    total_spent: { type: Number, default: 0 },
    // Track which franchise they first registered at
    first_franchise: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

customerSchema.index({ phone_no: 1 });

module.exports = mongoose.model('Customer', customerSchema);
