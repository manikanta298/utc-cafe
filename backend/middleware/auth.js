const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorised — no token' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).populate('franchise_id', 'name state franchiseCode');
    if (!req.user || !req.user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// Role-based access control factory
const authorise = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Role '${req.user.role}' is not permitted for this action`,
    });
  }
  next();
};

// Ensure franchise data isolation:
// non-master_admin users can only access their own franchise data
const franchiseGuard = (paramName = 'franchiseId') => (req, res, next) => {
  if (req.user.role === 'master_admin') return next();
  const requestedFranchise =
    req.params[paramName] || req.body.franchise_id || req.query.franchise_id;
  if (
    requestedFranchise &&
    req.user.franchise_id &&
    requestedFranchise.toString() !== req.user.franchise_id._id.toString()
  ) {
    return res.status(403).json({ success: false, message: 'Access denied to this franchise data' });
  }
  next();
};

module.exports = { protect, authorise, franchiseGuard };
