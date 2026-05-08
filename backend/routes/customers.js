// ── routes/customers.js
const express = require('express');
const router1 = express.Router();
const { lookupByPhone, createCustomer, getCustomers, getCustomerHistory } = require('../controllers/customerController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

router1.get('/lookup', protect, enforceActiveFranchise, lookupByPhone);
router1.get('/', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager'), getCustomers);
router1.post('/', protect, enforceActiveFranchise, createCustomer);
router1.get('/:id/history', protect, enforceActiveFranchise, getCustomerHistory);

module.exports = router1;
