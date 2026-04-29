// ── routes/customers.js
const express = require('express');
const router1 = express.Router();
const { lookupByPhone, createCustomer, getCustomers, getCustomerHistory } = require('../controllers/customerController');
const { protect, authorise } = require('../middleware/auth');

router1.get('/lookup', protect, lookupByPhone);
router1.get('/', protect, authorise('master_admin', 'franchise_owner', 'manager'), getCustomers);
router1.post('/', protect, createCustomer);
router1.get('/:id/history', protect, getCustomerHistory);

module.exports = router1;
