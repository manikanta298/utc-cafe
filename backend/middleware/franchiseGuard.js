const Franchise = require('../models/Franchise');

const enforceActiveFranchise = async (req, res, next) => {
  if (!req.user || req.user.role === 'master_admin') return next();

  const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
  if (!franchiseId) return next();

  try {
    const franchise = await Franchise.findById(franchiseId).select('status isActive');
    if (!franchise) {
      return res.status(403).json({ success: false, message: 'Franchise is deactivated. Access denied.' });
    }

    const status = franchise.status || (franchise.isActive ? 'active' : 'inactive');
    if (status !== 'active') {
      return res.status(403).json({ success: false, message: 'Franchise is deactivated. Access denied.' });
    }

    req.franchise = franchise;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { enforceActiveFranchise };
