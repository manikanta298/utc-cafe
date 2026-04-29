const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Franchise = require('../models/Franchise');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// @POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }
    const user = await User.findOne({ email }).populate('franchise_id', 'name state franchiseCode city');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user._id);
    res.json({
      success: true,
      token,
      user: user.toJSON(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/auth/me
const getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// @POST /api/auth/create-staff  — Franchise Owner / Master Admin creates staff
const createStaff = async (req, res) => {
  try {
    const { name, email, password, role, phone, franchise_id } = req.body;

    // Permission matrix
    const allowed = {
      master_admin: ['master_admin', 'franchise_owner', 'manager', 'pos_staff', 'kitchen_staff'],
      franchise_owner: ['manager', 'pos_staff', 'kitchen_staff'],
      manager: ['pos_staff', 'kitchen_staff'],
    };

    if (!allowed[req.user.role] || !allowed[req.user.role].includes(role)) {
      return res.status(403).json({ success: false, message: 'You cannot create this role' });
    }

    // Franchise assignment
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

module.exports = { login, getMe, createStaff, changePassword };
