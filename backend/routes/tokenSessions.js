const express = require('express');
const router = express.Router();
const { getActiveSession, settleSession } = require('../controllers/tokenSessionController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

router.get('/active', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator'), getActiveSession);
router.patch('/:id/settle', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator'), settleSession);

module.exports = router;
