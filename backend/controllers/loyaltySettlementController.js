const OrderSession = require('../models/OrderSession');
const Customer = require('../models/Customer');
const Loyalty = require('../models/Loyalty');
const Invoice = require('../models/Invoice');
const Franchise = require('../models/Franchise');
const Table = require('../models/Table');
const { getGlobalSetting, calculateEarnedPoints } = require('./loyaltyController');

const createInvoiceForSession = async (session) => {
  if (session.invoiceId) return Invoice.findById(session.invoiceId);
  const franchise = await Franchise.findById(session.franchiseId);
  if (!franchise) throw new Error('Franchise not found');
  franchise.invoiceCounter = (franchise.invoiceCounter || 0) + 1;
  await franchise.save();
  const code = franchise.franchiseCode || `FR${String(franchise._id).slice(-4).toUpperCase()}`;
  const invoice = await Invoice.create({
    invoice_no: `${code}-INV-${String(franchise.invoiceCounter).padStart(4, '0')}`,
    franchise_id: franchise._id, franchise_name: franchise.name, franchise_gstin: franchise.gstin || '', franchise_address: franchise.address || '', franchise_state: franchise.state || '',
    customer_id: session.customerId, customer_name: session.customerName || 'Walk-in', customer_phone: session.customerMobile || '',
    taxable_amount: session.subtotal || 0, cgst: session.cgst_amount || 0, sgst: session.sgst_amount || 0, igst: 0, total_tax: session.total_tax || 0,
    discount_amount: session.discountAmount || 0, final_amount: session.totalAmount || 0,
    payment_mode: session.payments?.length > 1 ? 'Split' : (session.payments?.[0]?.method || 'Loyalty Points'),
    loyalty_points_redeemed: session.loyaltyPointsRedeemed || 0, loyalty_amount_paid: session.loyaltyRedemptionAmount || 0, loyalty_points_earned: session.loyaltyPointsEarned || 0,
    payments: session.payments || [],
    items: (session.mergedItems || []).map(i => ({ name: i.name, hsn_code: i.hsn_code || '', quantity: i.qty || 1, price: i.unitPrice || 0, gst_rate: i.gst_rate || 0, item_total: i.totalPrice || 0 })),
    visit_type: session.visitType || 'single',
  });
  session.invoiceId = invoice._id;
  return invoice;
};

const closeTable = async (session, req) => {
  if (!session.tableId) return;
  await Table.findByIdAndUpdate(session.tableId, { status: 'available', currentSessionId: null });
  const io = req.app.get('io');
  if (io) io.to(`franchise:${session.franchiseId}`).emit('table:statusUpdated', { tableId: session.tableId.toString(), tableNumber: session.tableNumber, status: 'available', tokenNumber: null, sessionCleared: true });
};

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
    const remainingBefore = Math.max(0, +(session.totalAmount - session.paidAmount).toFixed(2));
    const appliedPoints = Math.min(usable, Math.floor(remainingBefore / setting.rupeesPerPoint + 1e-9));
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

    await Loyalty.create({ customer_id: customer._id, session_id: session._id, franchise_id: session.franchiseId, transaction_type: 'redeem', points_used: appliedPoints, points_value: redemptionValue, balance_before: balanceBefore, balance_after: balanceBefore - appliedPoints, bill_amount: session.totalAmount });

    let invoice = null;
    if (session.paymentStatus === 'fully_paid') {
      session.status = 'paid'; session.closedAt = new Date();
      // totalAmount is already the final amount after discount.
      const earned = calculateEarnedPoints(Math.max(0, Number(session.totalAmount || 0)), setting);
      const afterRedeem = Number(customer.total_points || 0);
      customer.total_points = +(afterRedeem + earned).toFixed(4);
      customer.total_orders += 1; customer.total_spent += session.totalAmount; customer.last_visit = new Date();
      await customer.save();
      session.loyaltyPointsEarned = earned;
      if (earned > 0) await Loyalty.create({ customer_id: customer._id, session_id: session._id, franchise_id: session.franchiseId, transaction_type: 'earn', points_earned: earned, balance_before: afterRedeem, balance_after: customer.total_points, bill_amount: session.totalAmount });
      invoice = await createInvoiceForSession(session);
      await closeTable(session, req);
    }
    await session.save();
    const populated = await OrderSession.findById(session._id).populate('invoiceId');
    res.json({ success: true, session: populated, invoice: invoice || populated.invoiceId || null, appliedPoints, redemptionValue, balance: Math.max(0, session.totalAmount - session.paidAmount), earned: session.loyaltyPointsEarned || 0 });
  } catch (err) { console.error('[settleLoyalty]', err); res.status(500).json({ success: false, message: err.message }); }
};

const finalizeAccrual = async (req, res) => {
  try {
    const session = await OrderSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status !== 'paid' || !session.customerId) return res.json({ success: true, earned: session.loyaltyPointsEarned || 0, alreadyFinalized: true });
    if (await Loyalty.exists({ session_id: session._id, transaction_type: 'earn' })) return res.json({ success: true, earned: session.loyaltyPointsEarned || 0, alreadyFinalized: true });
    const setting = await getGlobalSetting();
    const customer = await Customer.findById(session.customerId);
    const eligible = Math.max(0, Number(session.totalAmount || 0));
    const earned = calculateEarnedPoints(eligible, setting);
    const before = Number(customer.total_points || 0);
    customer.total_points = before + earned; await customer.save();
    session.loyaltyPointsEarned = earned; await session.save();
    if (earned > 0) await Loyalty.create({ customer_id: customer._id, session_id: session._id, franchise_id: session.franchiseId, transaction_type: 'earn', points_earned: earned, balance_before: before, balance_after: customer.total_points, bill_amount: eligible });
    const invoice = await createInvoiceForSession(session);
    await Invoice.findByIdAndUpdate(invoice._id, { $set: { loyalty_points_redeemed: session.loyaltyPointsRedeemed || 0, loyalty_amount_paid: session.loyaltyRedemptionAmount || 0, loyalty_points_earned: earned, payments: session.payments } });
    res.json({ success: true, earned, balance: customer.total_points, invoice });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
module.exports = { settleLoyalty, finalizeAccrual };