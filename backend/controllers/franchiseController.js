const Franchise = require('../models/Franchise');
const User = require('../models/User');

// @GET /api/franchises
const getFranchises = async (req, res) => {
  try {
    const franchises = await Franchise.find().populate('owner_id', 'name email').sort({ createdAt: -1 });
    res.json({ success: true, franchises });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/franchises  — Master Admin creates franchise
const createFranchise = async (req, res) => {
  try {
    const { name, location, city, state, gstin, phone, email, address } = req.body;
    const franchise = await Franchise.create({ name, location, city, state, gstin, phone, email, address });
    res.status(201).json({ success: true, franchise });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @PUT /api/franchises/:id
const updateFranchise = async (req, res) => {
  try {
    const franchise = await Franchise.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });
    res.json({ success: true, franchise });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @DELETE /api/franchises/:id
const deleteFranchise = async (req, res) => {
  try {
    const franchise = await Franchise.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });
    res.json({ success: true, message: 'Franchise deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/franchises/:id
const getFranchiseById = async (req, res) => {
  try {
    const franchise = await Franchise.findById(req.params.id).populate('owner_id', 'name email phone');
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });
    res.json({ success: true, franchise });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getFranchises, createFranchise, updateFranchise, deleteFranchise, getFranchiseById };
