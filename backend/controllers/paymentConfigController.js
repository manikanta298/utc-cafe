const FranchisePayment = require('../models/FranchisePayment');
const { logAudit } = require('../utils/auditHelper');

// GET /api/payment-config/:franchiseId
const getPaymentConfig = async (req, res) => {
  try {
    const config = await FranchisePayment.findOne({ franchiseId: req.params.franchiseId });
    res.json({ success: true, config: config || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/payment-config/:franchiseId
const savePaymentConfig = async (req, res) => {
  try {
    const { bankAccountName, bankAccountNumber, ifscCode, upiId, upiQrImageUrl, acceptedMethods } = req.body;
    const config = await FranchisePayment.findOneAndUpdate(
      { franchiseId: req.params.franchiseId },
      { bankAccountName, bankAccountNumber, ifscCode, upiId, upiQrImageUrl, acceptedMethods, updatedBy: req.user._id },
      { upsert: true, new: true }
    );
    await logAudit('PAYMENT_CONFIG_UPDATED', req, config._id, 'FranchisePayment', { franchiseId: req.params.franchiseId });
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/payment-config/:franchiseId/qr — Generate UPI QR for payment
const generatePaymentQR = async (req, res) => {
  try {
    const { amount } = req.query;
    const config = await FranchisePayment.findOne({ franchiseId: req.params.franchiseId })
      .populate('franchiseId', 'name');

    if (!config || !config.upiId) {
      return res.status(404).json({ success: false, message: 'UPI not configured for this franchise' });
    }

    const upiLink = `upi://pay?pa=${config.upiId}&pn=${encodeURIComponent(config.franchiseId?.name || 'UTC Cafe')}&am=${amount || ''}&cu=INR`;

    let qrDataUrl = upiLink;
    try {
      const QRCode = require('qrcode');
      qrDataUrl = await QRCode.toDataURL(upiLink);
    } catch {
      qrDataUrl = upiLink;
    }

    res.json({
      success: true,
      qr: qrDataUrl,
      upiId: config.upiId,
      amount: amount || '',
      franchiseName: config.franchiseId?.name || '',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getPaymentConfig, savePaymentConfig, generatePaymentQR };
