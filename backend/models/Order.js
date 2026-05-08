const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    item_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },        // snapshot at time of order
    price: { type: Number, required: true },       // price snapshot
    gst_rate: { type: Number, required: true },    // gst snapshot
    hsn_code: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    item_total: { type: Number, required: true },  // price × quantity (before tax)
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    order_number: { type: String, unique: true },  // e.g. FR01-ORD-00001
    franchise_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
    customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: [orderItemSchema],

    // Financials
    sub_total: { type: Number, required: true },        // taxable amount
    cgst_amount: { type: Number, default: 0 },
    sgst_amount: { type: Number, default: 0 },
    igst_amount: { type: Number, default: 0 },
    total_tax: { type: Number, default: 0 },
    gross_total: { type: Number, required: true },      // sub_total + total_tax
    discount_amount: { type: Number, default: 0 },      // loyalty point discount
    points_redeemed: { type: Number, default: 0 },
    final_amount: { type: Number, required: true },     // gross_total - discount

    // Tax type
    tax_type: { type: String, enum: ['CGST_SGST', 'IGST'], required: true },

    // Payment
    payment_mode: { type: String, enum: ['Cash', 'Card', 'UPI', 'Net Banking'], required: true },
    payment_status: { type: String, enum: ['Pending', 'Paid', 'Refunded'], default: 'Paid' },

    // Kitchen status
    kitchen_status: {
      type: String,
      enum: ['Pending', 'Accepted', 'Preparing', 'Ready', 'Delivered'],
      default: 'Pending',
    },
    status_history: [
      {
        status: String,
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      },
    ],

    // Token number shown to customer (sequential per day per franchise)
    token_number: { type: Number },
    token_label: { type: String, default: '' },
    session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TokenSession', default: null },
    table_number: { type: String, trim: true, default: '' },
    is_addition: { type: Boolean, default: false },

    // POS staff who created the order
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Points earned from this order
    points_earned: { type: Number, default: 0 },

    // Archived automatically after the operational 30-day window.
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ franchise_id: 1, createdAt: -1 });
orderSchema.index({ customer_id: 1 });
orderSchema.index({ kitchen_status: 1, franchise_id: 1 });
orderSchema.index({ archivedAt: 1, createdAt: -1 });
orderSchema.index({ session_id: 1, createdAt: 1 });
orderSchema.index({ franchise_id: 1, token_number: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
