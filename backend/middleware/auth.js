const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { checkRole } = require('./rbac');

const parseCookies = (cookieHeader = '') =>
  cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return acc;
      const key = part.slice(0, separator).trim();
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      acc[key] = value;
      return acc;
    }, {});

const getBearerToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

// Verify JWT access token
const protect = async (req, res, next) => {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorised - no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).populate('franchise_id', 'name state franchiseCode city status isActive');

    if (!req.user || !req.user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const authorise = (...roles) => checkRole(...roles);

// Refresh token guard for /auth/refresh
const protectRefreshToken = (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  const refreshToken = cookies.utc_refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'Refresh token missing' });
  }

  try {
    req.refreshTokenPayload = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
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

module.exports = { protect, authorise, franchiseGuard, protectRefreshToken };
