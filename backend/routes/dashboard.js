const express = require('express');
const router = express.Router();
const { getFranchiseDashboard, getMasterDashboard } = require('../controllers/dashboardController');
const { protect, authorise } = require('../middleware/auth');

router.get('/franchise', protect, authorise('franchise_owner', 'manager', 'pos_staff'), getFranchiseDashboard);
router.get('/master', protect, authorise('master_admin'), getMasterDashboard);

module.exports = router;
