const Customer = require('../models/Customer');
const Loyalty = require('../models/Loyalty');
const GlobalLoyaltySetting = require('../models/GlobalLoyaltySetting');

const DEFAULT = { earningAmount: 100, earningPoints: 10, rupeesPerPoint: 0.10 };

const getGlobalSetting = async () => {
  let setting = await GlobalLoyaltySetting.findOne({ key: 'global' }).lean();
  if (!setting) setting = await GlobalLoyaltySetting.create({ key: 'global', ...DEFAULT });
  return setting;
};

const getSetting = async (req, res) => {
  try {
    const setting = await getGlobalSetting();
    res.json({ success: true, setting });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const updateSetting = async (req, res) => {
  try {
    const earningAmount = Number(req.body.earningAmount);
    const earningPoints = Number(req.body.earningPoints);
    const rupeesPerPoint = Number(req.body.rupeesPerPoint);
    if (!(earningAmount > 0) || !(earningPoints >= 0) || !(rupeesPerPoint > 0)) {
      return res.status(400).json({ success: false, message: 'Valid global loyalty ratio is required' });
    }
    const setting = await GlobalLoyaltySetting.findOneAndUpdate(
      { key: 'global' },
      { $set: { earningAmount, earningPoints, rupeesPerPoint, updatedBy: req.user._id } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, setting });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const lookupWallet = async (req, res) => {
  try {
    const phone = String(req.query.phone || req.query.mobile || '').replace(/\D/g, '').slice(-10);
    if (phone.length !== 10) return res.status(400).json({ success: false, message: 'Valid 10-digit phone number required' });
    const customer = await Customer.findOne({ phone_no: { $regex: `${phone}$` } }).lean();
    const setting = await getGlobalSetting();
    res.json({ success: true, exists: !!customer, customer, points: customer?.total_points || 0,
      pointsValue: +((customer?.total_points || 0) * setting.rupeesPerPoint).toFixed(2), setting });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const calculateEarnedPoints = (eligibleAmount, setting) =>
  Math.floor(Math.max(0, Number(eligibleAmount || 0)) / setting.earningAmount * setting.earningPoints);

const redeemAndEarn = async ({ customer, franchiseId, orderId, redemptionPoints, eligibleAmount }) => {
  const setting = await getGlobalSetting();
  const before = Number(customer.total_points || 0);
  const redeem = Math.min(Math.max(0, Number(redemptionPoints || 0)), before);
  const redemptionValue = +(redeem * setting.rupeesPerPoint).toFixed(2);
  const earned = calculateEarnedPoints(eligibleAmount, setting);
  customer.total_points = before - redeem + earned;
  await customer.save();
  if (redeem > 0) await Loyalty.create({ customer_id: customer._id, order_id: orderId, franchise_id: franchiseId,
    transaction_type: 'redeem', points_used: redeem, balance_before: before, balance_after: before - redeem,
    bill_amount: eligibleAmount, points_value: redemptionValue });
  if (earned > 0) await Loyalty.create({ customer_id: customer._id, order_id: orderId, franchise_id: franchiseId,
    transaction_type: 'earn', points_earned: earned, balance_before: before - redeem, balance_after: customer.total_points,
    bill_amount: eligibleAmount });
  return { redeem, redemptionValue, earned, balance: customer.total_points, setting };
};

module.exports = { getGlobalSetting, getSetting, updateSetting, lookupWallet, calculateEarnedPoints, redeemAndEarn };
