const TokenSession = require('../models/TokenSession');
const Invoice = require('../models/Invoice');
const Order = require('../models/Order');

const getStartOfDay = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getFranchiseId = (req) => req.user.franchise_id?._id || req.user.franchise_id;

const assertSessionAccess = (req, session) => {
  if (req.user.role === 'master_admin') return true;
  const userFranchise = getFranchiseId(req)?.toString();
  return session.franchise_id.toString() === userFranchise;
};

const getActiveSession = async (req, res) => {
  try {
    const { customerId } = req.query;
    if (!customerId) {
      return res.status(400).json({ success: false, message: 'customerId required' });
    }

    const filter = {
      customer_id: customerId,
      token_date: getStartOfDay(),
      status: { $in: ['Open', 'Bill Pending'] },
    };

    if (req.user.role !== 'master_admin') {
      filter.franchise_id = getFranchiseId(req);
    } else if (req.query.franchiseId) {
      filter.franchise_id = req.query.franchiseId;
    }

    const session = await TokenSession.findOne(filter)
      .populate('customer_id', 'name phone_no')
      .populate('order_ids');

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const settleSession = async (req, res) => {
  try {
    const { amount_paid, payment_status = 'Fully Paid', payment_mode } = req.body;
    const session = await TokenSession.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Token session not found' });
    if (!assertSessionAccess(req, session)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const paidAmount = Number(amount_paid ?? session.total_amount);
    session.amount_paid = paidAmount;
    session.payment_status = payment_status;

    if (payment_status === 'Fully Paid' || paidAmount >= session.total_amount) {
      session.status = 'Closed';
      session.payment_status = 'Fully Paid';
      session.closed_at = new Date();
      session.closed_by = req.user._id;
    } else if (paidAmount > 0) {
      session.status = 'Bill Pending';
      session.payment_status = 'Partially Paid';
    } else {
      session.status = 'Bill Pending';
      session.payment_status = 'Pending';
    }

    await session.save();

    await Invoice.updateMany(
      { session_id: session._id },
      {
        $set: {
          payment_status: session.payment_status,
          ...(payment_mode ? { payment_mode } : {}),
        },
      }
    );
    await Order.updateMany(
      { session_id: session._id },
      { $set: { payment_status: session.payment_status === 'Fully Paid' ? 'Paid' : 'Pending' } }
    );

    const io = req.app.get('io');
    io.to(`franchise:${session.franchise_id}`).emit('token:updated', session);
    io.to(`pos:${session.franchise_id}`).emit('token:updated', session);

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getActiveSession, settleSession };
