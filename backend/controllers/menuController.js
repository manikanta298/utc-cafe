const MenuItem = require('../models/MenuItem');
const { uploadMenuImage, deleteImage } = require('../utils/cloudinary');

// @GET /api/menu  — All menu items (filtered by franchise availability)
const getMenu = async (req, res) => {
  try {
    const { category, franchiseId } = req.query;
    const filter = { isGlobalActive: true };
    if (category) filter.category = category;

    let items = await MenuItem.find(filter).sort({ category: 1, sortOrder: 1, name: 1 });

    // Filter out items disabled at this franchise
    const fId = franchiseId || (req.user?.franchise_id?._id || req.user?.franchise_id)?.toString();
    if (fId) {
      items = items.filter((item) => !item.disabledInFranchises.map(String).includes(fId));
    }

    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/menu/all  — Master Admin — all items including inactive
const getAllMenu = async (req, res) => {
  try {
    const filter = req.user.role === 'master_admin' ? {} : { isGlobalActive: true };
    const items = await MenuItem.find(filter).sort({ category: 1, sortOrder: 1, name: 1 });
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/menu  — Master Admin creates item
const createMenuItem = async (req, res) => {
  uploadMenuImage(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      const { name, description, category, price, gst_rate, hsn_code, isVeg,
              preparationTime, isGlobalActive, sortOrder, stock_enabled, stock_qty, unit, low_stock_threshold } = req.body;
      const imageData = req.file
        ? { url: req.file.path, public_id: req.file.filename }
        : { url: '', public_id: '' };

      const item = await MenuItem.create({
        name, description, category,
        price: Number(price),
        gst_rate: Number(gst_rate),
        hsn_code,
        image: imageData,
        isVeg: isVeg !== 'false',
        isGlobalActive: isGlobalActive === 'false' || isGlobalActive === false ? false : true,
        preparationTime: Number(preparationTime) || 10,
        sortOrder: Number(sortOrder) || 0,
        stock_enabled: stock_enabled === 'true' || stock_enabled === true,
        stock_qty: Number(stock_qty) || 0,
        unit: unit || 'pcs',
        low_stock_threshold: Number(low_stock_threshold) || 10,
      });
      res.status(201).json({ success: true, item });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
};

// @PUT /api/menu/:id  — Master Admin updates item
const updateMenuItem = async (req, res) => {
  uploadMenuImage(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      const item = await MenuItem.findById(req.params.id);
      if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

      const { name, description, category, price, gst_rate, hsn_code, isVeg,
              preparationTime, isGlobalActive, sortOrder,
              stock_enabled, stock_qty, unit, low_stock_threshold, removeImage } = req.body;

      if (name !== undefined) item.name = name;
      if (description !== undefined) item.description = description;
      if (category !== undefined) item.category = category;
      if (price !== undefined) item.price = Number(price);
      if (gst_rate !== undefined) item.gst_rate = Number(gst_rate);
      if (hsn_code !== undefined) item.hsn_code = hsn_code;
      if (isVeg !== undefined) item.isVeg = isVeg !== 'false';
      if (preparationTime !== undefined) item.preparationTime = Number(preparationTime);
      if (isGlobalActive !== undefined) item.isGlobalActive = isGlobalActive === 'true' || isGlobalActive === true;
      if (sortOrder !== undefined) item.sortOrder = Number(sortOrder);
      if (stock_enabled !== undefined) item.stock_enabled = stock_enabled === 'true' || stock_enabled === true;
      if (stock_qty !== undefined) item.stock_qty = Math.max(0, Number(stock_qty));
      if (unit !== undefined) item.unit = unit;
      if (low_stock_threshold !== undefined) item.low_stock_threshold = Number(low_stock_threshold);

      if (req.file) {
        // Delete old image from Cloudinary and replace with the new upload
        if (item.image?.public_id) await deleteImage(item.image.public_id);
        item.image = { url: req.file.path, public_id: req.file.filename };
      } else if (removeImage === 'true' || removeImage === true) {
        if (item.image?.public_id) await deleteImage(item.image.public_id);
        item.image = { url: '', public_id: '' };
      }

      await item.save();
      const io = req.app.get('io');
      if (io) { io.emit('menu:globalUpdate', { itemId: item._id, isGlobalActive: item.isGlobalActive, item }); }
      res.json({ success: true, item });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
};

// @DELETE /api/menu/:id  — Master Admin deletes item
const deleteMenuItem = async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    if (item.image?.public_id) await deleteImage(item.image.public_id);
    await item.deleteOne();
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @PUT /api/menu/:id/toggle-franchise  — Franchise owner toggles item for their outlet
const toggleFranchiseItem = async (req, res) => {
  try {
    const franchiseId = (req.user.franchise_id._id || req.user.franchise_id).toString();
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const idx = item.disabledInFranchises.map(String).indexOf(franchiseId);
    if (idx === -1) {
      item.disabledInFranchises.push(franchiseId); // disable
    } else {
      item.disabledInFranchises.splice(idx, 1); // enable
    }
    await item.save();
    const isEnabled = !item.disabledInFranchises.map(String).includes(franchiseId);
    const io = req.app.get('io');
    io.to(`franchise:${franchiseId}`).to(`pos:${franchiseId}`).emit('menu:availability', {
      itemId: item._id,
      isEnabled,
      item,
    });
    res.json({ success: true, item, isEnabled });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /menu/:id/global-toggle — master admin quick active/inactive flip
const toggleGlobalActive = async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    item.isGlobalActive = !item.isGlobalActive;
    await item.save();
    const io = req.app.get('io');
    if (io) io.emit('menu:globalUpdate', { itemId: item._id, isGlobalActive: item.isGlobalActive, item });
    res.json({ success: true, item, isGlobalActive: item.isGlobalActive });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


const bulkSyncMenu = async (req, res) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : req.body?.rows;
    if (!Array.isArray(rows)) return res.status(400).json({ success: false, message: 'Bulk menu payload must contain a rows array' });

    const normalise = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    const key = (name, category) => `${normalise(name).toLocaleLowerCase()}::${normalise(category).toLocaleLowerCase()}`;
    const allowedGst = new Set([0, 5, 12, 18, 28]);
    const errors = [];

    rows.forEach((raw, index) => {
      const line = index + 2;
      const operation = String(raw?.operation || 'UPDATE').trim().toUpperCase();
      if (!['ADD', 'UPDATE', 'DELETE'].includes(operation)) errors.push(`Row ${line}: operation must be ADD, UPDATE or DELETE.`);
      if (operation !== 'DELETE') {
        if (!normalise(raw?.name)) errors.push(`Row ${line}: name is required.`);
        if (!normalise(raw?.category)) errors.push(`Row ${line}: category is required.`);
        if (!Number.isFinite(Number(raw?.price)) || Number(raw.price) < 0) errors.push(`Row ${line}: price must be a non-negative number.`);
        if (!allowedGst.has(Number(raw?.gst_rate ?? 5))) errors.push(`Row ${line}: gst_rate must be one of 0, 5, 12, 18, 28.`);
      }
      if (operation === 'DELETE' && !raw?._id) errors.push(`Row ${line}: _id is required for DELETE.`);
      if (raw?.image_url) {
        try {
          const u = new URL(String(raw.image_url).trim());
          if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
        } catch (_) {
          errors.push(`Row ${line}: image_url must be a valid HTTP/HTTPS URL.`);
        }
      }
      ['preparationTime', 'sortOrder', 'stock_qty', 'low_stock_threshold'].forEach((field) => {
        if (operation !== 'DELETE' && (!Number.isFinite(Number(raw?.[field] ?? 0)) || Number(raw[field]) < 0)) {
          errors.push(`Row ${line}: ${field} must be a non-negative number.`);
        }
      });
    });
    if (errors.length) return res.status(400).json({ success: false, message: 'Bulk menu validation failed', errors });

    const existing = await MenuItem.find({});
    const byId = new Map(existing.map((item) => [String(item._id), item]));
    const byKey = new Map(existing.map((item) => [key(item.name, item.category), item]));
    const desiredIds = new Set();
    const counts = { added: 0, updated: 0, deleted: 0, categories: 0 };

    for (const raw of rows) {
      const operation = String(raw?.operation || 'UPDATE').trim().toUpperCase();
      if (operation === 'DELETE') {
        const item = byId.get(String(raw._id));
        if (item) {
          if (item.image?.public_id) await deleteImage(item.image.public_id);
          await item.deleteOne();
          counts.deleted++;
          byId.delete(String(raw._id));
        }
        continue;
      }

      const name = normalise(raw.name);
      const category = normalise(raw.category);
      const item = (raw._id && byId.get(String(raw._id))) || byKey.get(key(name, category));
      const imageUrl = normalise(raw.image_url);

      if (item) {
        const oldImageUrl = normalise(item.image?.url);
        if (imageUrl && imageUrl !== oldImageUrl) {
          if (item.image?.public_id) await deleteImage(item.image.public_id);
          item.image = { url: imageUrl, public_id: '' };
        }
        item.name = name;
        item.description = raw.description === undefined ? '' : String(raw.description);
        item.category = category;
        item.price = Number(raw.price);
        item.gst_rate = Number(raw.gst_rate ?? 5);
        item.hsn_code = raw.hsn_code === undefined ? '' : String(raw.hsn_code).trim();
        item.isVeg = raw.isVeg === false || String(raw.isVeg).toLowerCase() === 'false' ? false : true;
        item.preparationTime = Number(raw.preparationTime ?? 10);
        item.isGlobalActive = raw.isGlobalActive === false || String(raw.isGlobalActive).toLowerCase() === 'false' ? false : true;
        item.sortOrder = Number(raw.sortOrder ?? 0);
        item.stock_enabled = raw.stock_enabled === true || String(raw.stock_enabled).toLowerCase() === 'true';
        item.stock_qty = Math.max(0, Number(raw.stock_qty ?? 0));
        item.unit = normalise(raw.unit) || 'pcs';
        item.low_stock_threshold = Math.max(0, Number(raw.low_stock_threshold ?? 10));
        await item.save();
        counts.updated++;
        desiredIds.add(String(item._id));
        byKey.set(key(name, category), item);
      } else {
        const created = await MenuItem.create({
          name,
          description: raw.description === undefined ? '' : String(raw.description),
          category,
          price: Number(raw.price),
          gst_rate: Number(raw.gst_rate ?? 5),
          hsn_code: raw.hsn_code === undefined ? '' : String(raw.hsn_code).trim(),
          image: { url: imageUrl, public_id: '' },
          isVeg: raw.isVeg === false || String(raw.isVeg).toLowerCase() === 'false' ? false : true,
          isGlobalActive: raw.isGlobalActive === false || String(raw.isGlobalActive).toLowerCase() === 'false' ? false : true,
          preparationTime: Number(raw.preparationTime ?? 10),
          sortOrder: Number(raw.sortOrder ?? 0),
          stock_enabled: raw.stock_enabled === true || String(raw.stock_enabled).toLowerCase() === 'true',
          stock_qty: Math.max(0, Number(raw.stock_qty ?? 0)),
          unit: normalise(raw.unit) || 'pcs',
          low_stock_threshold: Math.max(0, Number(raw.low_stock_threshold ?? 10)),
        });
        counts.added++;
        desiredIds.add(String(created._id));
        byId.set(String(created._id), created);
        byKey.set(key(name, category), created);
      }
    }

    const stale = await MenuItem.find({ _id: { $nin: [...desiredIds] } });
    for (const item of stale) {
      if (item.image?.public_id) await deleteImage(item.image.public_id);
      await item.deleteOne();
      counts.deleted++;
    }

    const Category = require('../models/Category');
    const importedCategories = [...new Set(rows
      .filter((row) => String(row?.operation || 'UPDATE').trim().toUpperCase() !== 'DELETE')
      .map((row) => normalise(row?.category))
      .filter(Boolean))];
    for (const categoryName of importedCategories) {
      const existingCategory = await Category.findOne({ name: categoryName });
      if (!existingCategory) {
        await Category.create({ name: categoryName, sortOrder: 0, isActive: true });
        counts.categories++;
      } else if (!existingCategory.isActive) {
        existingCategory.isActive = true;
        await existingCategory.save();
      }
    }

    const finalItems = await MenuItem.find({}).sort({ category: 1, sortOrder: 1, name: 1 });
    const io = req.app.get('io');
    if (io) io.emit('menu:bulkSync', { items: finalItems, counts });
    return res.json({ success: true, message: 'Bulk menu synchronized successfully', counts, items: finalItems });
  } catch (err) {
    console.error('bulkSyncMenu error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Bulk menu synchronization failed' });
  }
};

module.exports = { getMenu, getAllMenu, createMenuItem, updateMenuItem, deleteMenuItem, toggleFranchiseItem, toggleGlobalActive, bulkSyncMenu };
