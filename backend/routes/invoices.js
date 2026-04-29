// ── routes/invoices.js
const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const { protect, authorise } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, franchiseId, month, year } = req.query;
    const filter = {};
    if (req.user.role !== 'master_admin') {
      filter.franchise_id = req.user.franchise_id._id || req.user.franchise_id;
    } else if (franchiseId) {
      filter.franchise_id = franchiseId;
    }
    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      filter.invoice_date = { $gte: start, $lt: end };
    }
    const skip = (page - 1) * limit;
    const [invoices, total] = await Promise.all([
      Invoice.find(filter).populate('franchise_id', 'name franchiseCode').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Invoice.countDocuments(filter),
    ]);
    res.json({ success: true, invoices, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('franchise_id', 'name franchiseCode state gstin');
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
