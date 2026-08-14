const express  = require('express');
const router   = express.Router();
const MenuItem     = require('../models/MenuItem');
const Franchise    = require('../models/Franchise');
const Customer     = require('../models/Customer');
const Order        = require('../models/Order');
const OrderSession = require('../models/OrderSession');
const Table        = require('../models/Table');
const FranchisePayment = require('../models/FranchisePayment');
const Counter = require('../models/Counter');
const { generateToken, generateSessionRef } = require('../utils/tokenGenerator');


const buildAdditionItems = (items = []) => items.map((i) => ({
  item_id:    i.item_id || i._id,
  name:       i.name,
  price:      Number(i.price),
  gst_rate:   Number(i.gst_rate || 5),
  hsn_code:   i.hsn_code || '',
  quantity:   Number(i.quantity || i.qty || 1),
  item_total: +(Number(i.price) * Number(i.quantity || i.qty || 1)).toFixed(2),
}));

const generateOrderNumber = async (franchise) => {
  const counterKey = `order_${franchise._id}`;
  const counter = await Counter.findOneAndUpdate(
    { key: counterKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${franchise.franchiseCode}-ORD-${String(counter.seq).padStart(5, '0')}`;
};

// GET /api/public/menu/:franchiseId
router.get('/menu/:franchiseId', async (req, res) => {
  try {
    const franchiseId = req.params.franchiseId?.trim().replace(/\s+/g, '');
    if (!franchiseId || !/^[a-f\d]{24}$/i.test(franchiseId))
      return res.status(400).json({ success: false, message: 'Invalid franchise ID' });
    const franchise = await Franchise.findById(franchiseId).select('name logo isActive');
    if (!franchise)
      return res.status(404).json({ success: false, message: 'Franchise not found' });
    let items = await MenuItem.find({ isGlobalActive: true }).sort({ category: 1, sortOrder: 1, name: 1 });
    items = items.filter((item) => !item.disabledInFranchises.map(String).includes(franchiseId));
    res.json({ success: true, items, franchise, franchiseName: franchise.name });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/public/customer/:mobile — unauthenticated customer lookup
router.get('/customer/:mobile', async (req, res) => {
  try {
    const phone    = req.params.mobile.replace(/\D/g, '').slice(-10);
    const customer = await Customer.findOne({ phone_no: { $regex: `${phone}$` } })
      .select('name phone_no email total_points total_orders total_spent last_visit')
      .lean();
    if (!customer) return res.json({ success: true, exists: false, isNew: true, customer: null });
    res.json({ success: true, exists: true, isNew: false, customer });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/public/order — QR self-ordering full flow
router.post('/order', async (req, res) => {
  try {
    const {
      franchiseId, tableNumber, order_type = 'dine_in',
      customer_phone, customer_name, items, payment_mode = 'Cash', total_amount,
    } = req.body;

    if (!franchiseId) return res.status(400).json({ success: false, message: 'franchiseId required' });
    if (!customer_phone || customer_phone.trim().length < 10)
      return res.status(400).json({ success: false, message: 'Valid mobile number required' });
    if (!items || items.length === 0)
      return res.status(400).json({ success: false, message: 'No items in order' });

    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

    const mobile = customer_phone.trim();
    let customer = await Customer.findOne({ phone_no: mobile });
    if (!customer) {
      customer = await Customer.create({
        phone_no: mobile,
        name: customer_name?.trim() || `Guest-${mobile.slice(-4)}`,
        first_franchise: franchiseId,
      });
    } else if (customer_name?.trim() && customer.name.startsWith('Guest-')) {
      customer.name = customer_name.trim();
      await customer.save();
    }

    const orderItems = buildAdditionItems(items);
    const isParcel = order_type === 'parcel';

    const buildOrder = async (session, isAddition) => {
      const orderNumber = await generateOrderNumber(franchise);
      const tokenNum = parseInt(String(session.tokenNumber).replace(/\D/g, ''), 10) || Number(session.tokenNumber) || 0;
      const additionRound = (session.subOrders?.length || 0) + 1;

      return Order.create({
        order_number: orderNumber,
        franchise_id: franchise._id,
        customer_id: customer._id,
        items: orderItems.map((i) => ({
          item_id: i.item_id,
          name: i.name,
          price: i.price,
          gst_rate: i.gst_rate,
          hsn_code: i.hsn_code,
          quantity: i.quantity,
          item_total: i.item_total,
        })),
        sub_total: Number(total_amount || 0),
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 0,
        total_tax: 0,
        gross_total: Number(total_amount || 0),
        discount_amount: 0,
        coupon_code: null,
        coupon_discount: 0,
        total_discount: 0,
        final_amount: Number(total_amount || 0),
        tax_type: 'CGST_SGST',
        payment_mode,
        payment_status: 'Pending',
        kitchen_status: 'Pending',
        token_number: tokenNum,
        order_type,
        table_number: session.tableNumber || (isParcel ? 'Parcel' : 'Counter'),
        table_id: session.tableId || null,
        order_source: 'qr_customer',
        session_id: session._id,
        customer_mobile: mobile,
        created_by: null,
        points_earned: 0,
        visit_type: 'single',
        is_addition: isAddition,
        addition_round: additionRound,
        status_history: [{ status: 'Pending' }],
      });
    };

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    let session = await OrderSession.findOne({
      franchiseId, customerMobile: mobile,
      status: { $in: ['open', 'bill_pending', 'pending_pos'] },
      openedAt: { $gte: todayStart },
    });

    let isAddition = false;
    let order = null;

    if (!session) {
      let retries = 3;
      while (retries-- > 0) {
        try {
          const tokenNumber = await generateToken(franchiseId);
          const sessionRef  = generateSessionRef(franchise.franchiseCode || 'UTC', tokenNumber);
          session = await OrderSession.create({
            tokenNumber,
            sessionRef,
            franchiseId,
            tableId: null,
            tableNumber: isParcel ? 'Parcel' : (tableNumber || 'Counter'),
            customerMobile: mobile,
            customerId: customer._id,
            customerName: customer.name,
            orderType: order_type,
            status: 'pending_pos',
            subOrders: [],
            totalAmount: Number(total_amount || 0),
            openedAt: new Date(),
          });
          order = await buildOrder(session, false);
          session.subOrders.push({
            orderedAt: new Date(),
            isAddition: false,
            destination: 'kitchen',
            items: orderItems,
            order_id: order._id,
          });
          await session.save();
          break;
        } catch (e) {
          if (e.code === 11000 && retries > 0) continue;
          throw e;
        }
      }
    } else {
      isAddition = (session.subOrders?.length || 0) > 0;
      session.status = 'pending_pos';
      session.totalAmount = Math.max(Number(session.totalAmount || 0), Number(total_amount || 0));
      order = await buildOrder(session, isAddition);
      session.subOrders = session.subOrders || [];
      session.subOrders.push({
        orderedAt: new Date(),
        isAddition,
        destination: 'kitchen',
        items: orderItems,
        order_id: order._id,
      });
      await session.save();
    }

    const io = req.app.get('io');
    if (io) {
      const pendingPayload = {
        sessionId: session._id,
        tokenNumber: session.tokenNumber,
        tableNumber: session.tableNumber,
        customerName: customer.name,
        customerMobile: mobile,
        itemCount: orderItems.length,
        totalAmount: Number(total_amount || 0),
        source: 'qr_customer',
        isAddition,
        orderId: order?._id,
        orderNumber: order?.order_number,
        message: isAddition ? 'Additional items added to the same token' : 'New order sent for approval',
        order,
      };
      io.to(`franchise:${franchiseId}`).emit('order:pending_approval', pendingPayload);
      io.to(`franchise:${franchiseId}`).emit('waiter:order_placed', {
        ...pendingPayload,
        waiterName: 'QR Customer',
      });
      io.to(`pos:${franchiseId}`).emit('waiter:order_placed', {
        ...pendingPayload,
        waiterName: 'QR Customer',
      });
      io.to(`franchise:${franchiseId}`).emit(isAddition ? 'order:itemsAdded' : 'order:new', {
        ...pendingPayload,
        orderId: order._id,
        orderNumber: order.order_number,
        order,
      });
    }

    res.status(201).json({
      success: true,
      token_number: session.tokenNumber,
      session_id: session._id,
      session,
      order,
      customer: { name: customer.name, phone: mobile },
      message: 'Order sent for approval',
    });
  } catch (err) {
    console.error('Public order error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/public/session/start
router.post('/session/start', async (req, res) => {
  try {
    const { franchiseId, mobile, tableNumber, orderType = 'dine_in', customerName } = req.body;
    if (!franchiseId) return res.status(400).json({ success: false, message: 'franchiseId required' });
    if (!mobile || mobile.trim().length < 10)
      return res.status(400).json({ success: false, message: 'Valid mobile number required' });

    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

    const phone = mobile.trim();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const existing = await OrderSession.findOne({
      franchiseId, customerMobile: phone,
      status: { $in: ['open', 'bill_pending'] },
      openedAt: { $gte: todayStart },
    }).populate('customerId', 'name phone_no total_points total_orders');

    if (existing) return res.json({ success: true, session: existing, isResumed: true, customer: existing.customerId });

    let customer = await Customer.findOne({ phone_no: phone });
    const isNew  = !customer;
    if (!customer) {
      customer = await Customer.create({
        phone_no: phone,
        name: customerName?.trim() || `Guest-${phone.slice(-4)}`,
        first_franchise: franchiseId,
      });
    }

    let session;
    let retries2 = 3;
    while (retries2-- > 0) {
      try {
        const tokenNumber = await generateToken(franchiseId);
        const sessionRef  = generateSessionRef(franchise.franchiseCode || 'UTC', tokenNumber);
        session = await OrderSession.create({
          tokenNumber, sessionRef, franchiseId,
          tableNumber: tableNumber || 'Parcel',
          customerMobile: phone, customerId: customer._id,
          customerName: customer.name, orderType,
        });
        break;
      } catch (e) {
        if (e.code === 11000 && retries2 > 0) continue;
        throw e;
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`franchise:${franchiseId}`).emit('session:started', {
        tokenNumber: session.tokenNumber, tableNumber: tableNumber || 'Parcel',
        customerName: customer.name, sessionId: session._id,
      });
    }
    return res.status(201).json({ success: true, session, isResumed: false, isNew, customer });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/public/coupon/validate — validate coupon for customer (no auth)
router.post('/coupon/validate', async (req, res) => {
  try {
    const Coupon = require('../models/Coupon');
    const { code, orderAmount, franchiseId } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Coupon code required' });

    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim(), isActive: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid or expired coupon code' });

    const now = new Date();
    if (coupon.expiresAt && coupon.expiresAt < now)
      return res.status(400).json({ success: false, message: 'This coupon has expired' });
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses)
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
    if (coupon.minOrderAmount > 0 && orderAmount < coupon.minOrderAmount)
      return res.status(400).json({ success: false, message: `Minimum order Rs.${coupon.minOrderAmount} required` });
    if (coupon.applicableFranchises.length > 0 && franchiseId &&
        !coupon.applicableFranchises.map(String).includes(String(franchiseId)))
      return res.status(400).json({ success: false, message: 'Coupon not valid for this outlet' });

    let discountAmount = coupon.discountType === 'percentage'
      ? +(orderAmount * coupon.discountValue / 100).toFixed(2)
      : Math.min(coupon.discountValue, orderAmount);
    if (coupon.maxDiscountAmount > 0) discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);

    res.json({ success: true, discountAmount, coupon: { code: coupon.code, description: coupon.description, discountType: coupon.discountType, discountValue: coupon.discountValue } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/public/upi-qr/:franchiseId — Generate UPI payment QR for customer (no auth)
router.get('/upi-qr/:franchiseId', async (req, res) => {
  try {
    const franchiseId = req.params.franchiseId?.trim().replace(/\s+/g, '');
    const { amount, sessionId, tokenNumber, mobile } = req.query;

    const config = await FranchisePayment.findOne({ franchiseId }).populate('franchiseId', 'name');
    if (!config || !config.upiId)
      return res.json({ success: false, configured: false, message: 'UPI not configured' });

    const merchantName = encodeURIComponent(config.franchiseId?.name || 'UTC Cafe');
    const expiresAt    = Date.now() + 10 * 60 * 1000; // 10 minutes from now
    const noteParts    = [`Token:${tokenNumber || ''}`, mobile ? `Mob:${mobile}` : '', `Exp:${expiresAt}`].filter(Boolean);
    const note         = encodeURIComponent(noteParts.join('|'));
    const upiLink      = `upi://pay?pa=${config.upiId}&pn=${merchantName}&am=${amount || ''}&cu=INR&tn=${note}`;

    let qr = upiLink;
    try {
      const QRCode = require('qrcode');
      qr = await QRCode.toDataURL(upiLink, { width: 300, margin: 2 });
    } catch { /* fallback to raw link */ }

    res.json({ success: true, qr, upiId: config.upiId, amount: amount || '', upiLink });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
