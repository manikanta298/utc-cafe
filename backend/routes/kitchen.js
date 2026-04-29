const express = require('express');
const router = express.Router();
const { getKitchenOrders, updateKitchenStatus, getKitchenHistory } = require('../controllers/kitchenController');
const { protect, authorise } = require('../middleware/auth');

router.get('/orders', protect, authorise('kitchen_staff', 'manager', 'franchise_owner'), getKitchenOrders);
router.put('/orders/:id/status', protect, authorise('kitchen_staff', 'manager', 'franchise_owner'), updateKitchenStatus);
router.get('/orders/history', protect, authorise('kitchen_staff', 'manager', 'franchise_owner'), getKitchenHistory);

module.exports = router;
