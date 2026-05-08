const express = require('express');
const { body } = require('express-validator');
const {
  login,
  refresh,
  logout,
  getMe,
  createStaff,
  changePassword,
} = require('../controllers/authController');
const { protect, authorise, protectRefreshToken } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password is required'),
  ],
  login
);
router.post('/refresh', protectRefreshToken, refresh);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.post(
  '/create-staff',
  protect,
  authorise('master_admin', 'franchise_owner', 'manager'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').notEmpty().withMessage('Role is required'),
  ],
  createStaff
);
router.put(
  '/change-password',
  protect,
  [
    body('currentPassword').isLength({ min: 6 }).withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  ],
  changePassword
);

module.exports = router;
