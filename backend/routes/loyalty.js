const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../middleware/auth');
const { getSetting, updateSetting, lookupWallet } = require('../controllers/loyaltyController');
router.get('/settings', protect, authorise('master_admin','pos_staff','shift_operator','manager','franchise_owner'), getSetting);
router.put('/settings', protect, authorise('master_admin'), updateSetting);
router.get('/wallet', protect, authorise('pos_staff','shift_operator','manager','franchise_owner'), lookupWallet);
module.exports = router;
