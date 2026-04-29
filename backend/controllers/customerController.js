const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Loyalty = require('../models/Loyalty');
const { calculatePointsValue } = require('../utils/gst');

// @GET /api/customers/lookup?phone=9999999999  — POS phone lookup
const lookupByPhone = async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });

    let customer = await Customer.findOne({ phone_no: phone.trim() });
    const isNew = !customer;

    res.json({
      success: true,
      customer: customer || null,
      isNew,
      pointsValue: customer ? calculatePointsValue(customer.total_points) : 0,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/customers  — Create new customer (called from POS when new)
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

// @GET /api/customers  — List customers (Master Admin or franchise-filtered)
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

// @GET /api/customers/:id/history  — Customer order history
const getCustomerHistory = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const orders = await Order.find({ customer_id: customer._id })
      .populate('franchise_id', 'name franchiseCode city')
      .sort({ createdAt: -1 })
      .limit(50);

    const loyaltyHistory = await Loyalty.find({ customer_id: customer._id })
      .populate('franchise_id', 'name')
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({
      success: true,
      customer,
      orders,
      loyaltyHistory,
      pointsValue: calculatePointsValue(customer.total_points),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { lookupByPhone, createCustomer, getCustomers, getCustomerHistory };
