const express = require('express');
const router = express.Router();
const { getPaymentConfig, savePaymentConfig, generatePaymentQR } = require('../controllers/paymentConfigController');
const { protect, authorise } = require('../middleware/auth');

router.get('/:franchiseId', protect, authorise('master_admin', 'franchise_owner', 'manager'), getPaymentConfig);
router.post('/:franchiseId', protect, authorise('master_admin'), savePaymentConfig);
router.get('/:franchiseId/qr', protect, generatePaymentQR);

module.exports = router;
