import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, Upload, Search, X, ToggleLeft, ToggleRight, FileSpreadsheet, Download, FileJson, AlertTriangle, Link as LinkIcon } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const GST_RATES = [0, 5, 12, 18, 28];
const STATUS_TABS = [
  { key: 'all', label: 'All Items' },
  { key: 'active', label: '✅ Active' },
  { key: 'inactive', label: '⛔ Inactive' },
];
const BULK_COLUMNS = ['_id','operation','name','description','category','price','gst_rate','hsn_code','isVeg','preparationTime','isGlobalActive','sortOrder','stock_enabled','stock_qty','unit','low_stock_threshold','image_url'];

const loadXlsx = (() => {
  let promise;
  return () => {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (promise) return promise;
    promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      script.async = true;
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('Excel library failed to initialise'));
      script.onerror = () => reject(new Error('Could not load the Excel library. Check network access and try again.'));
      document.head.appendChild(script);
    });
    return promise;
  };
})();

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'y'].includes(String(value).trim().toLowerCase());
};

const isHttpUrl = (value) => {
  if (!value) return true;
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const imageUrlToFile = async (imageUrl) => {
  const response = await fetch(imageUrl, { mode: 'cors' });
  if (!response.ok) throw new Error(`Image URL returned HTTP ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Image URL did not return an image file');
  const pathname = new URL(imageUrl).pathname;
  const extension = pathname.split('.').pop()?.split('?')[0] || 'jpg';
  return new File([blob], `menu-image-${Date.now()}.${extension}`, { type: blob.type });
};

const normaliseCategory = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const categoryKey = (value) => normaliseCategory(value).toLocaleLowerCase();

const normaliseRow = (row) => ({
  ...row,
  operation: String(row.operation || 'UPDATE').trim().toUpperCase(),
  _id: row._id ? String(row._id).trim() : '',
  name: row.name === undefined ? '' : String(row.name).trim(),
  description: row.description === undefined ? '' : String(row.description),
  category: normaliseCategory(row.category),
  price: row.price === '' || row.price === undefined ? '' : Number(row.price),
  gst_rate: row.gst_rate === '' || row.gst_rate === undefined ? 5 : Number(row.gst_rate),
  hsn_code: row.hsn_code === undefined ? '' : String(row.hsn_code).trim(),
  isVeg: toBoolean(row.isVeg, true),
  preparationTime: row.preparationTime === '' || row.preparationTime === undefined ? 10 : Number(row.preparationTime),
  isGlobalActive: toBoolean(row.isGlobalActive, true),
  sortOrder: row.sortOrder === '' || row.sortOrder === undefined ? 0 : Number(row.sortOrder),
  stock_enabled: toBoolean(row.stock_enabled, false),
  stock_qty: row.stock_qty === '' || row.stock_qty === undefined ? 0 : Number(row.stock_qty),
  unit: row.unit === undefined || row.unit === '' ? 'pcs' : String(row.unit).trim(),
  low_stock_threshold: row.low_stock_threshold === '' || row.low_stock_threshold === undefined ? 10 : Number(row.low_stock_threshold),
  image_url: row.image_url === undefined ? '' : String(row.image_url).trim(),
});

const buildCategoryMap = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    const name = normaliseCategory(row.category);
    const key = categoryKey(name);
    if (!name || map.has(key)) return;
    map.set(key, { key, name, rows: 0 });
  });
  rows.forEach((row) => {
    const key = categoryKey(row.category);
    if (key && map.has(key)) map.get(key).rows += 1;
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const validateRows = (rawRows) => {
  const errors = [];
  const rows = rawRows.map(normaliseRow);
  const seenIds = new Map();
  rows.forEach((row, index) => {
    const line = index + 2;
    if (!['ADD', 'UPDATE', 'DELETE'].includes(row.operation)) errors.push(`Row ${line}: operation must be ADD, UPDATE or DELETE.`);
    if (row.operation !== 'DELETE' && !row.name) errors.push(`Row ${line}: name is required.`);
    if (row.operation !== 'DELETE' && !row.category) errors.push(`Row ${line}: category is required.`);
    if (row.operation !== 'DELETE' && (!Number.isFinite(row.price) || row.price < 0)) errors.push(`Row ${line}: price must be a non-negative number.`);
    if (row.operation !== 'DELETE' && !GST_RATES.includes(row.gst_rate)) errors.push(`Row ${line}: gst_rate must be one of ${GST_RATES.join(', ')}.`);
    if (row.operation !== 'DELETE' && row.image_url && !isHttpUrl(row.image_url)) errors.push(`Row ${line}: image_url must be a valid HTTP/HTTPS URL.`);
    if (row.operation !== 'ADD' && !row._id) errors.push(`Row ${line}: _id is required for ${row.operation}.`);
    if (row.operation === 'ADD' && row._id) errors.push(`Row ${line}: remove _id for ADD; the server will create it.`);
    if (row._id) {
      if (seenIds.has(row._id)) errors.push(`Row ${line}: duplicate _id; first used on row ${seenIds.get(row._id)}.`);
      else seenIds.set(row._id, line);
    }
    ['preparationTime', 'sortOrder', 'stock_qty', 'low_stock_threshold'].forEach((key) => {
      if (row.operation !== 'DELETE' && (!Number.isFinite(row[key]) || row[key] < 0)) errors.push(`Row ${line}: ${key} must be a non-negative number.`);
    });
  });
  return { rows, errors, categories: buildCategoryMap(rows) };
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const serialiseItem = (item) => ({
  _id: item._id,
  operation: 'UPDATE',
  name: item.name,
  description: item.description || '',
  category: normaliseCategory(item.category),
  price: item.price,
  gst_rate: item.gst_rate,
  hsn_code: item.hsn_code || '',
  isVeg: item.isVeg !== false,
  preparationTime: item.preparationTime ?? 10,
  isGlobalActive: item.isGlobalActive !== false,
  sortOrder: item.sortOrder ?? 0,
  stock_enabled: item.stock_enabled === true,
  stock_qty: item.stock_qty ?? 0,
  unit: item.unit || 'pcs',
  low_stock_threshold: item.low_stock_threshold ?? 10,
  image_url: item.image?.url || '',
});

const exportJson = (items) => {
  downloadBlob(new Blob([JSON.stringify(items.map(serialiseItem), null, 2)], { type: 'application/json' }), `utc-cafe-menu-${new Date().toISOString().slice(0, 10)}.json`);
};

const exportExcel = async (items) => {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.json_to_sheet(items.map(serialiseItem), { header: BULK_COLUMNS });
  ws['!cols'] = BULK_COLUMNS.map((key) => ({ wch: Math.max(12, key.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Menu');
  XLSX.writeFile(wb, `utc-cafe-menu-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

const ItemModal = ({ item, categories, onClose, onSaved }) => {
  const isEdit = !!item?._id;
  const [form, setForm] = useState({ name: item?.name || '', description: item?.description || '', category: item?.category || '', price: item?.price || '', gst_rate: item?.gst_rate ?? 5, hsn_code: item?.hsn_code || '', isVeg: item?.isVeg !== false, preparationTime: item?.preparationTime || 10, isGlobalActive: item?.isGlobalActive !== false, sortOrder: item?.sortOrder || 0, stock_enabled: item?.stock_enabled === true, stock_qty: item?.stock_qty || 0, unit: item?.unit || 'pcs', low_stock_threshold: item?.low_stock_threshold || 10 });
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(item?.image?.url || '');
  const [imagePreview, setImagePreview] = useState(item?.image?.url || '');
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const handleImage = (e) => { const file = e.target.files?.[0]; if (!file) return; setRemoveImage(false); setImageFile(file); setImageUrl(''); setImagePreview(URL.createObjectURL(file)); };
  const handleImageUrl = (e) => { const value = e.target.value; setRemoveImage(false); setImageFile(null); setImageUrl(value); setImagePreview(value); };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.category) return toast.error('Please select a category');
    if (imageUrl && !isHttpUrl(imageUrl)) return toast.error('Please enter a valid HTTP/HTTPS image URL');
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([key, value]) => fd.append(key, value));
      if (imageFile) fd.append('image', imageFile);
      else if (imageUrl && imageUrl !== item?.image?.url) fd.append('image', await imageUrlToFile(imageUrl));
      if (removeImage) fd.append('removeImage', 'true');
      if (isEdit) await api.put(`/menu/${item._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      else await api.post('/menu', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(isEdit ? 'Item updated' : 'Item created');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.message || err.message || 'Error saving item'); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="card w-full max-w-2xl max-h-[92vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-dark-600"><h2 className="font-display text-xl font-bold text-white">{isEdit ? 'Edit Item' : 'Add Menu Item'}</h2><button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div><label className="label">Item Image (Cloudinary)</label><div className="flex gap-4 items-start"><div className="w-24 h-24 bg-dark-700 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0">{imagePreview ? <img src={imagePreview} alt="preview" className="w-full h-full object-cover" /> : <Upload size={24} className="text-gray-600" />}</div><div className="flex-1 space-y-2"><div className="flex flex-wrap gap-2"><label className="btn-ghost text-sm cursor-pointer inline-flex items-center gap-2"><Upload size={16} /> Upload File<input type="file" accept="image/*" className="hidden" onChange={handleImage} /></label>{isEdit && imagePreview && <button type="button" onClick={() => { setImageFile(null); setImageUrl(''); setImagePreview(''); setRemoveImage(true); }} className="btn-ghost text-sm inline-flex items-center gap-2 text-red-400"><Trash2 size={16} /> Remove Image</button>}</div><div className="flex items-center gap-2"><LinkIcon size={16} className="text-gray-500"/><input className="input" placeholder="Paste Cloudinary image URL" value={imageUrl} onChange={handleImageUrl} /></div><p className="text-xs text-gray-600">Upload a JPG/PNG/WEBP file or paste an HTTP/HTTPS image URL. URL images are sent through the existing backend Cloudinary upload flow.</p></div></div></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="label">Item Name *</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">Description</label><textarea className="input resize-none" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><label className="label">Category *</label><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required><option value="">Select category</option>{categories.map((c) => <option key={c.key} value={c.name}>{c.name}</option>)}</select></div>
            <div><label className="label">Price (₹) *</label><input className="input" type="number" min="0" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div><label className="label">GST Rate (%)</label><select className="input" value={form.gst_rate} onChange={(e) => setForm({ ...form, gst_rate: Number(e.target.value) })}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></div>
            <div><label className="label">HSN Code</label><input className="input" value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} /></div>
            <div><label className="label">Prep Time (min)</label><input className="input" type="number" min="0" value={form.preparationTime} onChange={(e) => setForm({ ...form, preparationTime: Number(e.target.value) })} /></div>
            <div><label className="label">Sort Order</label><input className="input" type="number" min="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></div>
            <div><label className="label">Unit</label><input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            <div><label className="label">Stock Qty</label><input className="input" type="number" min="0" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: Number(e.target.value) })} /></div>
            <div><label className="label">Low Stock Threshold</label><input className="input" type="number" min="0" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })} /></div>
          </div>
          <div className="flex gap-6 flex-wrap"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.isVeg} onChange={(e) => setForm({ ...form, isVeg: e.target.checked })} /><span className="text-sm text-gray-300">🌿 Vegetarian</span></label><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.isGlobalActive} onChange={(e) => setForm({ ...form, isGlobalActive: e.target.checked })} /><span className="text-sm text-gray-300">Active (show on POS)</span></label><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.stock_enabled} onChange={(e) => setForm({ ...form, stock_enabled: e.target.checked })} /><span className="text-sm text-gray-300">Stock enabled</span></label></div>
          <div className="flex gap-3 pt-2"><button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button><button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : isEdit ? 'Update Item' : 'Create Item'}</button></div>
        </form>
      </div>
    </div>
  );
};

const BulkMenuModal = ({ items, onClose, onComplete }) => {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const readFile = async (file) => {
    if (!file) return;
    try {
      const extension = file.name.toLowerCase().split('.').pop();
      let rawRows;
      if (extension === 'json') rawRows = JSON.parse(await file.text());
      else {
        const XLSX = await loadXlsx();
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      }
      if (!Array.isArray(rawRows)) throw new Error('Import must contain an array of menu rows');
      const result = validateRows(rawRows);
      const existingMap = new Map(items.map((item) => [item._id, item]));
      const categoryMap = new Map(result.categories.map((category) => [category.key, category]));
      result.categories = result.categories.map((category) => ({ ...category, existingItems: items.filter((item) => categoryKey(item.category) === category.key).length, status: items.some((item) => categoryKey(item.category) === category.key) ? 'existing' : 'new' }));
      result.rows = result.rows.map((row) => ({ ...row, currentItem: row._id ? existingMap.get(row._id) : null, categoryStatus: row.category ? (categoryMap.get(categoryKey(row.category))?.status || 'new') : 'missing' }));
      setPreview(result);
    } catch (err) { toast.error(err.message || 'Could not read import file'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const apply = async () => {
    if (!preview || preview.errors.length) return;
    setBusy(true);
    const results = { added: 0, updated: 0, deleted: 0, failed: [] };
    for (const row of preview.rows) {
      try {
        if (row.operation === 'DELETE') { await api.delete(`/menu/${row._id}`); results.deleted += 1; continue; }
        const fd = new FormData();
        ['name','description','category','price','gst_rate','hsn_code','isVeg','preparationTime','isGlobalActive','sortOrder','stock_enabled','stock_qty','unit','low_stock_threshold'].forEach((key) => fd.append(key, row[key]));
        if (row.image_url) {
          if (row.operation === 'UPDATE' && row.currentItem?.image?.url === row.image_url) {
            // Preserve the current Cloudinary image without re-uploading it.
          } else {
            fd.append('image', await imageUrlToFile(row.image_url));
          }
        }
        if (row.operation === 'ADD') { await api.post('/menu', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); results.added += 1; }
        else { await api.put(`/menu/${row._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); results.updated += 1; }
      } catch (err) { results.failed.push({ row, message: err.response?.data?.message || err.message || 'Request failed' }); }
    }
    if (results.failed.length) toast.error(`${results.failed.length} row(s) failed. Successful rows were saved.`);
    else toast.success(`Bulk update complete: ${results.added} added, ${results.updated} updated, ${results.deleted} deleted.`);
    await onComplete();
    setPreview({ ...preview, result: results });
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="card w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-dark-600"><div><h2 className="font-display text-xl font-bold text-white">Bulk Menu Import</h2><p className="text-xs text-gray-500 mt-1">Excel (.xlsx/.xls) or JSON · use operation ADD, UPDATE, or DELETE</p></div><button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button></div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="rounded-xl border border-dark-500 bg-dark-800/60 p-4 text-sm text-gray-400"><p className="font-semibold text-gray-200 mb-2">Import rules</p><ul className="list-disc pl-5 space-y-1"><li>UPDATE and DELETE require the existing <code>_id</code>.</li><li>ADD must leave <code>_id</code> blank. The optional <code>image_url</code> is fetched and uploaded through the existing Cloudinary backend flow.</li><li>For UPDATE, unchanged <code>image_url</code> values are preserved without re-uploading.</li><li>Categories are derived from imported menu rows after normalization; a new category automatically becomes a dynamic filter after the saved menu reloads.</li><li>Rows are validated before any request is sent.</li><li>Existing backend authorization remains in force: only Master Admin can create, update, or delete.</li></ul></div>
          <div className="flex flex-wrap gap-2"><button onClick={() => exportExcel(items).catch((err) => toast.error(err.message))} className="btn-ghost inline-flex items-center gap-2"><Download size={16}/> Download Excel</button><button onClick={() => exportJson(items)} className="btn-ghost inline-flex items-center gap-2"><FileJson size={16}/> Download JSON</button><button onClick={() => fileRef.current?.click()} className="btn-primary inline-flex items-center gap-2"><Upload size={16}/> Select Excel / JSON</button><input ref={fileRef} type="file" accept=".xlsx,.xls,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} /></div>
          {preview?.categories?.length > 0 && <div className="rounded-xl border border-dark-500 bg-dark-800/70 p-4"><div className="flex items-center justify-between mb-3"><div><p className="font-semibold text-gray-200">Dynamic Category Mapping</p><p className="text-xs text-gray-500 mt-1">Normalized categories detected from this import. Existing and new categories are identified before changes are applied.</p></div><span className="text-xs text-gray-500">{preview.categories.length} categories</span></div><div className="flex flex-wrap gap-2">{preview.categories.map((category) => <span key={category.key} className={`px-3 py-1.5 rounded-lg text-xs border ${category.status === 'new' ? 'border-brand-500/30 bg-brand-500/10 text-brand-300' : 'border-dark-500 bg-dark-700 text-gray-300'}`}>{category.name} · {category.rows} row{category.rows === 1 ? '' : 's'} · {category.status === 'new' ? 'NEW' : `${category.existingItems} existing`}</span>)}</div></div>}
          <div className="overflow-auto rounded-xl border border-dark-600">{preview ? <table className="w-full text-xs"><thead className="bg-dark-700 text-gray-400"><tr><th className="p-2 text-left">Row</th><th className="p-2 text-left">Operation</th><th className="p-2 text-left">ID</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Category</th><th className="p-2 text-right">Price</th><th className="p-2 text-left">Image URL</th></tr></thead><tbody>{preview.rows.slice(0, 100).map((row, i) => <tr key={`${row._id}-${i}`} className="border-t border-dark-700"><td className="p-2">{i + 2}</td><td className="p-2">{row.operation}</td><td className="p-2 font-mono">{row._id || 'new'}</td><td className="p-2">{row.name}</td><td className="p-2">{row.category} <span className="ml-1 text-[10px] text-gray-600">{row.categoryStatus}</span></td><td className="p-2 text-right">{row.price}</td><td className="p-2 max-w-xs truncate" title={row.image_url}>{row.image_url || '—'}</td></tr>)}</tbody></table> : <div className="p-10 text-center text-gray-500">Choose a file to validate its rows.</div>}</div>
          {preview?.errors?.length > 0 && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4"><div className="flex gap-2 text-red-300 font-semibold"><AlertTriangle size={17}/> Validation errors</div><ul className="mt-2 list-disc pl-5 text-xs text-red-300 space-y-1 max-h-40 overflow-auto">{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
          {preview?.result && <div className="rounded-xl border border-dark-500 bg-dark-800 p-4 text-sm text-gray-300">Saved: {preview.result.added} added · {preview.result.updated} updated · {preview.result.deleted} deleted · {preview.result.failed.length} failed.</div>}
        </div>
        <div className="p-5 border-t border-dark-600 flex gap-3"><button onClick={onClose} className="btn-ghost flex-1">Close</button><button onClick={apply} disabled={busy || !preview || preview.errors.length > 0 || !preview.rows.length} className="btn-primary flex-1">{busy ? 'Applying...' : 'Apply Validated Changes'}</button></div>
      </div>
    </div>
  );
};

export default function MasterMenuPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [modal, setModal] = useState(null);
  const [toggling, setToggling] = useState(null);
  const searchTimer = useRef(null);
  const load = useCallback(async () => { setLoading(true); try { const res = await api.get('/menu/all'); setItems(res.data.items || []); } catch { toast.error('Failed to load menu'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); return () => clearTimeout(searchTimer.current); }, [load]);
  const categories = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      const name = normaliseCategory(item.category);
      const key = categoryKey(name);
      if (name && !map.has(key)) map.set(key, { key, name });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);
  const handleDelete = useCallback(async (id) => { if (!confirm('Delete this item?')) return; try { await api.delete(`/menu/${id}`); toast.success('Item deleted'); await load(); } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); } }, [load]);
  const handleGlobalToggle = useCallback(async (item) => { setToggling(item._id); try { const res = await api.patch(`/menu/${item._id}/global-toggle`); toast.success(`${item.name} → ${res.data.isGlobalActive ? '✅ Active' : '⛔ Inactive'}`); await load(); } catch (err) { toast.error(err.response?.data?.message || 'Toggle failed'); } finally { setToggling(null); } }, [load]);
  const counts = useMemo(() => ({ all: items.length, active: items.filter((i) => i.isGlobalActive).length, inactive: items.filter((i) => !i.isGlobalActive).length }), [items]);
  const filtered = useMemo(() => items.filter((i) => { const needle = debouncedSearch.toLowerCase(); const itemCategoryKey = categoryKey(i.category); return (!needle || i.name.toLowerCase().includes(needle)) && (!catFilter || itemCategoryKey === catFilter) && (statusTab === 'all' || (statusTab === 'active' ? i.isGlobalActive : !i.isGlobalActive)); }), [items, debouncedSearch, catFilter, statusTab]);
  const handleSearchChange = (e) => { const value = e.target.value; setSearch(value); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => setDebouncedSearch(value), 250); };
  useEffect(() => { if (catFilter && !categories.some((category) => category.key === catFilter)) setCatFilter(''); }, [categories, catFilter]);
  return (
    <div className="animate-fade-in">
      <div className="page-header"><div><h1 className="section-title">Menu Management</h1><p className="text-gray-500 text-sm mt-1">{counts.active} active · {counts.inactive} inactive · {counts.all} total</p></div><div className="flex gap-2 flex-wrap"><button onClick={() => setModal('bulk')} className="btn-ghost flex items-center gap-2"><FileSpreadsheet size={18}/> Bulk Excel / JSON</button><button onClick={() => setModal('new')} className="btn-primary flex items-center gap-2"><Plus size={18}/> Add Item</button></div></div>
      <div className="flex gap-2 flex-wrap mb-4">{STATUS_TABS.map(({ key, label }) => <button key={key} onClick={() => setStatusTab(key)} className={`px-4 py-1.5 rounded-full text-xs font-semibold border ${statusTab === key ? 'bg-brand-500 border-brand-500 text-white' : 'bg-dark-700 border-dark-500 text-gray-400 hover:text-white'}`}>{label}<span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${statusTab === key ? 'bg-white/20' : 'bg-dark-600'}`}>{counts[key]}</span></button>)}</div>
      <div className="flex flex-wrap gap-3 mb-6 items-center"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/><input className="input pl-9 w-56" placeholder="Search items..." value={search} onChange={handleSearchChange}/></div><div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Categories</span><button onClick={() => setCatFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${catFilter === '' ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-500 hover:text-white'}`}>All</button>{categories.map((category) => <button key={category.key} onClick={() => setCatFilter(category.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${catFilter === category.key ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-500 hover:text-white'}`}>{category.name}</button>)}</div></div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/></div> : filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-20 text-center"><div className="text-4xl mb-3">🍽️</div><p className="text-gray-500 text-sm">No items match this filter</p><button onClick={() => { setStatusTab('all'); setCatFilter(''); setSearch(''); setDebouncedSearch(''); }} className="mt-3 text-xs text-brand-400 hover:underline">Clear filters</button></div> : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{filtered.map((item) => <div key={item._id} className={`card-hover overflow-hidden group ${!item.isGlobalActive ? 'opacity-60' : ''}`}><div className="h-40 bg-dark-700 relative overflow-hidden">{item.image?.url ? <img src={item.image.url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/> : <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>}<div className="absolute top-2 left-2"><span className={`px-2 py-1 rounded-full text-[10px] font-bold ${item.isGlobalActive ? 'bg-green-500/90 text-white' : 'bg-gray-700 text-gray-300'}`}>{item.isGlobalActive ? 'ACTIVE' : 'INACTIVE'}</span></div><div className="absolute top-2 right-2"><span className={`px-2 py-1 rounded-full text-[10px] ${item.isVeg ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}>{item.isVeg ? 'VEG' : 'NON-VEG'}</span></div></div><div className="p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold text-white">{item.name}</h3><p className="text-xs text-gray-500 mt-1">{item.category}</p></div><span className="font-bold text-brand-400">₹{Number(item.price || 0).toFixed(2)}</span></div>{item.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{item.description}</p>}<div className="flex items-center justify-between mt-4 pt-3 border-t border-dark-600"><button onClick={() => handleGlobalToggle(item)} disabled={toggling === item._id} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">{item.isGlobalActive ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>} {toggling === item._id ? 'Saving...' : item.isGlobalActive ? 'Disable' : 'Enable'}</button><div className="flex gap-1"><button onClick={() => setModal(item)} className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-dark-600"><Pencil size={15}/></button><button onClick={() => handleDelete(item._id)} className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-dark-600"><Trash2 size={15}/></button></div></div></div></div>)}</div>}
      {modal === 'bulk' && <BulkMenuModal items={items} onClose={() => setModal(null)} onComplete={load}/>} 
      {modal && modal !== 'bulk' && <ItemModal item={modal === 'new' ? null : modal} categories={categories} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await load(); }}/>} 
    </div>
  );
}