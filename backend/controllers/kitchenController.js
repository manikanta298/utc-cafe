const Order = require('../models/Order');
const Franchise = require('../models/Franchise');
const TokenSession = require('../models/TokenSession');
const {
  sendOrderAccepted,
  sendOrderPreparing,
  sendOrderReady,
} = require('../utils/sms');

const STATUS_FLOW = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Delivered'];

const NOTIFICATION_MESSAGES = {
  Accepted:  'Your order has been accepted by the kitchen.',
  Preparing: 'Your order is currently being prepared.',
  Ready:     'Your order is ready! Please collect it from the counter.',
  Delivered: 'Your order has been delivered. Thank you for visiting!',
};

// @GET /api/kitchen/orders
const getKitchenOrders = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id._id || req.user.franchise_id;
    const orders = await Order.find({
      franchise_id: franchiseId,
      kitchen_status: { $in: ['Pending', 'Accepted', 'Preparing', 'Ready'] },
    })
      .populate('customer_id', 'name phone_no')
      .populate('session_id', 'token_label payment_status status amount_paid total_amount table_number')
      .sort({ createdAt: 1 });
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @PUT /api/kitchen/orders/:id/status
const updateKitchenStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id)
      .populate('customer_id', 'name phone_no')
      .populate('franchise_id', 'name franchiseCode');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const userFranchise = (req.user.franchise_id._id || req.user.franchise_id).toString();
    if (order.franchise_id._id.toString() !== userFranchise) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!STATUS_FLOW.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const currentIdx = STATUS_FLOW.indexOf(order.kitchen_status);
    const newIdx     = STATUS_FLOW.indexOf(status);
    if (newIdx <= currentIdx) {
      return res.status(400).json({ success: false, message: 'Cannot move status backward' });
    }

    order.kitchen_status = status;
    order.status_history.push({ status, updatedBy: req.user._id });
    await order.save();

    // Socket.io real-time push
    const io = req.app.get('io');
    const payload = {
      orderId:             order._id,
      sessionId:           order.session_id,
      orderNumber:         order.order_number,
      tokenNumber:         order.token_number,
      tokenLabel:          order.token_label,
      tableNumber:         order.table_number,
      status,
      customerName:        order.customer_id?.name,
      customerPhone:       order.customer_id?.phone_no,
      notificationMessage: NOTIFICATION_MESSAGES[status] || '',
      updatedAt:           new Date(),
    };
    io.to(`franchise:${order.franchise_id._id}`).emit('order:statusUpdate', payload);
    io.to(`pos:${order.franchise_id._id}`).emit('order:statusUpdate', payload);
    io.to(`kitchen:${order.franchise_id._id}`).emit('order:statusUpdate', payload);
    io.to(`display:${order.franchise_id._id}`).emit('order:statusUpdate', payload);

    if (order.session_id) {
      const session = await TokenSession.findById(order.session_id);
      if (session) {
        const tokenPayload = {
          sessionId: session._id,
          tokenLabel: session.token_label,
          tokenNumber: session.token_number,
          tableNumber: session.table_number,
          status: session.status,
          paymentStatus: session.payment_status,
          totalAmount: session.total_amount,
          amountPaid: session.amount_paid,
          outstandingAmount: Math.max(0, +(Number(session.total_amount || 0) - Number(session.amount_paid || 0)).toFixed(2)),
          kitchenStatus: status,
          updatedAt: new Date(),
        };
        io.to(`display:${order.franchise_id._id}`).emit(status === 'Ready' ? 'token:ready' : 'token:updated', tokenPayload);
        if (status === 'Delivered') {
          io.to(`display:${order.franchise_id._id}`).emit('token:delivered', tokenPayload);
        }
      }
    }

    // SMS notifications — non-blocking
    const customerPhone = order.customer_id?.phone_no;
    const customerName  = order.customer_id?.name || 'Customer';
    const franchiseName = order.franchise_id?.name || 'UTC Cafe';
    const tokenNumber   = order.token_number;

    if (customerPhone) {
      if (status === 'Accepted') {
        sendOrderAccepted(customerPhone, customerName, tokenNumber, franchiseName)
          .catch((e) => console.error('SMS Accepted error:', e.message));
      }
      if (status === 'Preparing') {
        sendOrderPreparing(customerPhone, customerName, tokenNumber)
          .catch((e) => console.error('SMS Preparing error:', e.message));
      }
      if (status === 'Ready') {
        sendOrderReady(customerPhone, customerName, tokenNumber, franchiseName)
          .catch((e) => console.error('SMS Ready error:', e.message));
      }
    }

    res.json({
      success:      true,
      order,
      notification: NOTIFICATION_MESSAGES[status] || '',
      smsSent:      !!customerPhone,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/kitchen/orders/history
const getKitchenHistory = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id._id || req.user.franchise_id;
    const startOfDay  = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const orders = await Order.find({
      franchise_id:   franchiseId,
      kitchen_status: { $in: ['Ready', 'Delivered'] },
      createdAt:      { $gte: startOfDay },
    })
      .populate('customer_id', 'name phone_no')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getKitchenOrders, updateKitchenStatus, getKitchenHistory };
