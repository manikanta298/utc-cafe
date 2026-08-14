// ── routes/customers.js
const express = require('express');
const router1 = express.Router();
const { lookupByPhone, createCustomer, updateCustomer, getCustomers, getCustomerHistory } = require('../controllers/customerController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

router1.get('/lookup', protect, enforceActiveFranchise, lookupByPhone);

// GET /api/customers/export.csv — master_admin only, optional ?franchiseId= filter
// SECURITY/PERF: streamed via a Mongo cursor instead of loading up to 10k
// documents (and the full CSV string) into memory at once.
router1.get('/export.csv', protect, authorise('master_admin'), async (req, res) => {
  const EXPORT_CAP = 10000;
  try {
    const Customer = require('../models/Customer');
    const { franchiseId } = req.query;

    const filter = {};
    if (franchiseId) filter.first_franchise = franchiseId;

    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['Name', 'Phone', 'Email', 'Gender', 'Age', 'City', 'State',
      'Pincode', 'Total Orders', 'Total Spent', 'Total Points', 'First Franchise', 'Joined On'];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
    res.write(headers.map(csvEscape).join(',') + '\n');

    const cursor = Customer.find(filter)
      .populate('first_franchise', 'name franchiseCode')
      .sort({ createdAt: -1 })
      .limit(EXPORT_CAP)
      .lean()
      .cursor();

    let count = 0;
    for await (const c of cursor) {
      count += 1;
      const row = [
        c.name,
        c.phone_no,
        c.email || '',
        c.gender || '',
        c.age ?? '',
        c.city || '',
        c.state || '',
        c.pincode || '',
        c.total_orders || 0,
        Number(c.total_spent || 0).toFixed(2),
        c.total_points || 0,
        c.first_franchise ? `${c.first_franchise.name} (${c.first_franchise.franchiseCode})` : '',
        c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : '',
      ].map(csvEscape).join(',');
      res.write(row + '\n');
    }

    if (count === EXPORT_CAP) {
      res.write(`# Note: export capped at ${EXPORT_CAP} rows — narrow your filters (e.g. by franchise) for a complete export\n`);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    } else {
      res.end();
    }
  }
});

// ── BUG FIX: waiter role needs GET /customers for recent-customers widget in WaiterDashboard
router1.get('/', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'waiter', 'pos_staff', 'shift_operator'), getCustomers);
router1.post('/', protect, enforceActiveFranchise, createCustomer);
router1.put('/:id', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator'), updateCustomer);
router1.get('/:id/history', protect, enforceActiveFranchise, getCustomerHistory);

// DELETE /api/customers/:id — master_admin only
router1.delete('/:id', protect, authorise('master_admin'), async (req, res) => {
  try {
    const Customer = require('../models/Customer');
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router1;
