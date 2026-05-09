const express = require('express');
const router = express.Router();
const { getTables, createTable, deleteTable, getTableMap, verifyTableQR } = require('../controllers/tableController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

router.get('/', protect, enforceActiveFranchise, getTables);
router.get('/map', protect, enforceActiveFranchise, getTableMap);
router.post('/', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager'), createTable);
router.delete('/:id', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager'), deleteTable);
router.post('/verify-qr', verifyTableQR); // Public — no auth, for QR scan landing page

module.exports = router;
