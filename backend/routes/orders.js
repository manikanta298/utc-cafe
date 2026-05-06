// ── routes/orders.js
const express = require('express');
const router = express.Router();
const { createOrder, getOrders, getOrderById, exportOrdersCsv, archiveOldOrders } = require('../controllers/orderController');
const { protect, authorise } = require('../middleware/auth');

router.get('/', protect, getOrders);
router.get('/export.csv', protect, authorise('master_admin', 'franchise_owner', 'manager'), exportOrdersCsv);
router.post('/archive-old', protect, authorise('master_admin'), archiveOldOrders);
router.post('/', protect, authorise('pos_staff', 'manager', 'franchise_owner'), createOrder);
router.get('/:id', protect, getOrderById);

module.exports = router;
