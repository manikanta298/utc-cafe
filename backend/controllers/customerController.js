const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const Loyalty = require('../models/Loyalty');
const { calculatePointsValue } = require('../utils/gst');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const formatCurrency = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

const getFranchiseFilter = (req) => (
  req.user.role === 'master_admin'
    ? {}
    : { franchise_id: req.user.franchise_id._id || req.user.franchise_id }
);

const buildCustomerInsights = async (req, customerId) => {
  const franchiseFilter = getFranchiseFilter(req);
  const orderFilter = { customer_id: customerId, ...franchiseFilter };
  const invoiceFilter = { customer_id: customerId, ...franchiseFilter };
  const loyaltyFilter = { customer_id: customerId, ...franchiseFilter };
  const recentCutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  const [orders, invoices, loyaltyHistory] = await Promise.all([
    Order.find(orderFilter)
      .select('order_number final_amount payment_mode kitchen_status token_number createdAt items')
      .sort({ createdAt: -1 })
      .limit(50),
    Invoice.find(invoiceFilter)
      .select('invoice_no invoice_date final_amount payment_mode createdAt')
      .sort({ invoice_date: -1, createdAt: -1 })
      .limit(50),
    Loyalty.find(loyaltyFilter)
      .select('transaction_type points_earned points_used balance_after createdAt')
      .sort({ createdAt: -1 })
      .limit(30),
  ]);

  const last30DayOrders = orders.filter((order) => new Date(order.createdAt) >= recentCutoff);
  const purchaseMap = new Map();
  const visitDays = new Set();

  for (const order of orders) {
    if (new Date(order.createdAt) >= recentCutoff) {
      visitDays.add(new Date(order.createdAt).toDateString());
    }

    for (const item of order.items || []) {
      const existing = purchaseMap.get(item.name) || {
        name: item.name,
        quantity: 0,
        orders: 0,
        amount: 0,
        lastPurchasedAt: order.createdAt,
      };

      existing.quantity += Number(item.quantity || 0);
      existing.orders += 1;
      existing.amount += Number(item.item_total || 0);
      existing.lastPurchasedAt = existing.lastPurchasedAt > order.createdAt ? existing.lastPurchasedAt : order.createdAt;

      purchaseMap.set(item.name, existing);
    }
  }

  const purchaseHistory = [...purchaseMap.values()]
    .sort((a, b) => b.lastPurchasedAt - a.lastPurchasedAt)
    .slice(0, 12);

  const activityHistory = [
    ...orders.slice(0, 10).map((order) => ({
      id: `order-${order._id}`,
      date: order.createdAt,
      title: `Order ${order.order_number}`,
      description: `${formatCurrency(order.final_amount)} · ${order.payment_mode} · ${order.kitchen_status}`,
    })),
    ...loyaltyHistory.slice(0, 10).map((entry) => ({
      id: `loyalty-${entry._id}`,
      date: entry.createdAt,
      title: entry.transaction_type === 'redeem' ? 'Loyalty redeemed' : 'Loyalty earned',
      description: entry.transaction_type === 'redeem'
        ? `${entry.points_used || 0} points redeemed · Balance ${entry.balance_after || 0}`
        : `${entry.points_earned || 0} points earned · Balance ${entry.balance_after || 0}`,
    })),
  ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 20);

  return {
    recentOrders: orders.slice(0, 10),
    customerInsights: {
      last30DayVisits: visitDays.size,
      last30DayOrders: last30DayOrders.length,
      last30DaySpent: last30DayOrders.reduce((sum, order) => sum + Number(order.final_amount || 0), 0),
      totalSpent: orders.reduce((sum, order) => sum + Number(order.final_amount || 0), 0),
      purchaseHistory,
      previousBills: invoices,
      activityHistory,
    },
    loyaltyHistory,
  };
};

// @GET /api/customers/lookup?phone=9999999999
const lookupByPhone = async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });

    const customer = await Customer.findOne({ phone_no: phone.trim() });
    const isNew = !customer;

    if (!customer) {
      return res.json({
        success: true,
        customer: null,
        isNew,
        pointsValue: 0,
        recentOrders: [],
        customerInsights: {
          last30DayVisits: 0,
          last30DayOrders: 0,
          last30DaySpent: 0,
          totalSpent: 0,
          purchaseHistory: [],
          previousBills: [],
          activityHistory: [],
        },
      });
    }

    const { recentOrders, customerInsights } = await buildCustomerInsights(req, customer._id);

    res.json({
      success: true,
      customer,
      isNew,
      pointsValue: calculatePointsValue(customer.total_points),
      recentOrders,
      customerInsights,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/customers
const createCustomer = async (req, res) => {
  try {
    const { phone_no, name, email } = req.body;
    if (!phone_no || !name) return res.status(400).json({ success: false, message: 'Phone and name required' });

    const exists = await Customer.findOne({ phone_no: phone_no.trim() });
    if (exists) return res.json({ success: true, customer: exists, isNew: false });

    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    const customer = await Customer.create({
      phone_no: phone_no.trim(),
      name: name.trim(),
      email: email?.trim() || '',
      first_franchise: franchiseId,
    });
    res.status(201).json({ success: true, customer, isNew: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/customers
const getCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone_no: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [customers, total] = await Promise.all([
      Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Customer.countDocuments(filter),
    ]);
    res.json({ success: true, customers, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/customers/:id/history
const getCustomerHistory = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const { recentOrders, customerInsights, loyaltyHistory } = await buildCustomerInsights(req, customer._id);

    res.json({
      success: true,
      customer,
      orders: recentOrders,
      loyaltyHistory,
      pointsValue: calculatePointsValue(customer.total_points),
      customerInsights,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { lookupByPhone, createCustomer, getCustomers, getCustomerHistory };
