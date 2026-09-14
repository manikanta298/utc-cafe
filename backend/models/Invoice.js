const mongoose = require('mongoose');
const invoiceSchema = new mongoose.Schema({
  invoice_no: { type: String, required: true, unique: true }, order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null }, franchise_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true }, customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  franchise_name: String, franchise_gstin: String, franchise_address: String, franchise_state: String, customer_name: String, customer_phone: String,
  taxable_amount: { type: Number, required: true }, cgst: { type: Number, default: 0 }, sgst: { type: Number, default: 0 }, igst: { type: Number, default: 0 }, total_tax: { type: Number, required: true }, discount_amount: { type: Number, default: 0 }, final_amount: { type: Number, required: true }, payment_mode: String,
  loyalty_points_redeemed: { type: Number, default: 0 }, loyalty_amount_paid: { type: Number, default: 0 }, loyalty_points_earned: { type: Number, default: 0 }, payments: [{ amount: Number, method: String, reference: String, paidAt: Date }],
  items: [{ name: String, hsn_code: String, quantity: Number, price: Number, gst_rate: Number, item_total: Number }], invoice_date: { type: Date, default: Date.now }, pdf_url: { type: String, default: '' }, visit_type: { type: String, default: '' },
}, { timestamps: true });
invoiceSchema.index({ franchise_id: 1, createdAt: -1 }); invoiceSchema.index({ franchise_id: 1, invoice_date: -1, payment_mode: 1 }); invoiceSchema.index({ payment_mode: 1, invoice_date: -1 });
module.exports = mongoose.model('Invoice', invoiceSchema);
