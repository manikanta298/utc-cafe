const Order = require('../models/Order');
const OrderSession = require('../models/OrderSession');
const Customer = require('../models/Customer');
const Coupon = require('../models/Coupon');

const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// GET /api/reports/payments
const getPaymentReport = async (req, res) => {
  try {
    const { franchiseId, startDate, endDate, format = 'json' } = req.query;
    const filter = {};

    if (req.user.role !== 'master_admin') {
      filter.franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    } else if (franchiseId) {
      filter.franchiseId = franchiseId;
    }

    if (startDate || endDate) {
      filter.openedAt = {};
      if (startDate) filter.openedAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.openedAt.$lte = end;
      }
    }

    const sessions = await OrderSession.find(filter)
      .populate('franchiseId', 'name franchiseCode')
      .populate('customerId', 'name phone_no')
      .sort({ openedAt: -1 })
      .limit(5000)
      .lean();

    // Build rows
    const rows = [];
    for (const s of sessions) {
      if (!s.payments || s.payments.length === 0) {
        rows.push({
          sessionRef: s.sessionRef || s._id,
          franchise: s.franchiseId?.name || '',
          customerName: s.customerId?.name || s.customerName || '',
          mobile: s.customerMobile || '',
          paymentType: 'Pending',
          originalAmount: s.totalAmount || 0,
          discount: s.discountAmount || 0,
          finalAmount: s.totalAmount || 0,
          paymentStatus: s.paymentStatus || 'unpaid',
          tokenNumber: s.tokenNumber || '',
          date: s.openedAt,
        });
      } else {
        for (const p of s.payments) {
          rows.push({
            sessionRef: s.sessionRef || s._id,
            franchise: s.franchiseId?.name || '',
            customerName: s.customerId?.name || s.customerName || '',
            mobile: s.customerMobile || '',
            paymentType: p.method || '',
            originalAmount: s.subtotal || s.totalAmount || 0,
            discount: s.discountAmount || 0,
            finalAmount: p.amount || 0,
            paymentStatus: s.paymentStatus || '',
            tokenNumber: s.tokenNumber || '',
            date: p.paidAt || s.openedAt,
          });
        }
      }
    }

    if (format === 'csv') {
      const headers = ['Session Ref', 'Franchise', 'Customer', 'Mobile', 'Payment Type',
        'Original Amount', 'Discount', 'Amount Paid', 'Status', 'Token', 'Date'];
      const csvRows = rows.map(r => [
        r.sessionRef, r.franchise, r.customerName, r.mobile,
        r.paymentType, r.originalAmount, r.discount, r.finalAmount,
        r.paymentStatus, r.tokenNumber, r.date,
      ].map(csvEscape).join(','));
      const csv = [headers.map(csvEscape).join(','), ...csvRows].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="payment-report.csv"');
      return res.send(csv);
    }

    // Summary totals
    const summary = rows.reduce((acc, r) => {
      acc.total += r.finalAmount;
      acc[r.paymentType] = (acc[r.paymentType] || 0) + r.finalAmount;
      return acc;
    }, { total: 0 });

    res.json({ success: true, rows, summary, total: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/reports/sales
const getSalesReport = async (req, res) => {
  try {
    const { period = 'daily', franchiseId } = req.query;
    const filter = {};

    if (req.user.role !== 'master_admin') {
      filter.franchise_id = req.user.franchise_id?._id || req.user.franchise_id;
    } else if (franchiseId) {
      filter.franchise_id = franchiseId;
    }

    let startDate = new Date();
    if (period === 'daily') startDate.setDate(startDate.getDate() - 30);
    else if (period === 'weekly') startDate.setDate(startDate.getDate() - 90);
    else if (period === 'monthly') startDate.setMonth(startDate.getMonth() - 12);

    filter.createdAt = { $gte: startDate };
    filter.archivedAt = null;

    const orders = await Order.find(filter)
      .populate('franchise_id', 'name franchiseCode')
      .select('final_amount payment_mode createdAt franchise_id discount_amount total_tax')
      .lean();

    // Group by date
    const grouped = {};
    for (const o of orders) {
      const key = o.createdAt.toISOString().split('T')[0];
      if (!grouped[key]) grouped[key] = { date: key, total: 0, orders: 0, cash: 0, upi: 0, card: 0 };
      grouped[key].total += o.final_amount;
      grouped[key].orders += 1;
      const mode = (o.payment_mode || '').toLowerCase();
      if (mode === 'cash') grouped[key].cash += o.final_amount;
      else if (mode === 'upi') grouped[key].upi += o.final_amount;
      else if (mode === 'card') grouped[key].card += o.final_amount;
    }

    const data = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    const totalRevenue = orders.reduce((s, o) => s + o.final_amount, 0);

    res.json({ success: true, data, totalRevenue, totalOrders: orders.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getPaymentReport, getSalesReport };
