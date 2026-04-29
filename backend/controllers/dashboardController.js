const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Franchise = require('../models/Franchise');
const Invoice = require('../models/Invoice');
const User = require('../models/User');

// Helper: date range
const getDateRange = (period) => {
  const now = new Date();
  const start = new Date();
  if (period === 'today') { start.setHours(0, 0, 0, 0); }
  else if (period === 'week') { start.setDate(now.getDate() - 7); }
  else if (period === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
  else if (period === 'year') { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
  return { $gte: start, $lte: now };
};

// @GET /api/dashboard/franchise  — For franchise owner / manager
const getFranchiseDashboard = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id._id || req.user.franchise_id;
    const period = req.query.period || 'today';
    const dateRange = getDateRange(period);

    const [
      totalOrders,
      totalRevenue,
      pendingOrders,
      todayOrders,
      topItems,
      recentOrders,
      staffCount,
    ] = await Promise.all([
      Order.countDocuments({ franchise_id: franchiseId, createdAt: dateRange }),
      Order.aggregate([
        { $match: { franchise_id: franchiseId, payment_status: 'Paid', createdAt: dateRange } },
        { $group: { _id: null, total: { $sum: '$final_amount' } } },
      ]),
      Order.countDocuments({ franchise_id: franchiseId, kitchen_status: { $in: ['Pending', 'Accepted', 'Preparing'] } }),
      Order.countDocuments({ franchise_id: franchiseId, createdAt: getDateRange('today') }),
      Order.aggregate([
        { $match: { franchise_id: franchiseId, createdAt: dateRange } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', count: { $sum: '$items.quantity' }, revenue: { $sum: '$items.item_total' } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      Order.find({ franchise_id: franchiseId })
        .populate('customer_id', 'name phone_no')
        .sort({ createdAt: -1 })
        .limit(10),
      User.countDocuments({ franchise_id: franchiseId, isActive: true }),
    ]);

    // Revenue chart (last 7 days)
    const revenueChart = await Order.aggregate([
      { $match: { franchise_id: franchiseId, payment_status: 'Paid', createdAt: getDateRange('week') } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$final_amount' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // GST summary
    const gstSummary = await Invoice.aggregate([
      { $match: { franchise_id: franchiseId, createdAt: dateRange } },
      {
        $group: {
          _id: null,
          totalCgst: { $sum: '$cgst' },
          totalSgst: { $sum: '$sgst' },
          totalIgst: { $sum: '$igst' },
          totalTax: { $sum: '$total_tax' },
          taxableAmount: { $sum: '$taxable_amount' },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        pendingOrders,
        todayOrders,
        topItems,
        recentOrders,
        staffCount,
        revenueChart,
        gstSummary: gstSummary[0] || {},
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/dashboard/master  — Master Admin consolidated
const getMasterDashboard = async (req, res) => {
  try {
    const period = req.query.period || 'month';
    const dateRange = getDateRange(period);

    const [
      totalFranchises,
      totalCustomers,
      totalOrders,
      totalRevenue,
      franchisePerformance,
      recentOrders,
      gstConsolidated,
    ] = await Promise.all([
      Franchise.countDocuments({ isActive: true }),
      Customer.countDocuments(),
      Order.countDocuments({ createdAt: dateRange }),
      Order.aggregate([
        { $match: { payment_status: 'Paid', createdAt: dateRange } },
        { $group: { _id: null, total: { $sum: '$final_amount' } } },
      ]),
      Order.aggregate([
        { $match: { payment_status: 'Paid', createdAt: dateRange } },
        {
          $group: {
            _id: '$franchise_id',
            revenue: { $sum: '$final_amount' },
            orders: { $sum: 1 },
          },
        },
        {
          $lookup: { from: 'franchises', localField: '_id', foreignField: '_id', as: 'franchise' },
        },
        { $unwind: '$franchise' },
        { $project: { franchiseName: '$franchise.name', franchiseCode: '$franchise.franchiseCode', revenue: 1, orders: 1 } },
        { $sort: { revenue: -1 } },
      ]),
      Order.find()
        .populate('customer_id', 'name phone_no')
        .populate('franchise_id', 'name franchiseCode')
        .sort({ createdAt: -1 })
        .limit(10),
      Invoice.aggregate([
        { $match: { createdAt: dateRange } },
        {
          $group: {
            _id: '$franchise_id',
            cgst: { $sum: '$cgst' },
            sgst: { $sum: '$sgst' },
            igst: { $sum: '$igst' },
            totalTax: { $sum: '$total_tax' },
            taxable: { $sum: '$taxable_amount' },
          },
        },
        { $lookup: { from: 'franchises', localField: '_id', foreignField: '_id', as: 'franchise' } },
        { $unwind: '$franchise' },
        { $project: { franchiseName: '$franchise.name', cgst: 1, sgst: 1, igst: 1, totalTax: 1, taxable: 1 } },
      ]),
    ]);

    // Revenue trend
    const revenueTrend = await Order.aggregate([
      { $match: { payment_status: 'Paid', createdAt: getDateRange('month') } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$final_amount' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        totalFranchises,
        totalCustomers,
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        franchisePerformance,
        recentOrders,
        gstConsolidated,
        revenueTrend,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getFranchiseDashboard, getMasterDashboard };
