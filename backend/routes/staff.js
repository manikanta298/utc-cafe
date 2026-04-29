const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorise } = require('../middleware/auth');

// Get staff for current franchise (or all for master_admin)
router.get('/', protect, authorise('master_admin', 'franchise_owner', 'manager'), async (req, res) => {
  try {
    const filter = {};
    if (req.user.role !== 'master_admin') {
      filter.franchise_id = req.user.franchise_id._id || req.user.franchise_id;
    } else if (req.query.franchise_id) {
      filter.franchise_id = req.query.franchise_id;
    }
    const staff = await User.find(filter)
      .populate('franchise_id', 'name franchiseCode')
      .sort({ createdAt: -1 });
    res.json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Toggle active status
router.put('/:id/toggle', protect, authorise('master_admin', 'franchise_owner', 'manager'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Franchise isolation for non-master
    if (req.user.role !== 'master_admin') {
      const myFranchise = (req.user.franchise_id._id || req.user.franchise_id).toString();
      if (!user.franchise_id || user.franchise_id.toString() !== myFranchise) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }
    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update staff details
router.put('/:id', protect, authorise('master_admin', 'franchise_owner', 'manager'), async (req, res) => {
  try {
    const { name, phone, role } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, phone, role },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
