// routes/auth.js
const express = require('express');
const router = express.Router();
const { login, getMe, createStaff, changePassword } = require('../controllers/authController');
const { protect, authorise } = require('../middleware/auth');

router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/create-staff', protect, authorise('master_admin', 'franchise_owner', 'manager'), createStaff);
router.put('/change-password', protect, changePassword);

module.exports = router;
