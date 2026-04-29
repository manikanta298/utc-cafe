// ── routes/orders.js
const express = require('express');
const router = express.Router();
const { createOrder, getOrders, getOrderById } = require('../controllers/orderController');
const { protect, authorise } = require('../middleware/auth');

router.get('/', protect, getOrders);
router.post('/', protect, authorise('pos_staff', 'manager', 'franchise_owner'), createOrder);
router.get('/:id', protect, getOrderById);

module.exports = router;
