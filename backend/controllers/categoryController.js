const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const { uploadCategoryImage, deleteImage } = require('../utils/cloudinary');

const isHttpUrl = (value) => {
  if (!value) return true;
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

// Seed default categories if none exist
const seedDefaults = async () => {
  const count = await Category.countDocuments();
  if (count > 0) return;
  await Category.insertMany([
    { name: 'Beverages', icon: '☕', color: '#3b82f6', sortOrder: 1 },
    { name: 'Snacks',    icon: '🍟', color: '#f59e0b', sortOrder: 2 },
    { name: 'Meals',     icon: '🍛', color: '#10b981', sortOrder: 3 },
    { name: 'Desserts',  icon: '🍰', color: '#ec4899', sortOrder: 4 },
    { name: 'Breads',    icon: '🍞', color: '#d97706', sortOrder: 5 },
    { name: 'Specials',  icon: '⭐', color: '#8b5cf6', sortOrder: 6 },
    { name: 'Add-ons',   icon: '➕', color: '#6b7280', sortOrder: 7 },
  ]);
};

// GET /api/categories
const getCategories = async (req, res) => {
  try {
    await seedDefaults();
    const filter = req.query.all === 'true' ? {} : { isActive: true };
    const cats = await Category.find(filter).sort({ sortOrder: 1, name: 1 });
    res.json({ success: true, categories: cats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/categories
const createCategory = async (req, res) => {
  uploadCategoryImage(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ success: false, message: uploadErr.message });
    try {
      const { name, color, icon, sortOrder, image_url } = req.body;
      const categoryName = String(name || '').trim();
      const imageUrl = String(image_url || '').trim();
      if (!categoryName) return res.status(400).json({ success: false, message: 'Name required' });
      if (!isHttpUrl(imageUrl)) return res.status(400).json({ success: false, message: 'image_url must be a valid HTTP/HTTPS URL' });

      const image = req.file
        ? { url: req.file.path, public_id: req.file.filename }
        : { url: imageUrl, public_id: '' };

      const cat = await Category.create({
        name: categoryName,
        color,
        icon,
        sortOrder: Number(sortOrder) || 0,
        image,
      });
      res.status(201).json({ success: true, category: cat });
    } catch (err) {
      if (err.code === 11000) return res.status(400).json({ success: false, message: 'Category already exists' });
      res.status(500).json({ success: false, message: err.message });
    }
  });
};

// PUT /api/categories/:id
const updateCategory = async (req, res) => {
  uploadCategoryImage(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ success: false, message: uploadErr.message });
    try {
      const { name, color, icon, sortOrder, isActive, image_url, removeImage } = req.body;
      const cat = await Category.findById(req.params.id);
      if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });

      if (name !== undefined) cat.name = String(name).trim();
      if (color !== undefined) cat.color = color;
      if (icon !== undefined) cat.icon = icon;
      if (sortOrder !== undefined) cat.sortOrder = Number(sortOrder);
      if (isActive !== undefined) cat.isActive = isActive === 'true' || isActive === true;

      const imageUrl = String(image_url || '').trim();
      if (image_url !== undefined && !isHttpUrl(imageUrl)) {
        return res.status(400).json({ success: false, message: 'image_url must be a valid HTTP/HTTPS URL' });
      }

      if (req.file) {
        if (cat.image?.public_id) await deleteImage(cat.image.public_id);
        cat.image = { url: req.file.path, public_id: req.file.filename };
      } else if (image_url !== undefined && imageUrl) {
        if (cat.image?.public_id) await deleteImage(cat.image.public_id);
        cat.image = { url: imageUrl, public_id: '' };
      } else if (removeImage === 'true' || removeImage === true) {
        if (cat.image?.public_id) await deleteImage(cat.image.public_id);
        cat.image = { url: '', public_id: '' };
      }

      await cat.save();
      res.json({ success: true, category: cat });
    } catch (err) {
      if (err.code === 11000) return res.status(400).json({ success: false, message: 'Category already exists' });
      res.status(500).json({ success: false, message: err.message });
    }
  });
};

// DELETE /api/categories/:id
const deleteCategory = async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
    const inUse = await MenuItem.countDocuments({ category: cat.name });
    if (inUse > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete — ${inUse} item(s) use this category` });
    }
    if (cat.image?.public_id) await deleteImage(cat.image.public_id);
    await cat.deleteOne();
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
