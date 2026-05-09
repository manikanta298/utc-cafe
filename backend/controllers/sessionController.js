const OrderSession = require('../models/OrderSession');
const Customer = require('../models/Customer');
const Franchise = require('../models/Franchise');
const Table = require('../models/Table');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const { generateToken, generateSessionRef } = require('../utils/tokenGenerator');
const { determineTaxType, calculateOrderTax } = require('../utils/gst');

// POST /api/sessions/start — Start or resume a session
const startSession = async (req, res) => {
  try {
    const { mobile, tableNumber, orderType = 'dine_in', tableId } = req.body;

    if (!mobile || mobile.trim().length < 10) {
      return res.status(400).json({ success: false, message: 'Valid mobile number required' });
    }

    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

    // Check for existing open/bill_pending session for this mobile today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existingSession = await OrderSession.findOne({
      franchiseId,
      customerMobile: mobile.trim(),
      status: { $in: ['open', 'bill_pending'] },
      openedAt: { $gte: todayStart },
    }).populate('customerId', 'name phone_no total_points total_orders total_spent');

    if (existingSession) {
      return res.json({
        success: true,
        session: existingSession,
        isResumed: true,
        message: `Resumed Token ${existingSession.tokenNumber} — ${existingSession.tableNumber}`,
      });
    }

    // Find or prepare customer
    let customer = await Customer.findOne({ phone_no: mobile.trim() });
    const isNewCustomer = !customer;

    // Generate token and session ref
    const tokenNumber = await generateToken(franchiseId);
    const sessionRef = generateSessionRef(franchise.franchiseCode, tokenNumber);

    // Create new session
    const session = await OrderSession.create({
      tokenNumber,
      sessionRef,
      franchiseId,
      tableId: tableId || null,
      tableNumber: tableNumber || 'Counter',
      customerMobile: mobile.trim(),
      customerId: customer?._id || null,
      customerName: customer?.name || '',
      orderType,
      openedBy: req.user._id,
    });

    // Mark table occupied
    if (tableId) {
      await Table.findByIdAndUpdate(tableId, {
        status: 'occupied',
        currentSessionId: session._id,
      });
    }

    // Emit socket event
    const io = req.app.get('io');
    io.to(`franchise:${franchiseId}`).emit('session:started', {
      tokenNumber,
      tableNumber: tableNumber || 'Counter',
      customerName: customer?.name || 'New Customer',
      sessionId: session._id,
    });
    // Table map update
    if (tableId) {
      io.to(`franchise:${franchiseId}`).emit('table:statusUpdated', {
        tableId,
        tableNumber: tableNumber || '',
        status: 'occupied',
        tokenNumber,
      });
    }

    return res.status(201).json({
      success: true,
      session,
      isResumed: false,
      isNewCustomer,
      customer: customer || null,
      message: `Token ${tokenNumber} created for ${tableNumber || 'Counter'}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/sessions/:sessionId/orders — Add order to session
const addOrderToSession = async (req, res) => {
  try {
    const { items, destination = 'kitchen' } = req.body;
    const session = await OrderSession.findById(req.params.sessionId);

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status === 'paid' || session.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Session is already closed' });
    }

    const franchiseId = session.franchiseId;
    const franchise = await Franchise.findById(franchiseId);

    // Validate and build items
    const builtItems = [];
    for (const line of items) {
      const menuItem = await MenuItem.findById(line.menuItemId);
      if (!menuItem || !menuItem.isGlobalActive) {
        return res.status(400).json({ success: false, message: `Item not available: ${line.menuItemId}` });
      }
      if (menuItem.disabledInFranchises.map(String).includes(franchiseId.toString())) {
        return res.status(400).json({ success: false, message: `Item disabled at this outlet: ${menuItem.name}` });
      }
      builtItems.push({
        menuItemId: menuItem._id,
        name: menuItem.name,
        qty: line.qty || line.quantity || 1,
        unitPrice: menuItem.price,
        totalPrice: +(menuItem.price * (line.qty || line.quantity || 1)).toFixed(2),
        gst_rate: menuItem.gst_rate,
        hsn_code: menuItem.hsn_code || '',
        notes: line.notes || '',
      });
    }

    const isAddition = session.subOrders.length > 0;

    // Create an Order doc for kitchen tracking
    const { subTotal, cgst, sgst, igst, totalTax, grossTotal } = calculateOrderTax(
      builtItems.map(i => ({ ...i, price: i.unitPrice, quantity: i.qty, item_total: i.totalPrice })),
      determineTaxType(franchise.state, franchise.state)
    );
    const count = await Order.countDocuments({ franchise_id: franchiseId });
    const orderNumber = `${franchise.franchiseCode}-ORD-${String(count + 1).padStart(5, '0')}`;
    const tokenNum = await (async () => {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const c = await Order.countDocuments({ franchise_id: franchiseId, createdAt: { $gte: startOfDay } });
      return c + 1;
    })();

    const customer = session.customerId
      ? await Customer.findById(session.customerId)
      : await Customer.findOne({ phone_no: session.customerMobile });

    if (!customer) {
      return res.status(400).json({ success: false, message: 'Customer not found. Please register customer first.' });
    }

    const order = await Order.create({
      order_number: orderNumber,
      franchise_id: franchiseId,
      customer_id: customer._id,
      items: builtItems.map(i => ({
        item_id: i.menuItemId,
        name: i.name,
        price: i.unitPrice,
        gst_rate: i.gst_rate,
        hsn_code: i.hsn_code,
        quantity: i.qty,
        item_total: i.totalPrice,
      })),
      sub_total: subTotal,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      total_tax: totalTax,
      gross_total: grossTotal,
      discount_amount: 0,
      final_amount: grossTotal,
      tax_type: determineTaxType(franchise.state, franchise.state),
      payment_mode: 'Cash',
      payment_status: 'Pending',
      kitchen_status: 'Pending',
      token_number: tokenNum,
      created_by: req.user._id,
    });

    // Add subOrder to session
    session.subOrders.push({
      orderedAt: new Date(),
      isAddition,
      destination,
      items: builtItems,
      placedBy: req.user._id,
      order_id: order._id,
    });

    await session.save();

    // Emit to kitchen / counter
    const io = req.app.get('io');
    const kitchenPayload = {
      sessionId: session._id,
      tokenNumber: session.tokenNumber,
      tableNumber: session.tableNumber,
      isAddition,
      items: builtItems,
      orderedAt: new Date(),
      orderId: order._id,
      orderNumber,
    };

    if (destination === 'kitchen' || destination === 'both') {
      io.to(`franchise:${franchiseId}`).emit('order:new', kitchenPayload);
    }
    if (destination === 'counter' || destination === 'both') {
      io.to(`pos:${franchiseId}`).emit('order:counter', kitchenPayload);
    }

    res.json({ success: true, session, order, isAddition });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/sessions/:sessionId — Get session details with merged items
const getSession = async (req, res) => {
  try {
    const session = await OrderSession.findById(req.params.sessionId)
      .populate('customerId', 'name phone_no total_points total_orders total_spent')
      .populate('franchiseId', 'name franchiseCode state gstin address')
      .populate('openedBy', 'name');

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    // Franchise isolation
    if (req.user.role !== 'master_admin') {
      const userFranchise = (req.user.franchise_id?._id || req.user.franchise_id).toString();
      if (session.franchiseId._id.toString() !== userFranchise) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/sessions/:sessionId/bill — Generate merged final bill
const generateBill = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const session = await OrderSession.findById(req.params.sessionId)
      .populate('franchiseId', 'name franchiseCode state gstin address');

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status === 'paid' || session.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Session already closed' });
    }

    // Merge all sub-order items
    const itemMap = new Map();
    for (const sub of session.subOrders) {
      for (const item of sub.items) {
        const key = item.name;
        if (itemMap.has(key)) {
          const existing = itemMap.get(key);
          existing.qty += item.qty;
          existing.totalPrice = +(existing.unitPrice * existing.qty).toFixed(2);
        } else {
          itemMap.set(key, { ...item.toObject(), qty: item.qty });
        }
      }
    }
    const mergedItems = [...itemMap.values()];

    // Calculate totals
    const franchise = session.franchiseId;
    const taxCalc = calculateOrderTax(
      mergedItems.map(i => ({ price: i.unitPrice, quantity: i.qty, item_total: i.totalPrice, gst_rate: i.gst_rate })),
      determineTaxType(franchise.state, franchise.state)
    );

    let discountAmount = 0;
    let appliedCoupon = '';

    // Apply coupon if provided
    if (couponCode) {
      const Coupon = require('../models/Coupon');
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
      if (coupon) {
        const now = new Date();
        const notExpired = !coupon.expiresAt || coupon.expiresAt > now;
        const hasUses = coupon.maxUses === 0 || coupon.usedCount < coupon.maxUses;
        const meetsMin = taxCalc.grossTotal >= coupon.minOrderAmount;

        if (notExpired && hasUses && meetsMin) {
          if (coupon.discountType === 'percentage') {
            discountAmount = +(taxCalc.grossTotal * coupon.discountValue / 100).toFixed(2);
            if (coupon.maxDiscountAmount > 0) discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
          } else {
            discountAmount = Math.min(coupon.discountValue, taxCalc.grossTotal);
          }
          appliedCoupon = coupon.code;
          coupon.usedCount += 1;
          await coupon.save();
        }
      }
    }

    const totalAmount = Math.max(0, +(taxCalc.grossTotal - discountAmount).toFixed(2));

    session.mergedItems = mergedItems;
    session.subtotal = taxCalc.subTotal;
    session.cgst_amount = taxCalc.cgst;
    session.sgst_amount = taxCalc.sgst;
    session.total_tax = taxCalc.totalTax;
    session.discountAmount = discountAmount;
    session.couponCode = appliedCoupon;
    session.totalAmount = totalAmount;
    session.status = 'bill_pending';
    session.billGeneratedAt = new Date();
    await session.save();

    // Update table status
    if (session.tableId) {
      await Table.findByIdAndUpdate(session.tableId, { status: 'bill_pending' });
      const io = req.app.get('io');
      io.to(`franchise:${session.franchiseId._id}`).emit('table:statusUpdated', {
        tableId: session.tableId,
        tableNumber: session.tableNumber,
        status: 'bill_pending',
        tokenNumber: session.tokenNumber,
      });
    }

    res.json({ success: true, session, message: 'Bill generated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/sessions/:sessionId/payment — Record a payment
const recordPayment = async (req, res) => {
  try {
    const { amount, method } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid payment amount' });

    const session = await OrderSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status === 'paid' || session.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Session is already closed' });
    }

    session.payments.push({ amount: +amount, method, receivedBy: req.user._id });
    session.paidAmount = +(session.paidAmount + +amount).toFixed(2);

    const balance = session.totalAmount - session.paidAmount;

    if (session.paidAmount >= session.totalAmount) {
      session.paymentStatus = 'fully_paid';
      session.status = 'paid';
      session.closedAt = new Date();

      // Update table to available
      if (session.tableId) {
        await Table.findByIdAndUpdate(session.tableId, { status: 'available', currentSessionId: null });
        const io = req.app.get('io');
        io.to(`franchise:${session.franchiseId}`).emit('table:statusUpdated', {
          tableId: session.tableId,
          tableNumber: session.tableNumber,
          status: 'available',
          tokenNumber: null,
        });
      }

      // Update customer stats
      if (session.customerId) {
        await Customer.findByIdAndUpdate(session.customerId, {
          $inc: { total_orders: 1, total_spent: session.totalAmount },
          last_visit: new Date(),
        });
      }

      const io = req.app.get('io');
      io.to(`franchise:${session.franchiseId}`).emit('session:closed', {
        tokenNumber: session.tokenNumber,
        tableNumber: session.tableNumber,
        sessionId: session._id,
      });
    } else if (session.paidAmount > 0) {
      session.paymentStatus = balance < 0 ? 'advance_paid' : 'partially_paid';
    }

    await session.save();

    const io = req.app.get('io');
    io.to(`pos:${session.franchiseId}`).emit('payment:received', {
      sessionId: session._id,
      tokenNumber: session.tokenNumber,
      paidAmount: session.paidAmount,
      totalAmount: session.totalAmount,
      paymentStatus: session.paymentStatus,
    });

    res.json({ success: true, session, balance: Math.max(0, balance) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/sessions — List active sessions for franchise
const getSessions = async (req, res) => {
  try {
    const franchiseId = req.user.role === 'master_admin'
      ? req.query.franchiseId
      : (req.user.franchise_id?._id || req.user.franchise_id);

    const filter = { franchiseId };
    if (req.query.status) filter.status = req.query.status;
    if (!req.query.status) filter.status = { $in: ['open', 'bill_pending'] };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    filter.openedAt = { $gte: todayStart };

    const sessions = await OrderSession.find(filter)
      .populate('customerId', 'name phone_no')
      .sort({ openedAt: -1 })
      .limit(100)
      .lean();

    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/sessions/:sessionId/customer — Register/link customer to open session
const linkCustomer = async (req, res) => {
  try {
    const { name, gender, age, city, state, address, village, pincode } = req.body;
    const session = await OrderSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    let customer = await Customer.findOne({ phone_no: session.customerMobile });
    if (!customer) {
      customer = await Customer.create({
        phone_no: session.customerMobile,
        name: name || 'Customer',
        gender: gender || '',
        age: age || null,
        city: city || '',
        state: state || '',
        address: address || '',
        village: village || '',
        pincode: pincode || '',
      });
    } else {
      // Update any new fields
      if (name) customer.name = name;
      if (gender) customer.gender = gender;
      if (age) customer.age = age;
      if (city) customer.city = city;
      await customer.save();
    }

    session.customerId = customer._id;
    session.customerName = customer.name;
    await session.save();

    res.json({ success: true, customer, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { startSession, addOrderToSession, getSession, generateBill, recordPayment, getSessions, linkCustomer };
