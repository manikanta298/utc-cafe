const mongoose = require('mongoose');

const franchiseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    gstin: { type: String, required: true, uppercase: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    address: { type: String, trim: true },
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
    // Invoice sequence counter per franchise
    invoiceCounter: { type: Number, default: 0 },
    // Franchise code for invoice numbering e.g. FR01
    franchiseCode: { type: String, unique: true, uppercase: true },
    logo: { type: String, default: '' }, // Cloudinary URL
  },
  { timestamps: true }
);

// Auto-generate franchise code before save
franchiseSchema.pre('save', async function (next) {
  if (this.franchiseCode) return next();
  const count = await mongoose.model('Franchise').countDocuments();
  this.franchiseCode = `FR${String(count + 1).padStart(2, '0')}`;
  next();
});

module.exports = mongoose.model('Franchise', franchiseSchema);
