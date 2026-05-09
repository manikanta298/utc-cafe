const mongoose = require('mongoose');

const sessionItemSchema = new mongoose.Schema({
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
  name: { type: String, required: true },
  qty: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  gst_rate: { type: Number, default: 5 },
  hsn_code: { type: String, default: '' },
  notes: { type: String, default: '' },
}, { _id: true });

const subOrderSchema = new mongoose.Schema({
  orderedAt: { type: Date, default: Date.now },
  isAddition: { type: Boolean, default: false },
  destination: { type: String, enum: ['kitchen', 'counter', 'both'], default: 'kitchen' },
  items: [sessionItemSchema],
  placedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // linked Order doc
}, { _id: true });

const paymentEntrySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  method: { type: String, enum: ['Cash', 'UPI', 'Card', 'Net Banking'], required: true },
  paidAt: { type: Date, default: Date.now },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reference: { type: String, default: '' }, // UPI ref / card last4
}, { _id: true });

const orderSessionSchema = new mongoose.Schema({
  tokenNumber: { type: String, unique: true }, // e.g. TOKEN-101
  sessionRef: { type: String, unique: true },  // e.g. FR01-SES-20250509-101
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', default: null },
  tableNumber: { type: String, default: 'Counter' },
  customerMobile: { type: String, required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerName: { type: String, default: '' },
  orderType: { type: String, enum: ['dine_in', 'counter'], default: 'dine_in' },
  status: {
    type: String,
    enum: ['open', 'bill_pending', 'paid', 'closed'],
    default: 'open',
  },
  subOrders: [subOrderSchema],
  // Computed on bill generation
  mergedItems: [sessionItemSchema],
  subtotal: { type: Number, default: 0 },
  cgst_amount: { type: Number, default: 0 },
  sgst_amount: { type: Number, default: 0 },
  total_tax: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  couponCode: { type: String, default: '' },
  totalAmount: { type: Number, default: 0 },
  // Payment
  paidAmount: { type: Number, default: 0 },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partially_paid', 'advance_paid', 'fully_paid'],
    default: 'unpaid',
  },
  payments: [paymentEntrySchema],
  openedAt: { type: Date, default: Date.now },
  billGeneratedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

orderSessionSchema.index({ franchiseId: 1, status: 1, openedAt: -1 });
orderSessionSchema.index({ customerMobile: 1, franchiseId: 1, status: 1 });
orderSessionSchema.index({ tokenNumber: 1 });

module.exports = mongoose.model('OrderSession', orderSessionSchema);
