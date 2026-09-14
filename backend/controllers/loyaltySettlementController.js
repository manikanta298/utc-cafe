const OrderSession = require('../models/OrderSession');
const Customer = require('../models/Customer');
const Loyalty = require('../models/Loyalty');
const Invoice = require('../models/Invoice');
const { getGlobalSetting, calculateEarnedPoints } = require('./loyaltyController');

const settleLoyalty = async (req, res) => {
  try {
    const session = await OrderSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (!session.customerId) return res.status(400).json({ success: false, message: 'A customer is required for loyalty redemption' });
    if (session.status === 'paid' || session.paymentStatus === 'fully_paid') return res.status(400).json({ success: false, message: 'Session is already settled' });

    const points = Math.max(0, Number(req.body.points || 0));
    const customer = await Customer.findById(session.customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    const setting = await getGlobalSetting();
    const available = Number(customer.total_points || 0);
    const usable = Math.min(points, available);
    const value = +(usable * setting.rupeesPerPoint).toFixed(2);
    const remainingBefore = +(session.totalAmount - session.paidAmount).toFixed(2);
    const appliedValue = Math.min(value, Math.max(0, remainingBefore));
    const appliedPoints = Math.min(usable, Math.floor(appliedValue / setting.rupeesPerPoint + 1e-9));
    if (appliedPoints <= 0) return res.status(400).json({ success: false, message: 'No usable loyalty points for this bill' });

    const redemptionValue = +(appliedPoints * setting.rupeesPerPoint).toFixed(2);
    const balanceBefore = available;
    customer.total_points = +(available - appliedPoints).toFixed(4);
    await customer.save();

    session.loyaltyPointsRedeemed = +(session.loyaltyPointsRedeemed + appliedPoints).toFixed(4);
    session.loyaltyRedemptionAmount = +(session.loyaltyRedemptionAmount + redemptionValue).toFixed(2);
    session.payments.push({ amount: redemptionValue, method: 'Loyalty Points', reference: 'LOYALTY', receivedBy: req.user._id });
    session.paidAmount = +(session.paidAmount + redemptionValue).toFixed(2);
    session.paymentStatus = session.paidAmount >= session.totalAmount - 0.01 ? 'fully_paid' : 'partially_paid';

    if (session.paymentStatus === 'fully_paid') {
      session.status = 'paid';
      session.closedAt = new Date();
      const earned = calculateEarnedPoints(Math.max(0, session.totalAmount - session.discountAmount), setting);
      customer.total_points = +(customer.total_points + earned).toFixed(4);
      await customer.save();
      session.loyaltyPointsEarned = earned;
      await Loyalty.create({ customer_id: customer._id, session_id: session._id, franchise_id: session.franchiseId, transaction_type: 'redeem', points_used: appliedPoints, points_value: redemptionValue, balance_before: balanceBefore, balance_after: balanceBefore - appliedPoints, bill_amount: session.totalAmount });
      if (earned > 0) await Loyalty.create({ customer_id: customer._id, session_id: session._id, franchise_id: session.franchiseId, transaction_type: 'earn', points_earned: earned, balance_before: balanceBefore - appliedPoints, balance_after: customer.total_points, bill_amount: session.totalAmount });
    } else {
      await Loyalty.create({ customer_id: customer._id, session_id: session._id, franchise_id: session.franchiseId, transaction_type: 'redeem', points_used: appliedPoints, points_value: redemptionValue, balance_before: balanceBefore, balance_after: balanceBefore - appliedPoints, bill_amount: session.totalAmount });
    }

    await session.save();
    const populated = await OrderSession.findById(session._id).populate('invoiceId');
    res.json({ success: true, session: populated, invoice: populated.invoiceId || null, appliedPoints, redemptionValue, balance: Math.max(0, session.totalAmount - session.paidAmount) });
  } catch (err) { console.error('[settleLoyalty]', err); res.status(500).json({ success: false, message: err.message }); }
};

const finalizeAccrual = async (req, res) => {
  try {
    const session = await OrderSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status !== 'paid' || !session.customerId) return res.json({ success: true, earned: session.loyaltyPointsEarned || 0, alreadyFinalized: true });
    if (Number(session.loyaltyPointsEarned || 0) > 0 || await Loyalty.exists({ session_id: session._id, transaction_type: 'earn' })) return res.json({ success: true, earned: session.loyaltyPointsEarned || 0, alreadyFinalized: true });
    const setting = await getGlobalSetting();
    const customer = await Customer.findById(session.customerId);
    const eligible = Math.max(0, Number(session.totalAmount || 0) - Number(session.discountAmount || 0));
    const earned = calculateEarnedPoints(eligible, setting);
    const before = Number(customer.total_points || 0);
    customer.total_points = before + earned;
    await customer.save();
    session.loyaltyPointsEarned = earned;
    await session.save();
    if (earned > 0) await Loyalty.create({ customer_id: customer._id, session_id: session._id, franchise_id: session.franchiseId, transaction_type: 'earn', points_earned: earned, balance_before: before, balance_after: customer.total_points, bill_amount: eligible });
    if (session.invoiceId) await Invoice.findByIdAndUpdate(session.invoiceId, { $set: { loyalty_points_redeemed: session.loyaltyPointsRedeemed || 0, loyalty_amount_paid: session.loyaltyRedemptionAmount || 0, loyalty_points_earned: earned, payments: session.payments } });
    res.json({ success: true, earned, balance: customer.total_points });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { settleLoyalty, finalizeAccrual };
