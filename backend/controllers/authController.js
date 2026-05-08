const { validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  signAccessToken,
  signRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} = require('../utils/tokenService');

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return null;
  return res.status(400).json({
    success: false,
    message: errors.array()[0].msg,
    errors: errors.array(),
  });
};

const withUserFranchise = 'name state franchiseCode city status isActive';

// @POST /api/auth/login
const login = async (req, res) => {
  try {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) return validationResponse;

    const { email, password } = req.body;
    const user = await User.findOne({ email }).populate('franchise_id', withUserFranchise);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.franchise_id) {
      const franchiseStatus = user.franchise_id.status || (user.franchise_id.isActive ? 'active' : 'inactive');
      if (franchiseStatus !== 'active') {
        return res.status(403).json({ success: false, message: 'Franchise is deactivated. Access denied.' });
      }
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);
    setRefreshTokenCookie(res, refreshToken);

    res.json({
      success: true,
      token,
      user: user.toJSON(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/auth/refresh
const refresh = async (req, res) => {
  try {
    const user = await User.findById(req.refreshTokenPayload.id).populate('franchise_id', withUserFranchise);
    if (!user || !user.isActive) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({ success: false, message: 'User not found or deactivated' });
    }

    if (user.franchise_id) {
      const franchiseStatus = user.franchise_id.status || (user.franchise_id.isActive ? 'active' : 'inactive');
      if (franchiseStatus !== 'active') {
        clearRefreshTokenCookie(res);
        return res.status(403).json({ success: false, message: 'Franchise is deactivated. Access denied.' });
      }
    }

    const token = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);
    setRefreshTokenCookie(res, refreshToken);

    res.json({ success: true, token, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/auth/logout
const logout = async (req, res) => {
  clearRefreshTokenCookie(res);
  res.json({ success: true, message: 'Logged out' });
};

// @GET /api/auth/me
const getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// @POST /api/auth/create-staff
const createStaff = async (req, res) => {
  try {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) return validationResponse;

    const { name, email, password, role, phone, franchise_id } = req.body;

    const allowed = {
      master_admin: ['master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator', 'kitchen_staff'],
      franchise_owner: ['manager', 'pos_staff', 'shift_operator', 'kitchen_staff'],
      manager: ['pos_staff', 'shift_operator', 'kitchen_staff'],
    };

    if (!allowed[req.user.role] || !allowed[req.user.role].includes(role)) {
      return res.status(403).json({ success: false, message: 'You cannot create this role' });
    }

    let assignedFranchise = franchise_id;
    if (req.user.role !== 'master_admin') {
      assignedFranchise = req.user.franchise_id._id || req.user.franchise_id;
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ success: false, message: 'Email already in use' });

    const user = await User.create({
      name,
      email,
      password,
      role,
      phone,
      franchise_id: role === 'master_admin' ? null : assignedFranchise,
    });

    res.status(201).json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @PUT /api/auth/change-password
const changePassword = async (req, res) => {
  try {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) return validationResponse;

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Current password incorrect' });

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { login, refresh, logout, getMe, createStaff, changePassword };
