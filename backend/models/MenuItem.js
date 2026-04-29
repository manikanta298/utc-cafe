const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    category: {
      type: String,
      required: true,
      enum: ['Beverages', 'Snacks', 'Meals', 'Desserts', 'Breads', 'Specials', 'Add-ons'],
    },
    price: { type: Number, required: true, min: 0 },
    gst_rate: { type: Number, required: true, default: 5 }, // percentage e.g. 5, 12, 18
    hsn_code: { type: String, trim: true, default: '' },
    image: {
      url: { type: String, default: '' },           // Cloudinary secure URL
      public_id: { type: String, default: '' },     // Cloudinary public_id for deletion
    },
    // isGlobalActive: Master Admin can disable globally
    isGlobalActive: { type: Boolean, default: true },
    // Per-franchise availability override — array of franchise_ids where item is disabled
    disabledInFranchises: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' }],
    preparationTime: { type: Number, default: 10 }, // minutes
    isVeg: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

menuItemSchema.index({ category: 1, isGlobalActive: 1 });

module.exports = mongoose.model('MenuItem', menuItemSchema);
