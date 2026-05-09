const Table = require('../models/Table');
const OrderSession = require('../models/OrderSession');
const crypto = require('crypto');

const QR_SECRET = process.env.QR_SECRET || 'utc-cafe-qr-secret-key';

// Generate HMAC signature for table QR
const signTable = (franchiseId, tableNumber) =>
  crypto.createHmac('sha256', QR_SECRET).update(`${franchiseId}:${tableNumber}`).digest('hex');

// GET /api/tables — List tables for franchise
const getTables = async (req, res) => {
  try {
    const franchiseId = req.user.role === 'master_admin'
      ? req.query.franchiseId
      : (req.user.franchise_id?._id || req.user.franchise_id);

    const tables = await Table.find({ franchiseId, isActive: true })
      .populate('currentSessionId', 'tokenNumber status paidAmount totalAmount')
      .sort({ tableNumber: 1 });

    res.json({ success: true, tables });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/tables — Create table
const createTable = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    const { tableNumber, capacity } = req.body;

    const qrSecret = signTable(franchiseId, tableNumber);
    const qrUrl = `${process.env.FRONTEND_URL || 'https://utc-cafe.vercel.app'}/order?franchise=${franchiseId}&table=${tableNumber}&sig=${qrSecret}`;

    // Generate QR as data URL using qrcode library if available
    let qrCode = qrUrl;
    try {
      const QRCode = require('qrcode');
      qrCode = await QRCode.toDataURL(qrUrl);
    } catch {
      qrCode = qrUrl; // Fallback to URL string
    }

    const table = await Table.create({
      franchiseId,
      tableNumber,
      capacity: capacity || 4,
      qrCode,
      qrSecret,
    });

    res.status(201).json({ success: true, table });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Table number already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/tables/:id — Deactivate table
const deleteTable = async (req, res) => {
  try {
    const table = await Table.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    res.json({ success: true, message: 'Table removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/tables/map — Get table map with live session data
const getTableMap = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    const tables = await Table.find({ franchiseId, isActive: true })
      .populate({
        path: 'currentSessionId',
        select: 'tokenNumber status paidAmount totalAmount subOrders mergedItems customerName',
      })
      .sort({ tableNumber: 1 });

    res.json({ success: true, tables });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/tables/verify-qr — Verify table QR signature
const verifyTableQR = async (req, res) => {
  try {
    const { franchiseId, tableNumber, sig } = req.body;
    const expected = signTable(franchiseId, tableNumber);
    if (sig !== expected) {
      return res.status(400).json({ success: false, message: 'Invalid QR code' });
    }
    const table = await Table.findOne({ franchiseId, tableNumber, isActive: true });
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    res.json({ success: true, table });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getTables, createTable, deleteTable, getTableMap, verifyTableQR };
