const express = require('express');
const router = express.Router();
const { getMenu, getAllMenu, createMenuItem, updateMenuItem, deleteMenuItem, toggleFranchiseItem } = require('../controllers/menuController');
const { protect, authorise } = require('../middleware/auth');

router.get('/', protect, getMenu);
router.get('/all', protect, authorise('master_admin'), getAllMenu);
router.post('/', protect, authorise('master_admin'), createMenuItem);
router.put('/:id', protect, authorise('master_admin'), updateMenuItem);
router.delete('/:id', protect, authorise('master_admin'), deleteMenuItem);
router.put('/:id/toggle', protect, authorise('franchise_owner', 'manager'), toggleFranchiseItem);

module.exports = router;
