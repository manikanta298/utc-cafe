const express = require('express');
const router = express.Router();
const {
  startSession, addOrderToSession, getSession, generateBill,
  recordPayment, getSessions, linkCustomer,
  holdSession, resumeSession, getHeldSessions, cancelSession,
  approveCancelSession, rejectCancelSession, clearOrderItems, removeItemFromKitchen, removeSessionItem,
} = require('../controllers/sessionController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

const posRoles = ['pos_staff', 'shift_operator', 'manager', 'franchise_owner', 'waiter'];
const posOpsOnly = ['pos_staff', 'shift_operator', 'manager', 'franchise_owner'];

router.get('/',      protect, enforceActiveFranchise, authorise('master_admin', ...posRoles), getSessions);
router.get('/held',  protect, enforceActiveFranchise, authorise('master_admin', ...posRoles), getHeldSessions);
router.post('/start', protect, enforceActiveFranchise, authorise(...posRoles), startSession);
router.get('/:sessionId',           protect, enforceActiveFranchise, authorise('master_admin', ...posRoles), getSession);
router.post('/:sessionId/orders',   protect, enforceActiveFranchise, authorise(...posRoles), addOrderToSession);
router.post('/:sessionId/customer', protect, enforceActiveFranchise, authorise(...posRoles), linkCustomer);
router.post('/:sessionId/bill',     protect, enforceActiveFranchise, authorise(...posRoles), generateBill);
router.post('/:sessionId/payment',  protect, enforceActiveFranchise, authorise(...posRoles), recordPayment);
router.post('/:sessionId/hold',     protect, enforceActiveFranchise, authorise(...posRoles), holdSession);
router.post('/:sessionId/resume',   protect, enforceActiveFranchise, authorise(...posRoles), resumeSession);
router.post('/:sessionId/cancel',   protect, enforceActiveFranchise, authorise(...posRoles), cancelSession);
// POS operator approves or rejects a waiter's table cancellation request
router.post('/:sessionId/approve-cancel', protect, enforceActiveFranchise, authorise(...posOpsOnly), approveCancelSession);
router.post('/:sessionId/reject-cancel',  protect, enforceActiveFranchise, authorise(...posOpsOnly), rejectCancelSession);
router.post('/:sessionId/clear-items',        protect, enforceActiveFranchise, authorise(...posRoles),   clearOrderItems);
router.post('/:sessionId/remove-kitchen-item', protect, enforceActiveFranchise, authorise(...posRoles),   removeItemFromKitchen);

// Trigger stale-session cleanup on demand (called by frontend on load)
router.post('/admin/expire-stale', protect, enforceActiveFranchise, authorise(...posOpsOnly), async (req, res) => {
  try {
    const { expireStaleTokens } = require('../jobs/kitchenCleanup');
    const io = req.app.get('io');
    await expireStaleTokens(io);
    res.json({ success: true, message: 'Stale sessions expired' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Secure PIN-protected delete of a saved session item
router.post('/:sessionId/remove-item', protect, enforceActiveFranchise, authorise(...posOpsOnly), removeSessionItem);

module.exports = router;
