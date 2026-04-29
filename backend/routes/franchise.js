// ── routes/franchise.js ──────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const { getFranchises, createFranchise, updateFranchise, deleteFranchise, getFranchiseById } = require('../controllers/franchiseController');
const { protect, authorise } = require('../middleware/auth');

router.get('/', protect, authorise('master_admin'), getFranchises);
router.post('/', protect, authorise('master_admin'), createFranchise);
router.get('/:id', protect, authorise('master_admin', 'franchise_owner', 'manager'), getFranchiseById);
router.put('/:id', protect, authorise('master_admin'), updateFranchise);
router.delete('/:id', protect, authorise('master_admin'), deleteFranchise);

module.exports = router;
