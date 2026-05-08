const express = require('express');
const router = express.Router();
const { getFranchiseDashboard, getMasterDashboard } = require('../controllers/dashboardController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

router.get('/franchise', protect, enforceActiveFranchise, authorise('franchise_owner', 'manager', 'pos_staff', 'shift_operator'), getFranchiseDashboard);
router.get('/master', protect, authorise('master_admin'), getMasterDashboard);

module.exports = router;
