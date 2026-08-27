import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const EMPTY_FORM = {
  name: '',
  color: '#f97316',
  icon: '🍽️',
  sortOrder: 0,
};

function CategoryModal({ category, onClose, onSaved }) {
  const [form, setForm] = useState(category ? {
    name: category.name || '',
    color: category.color || '#f97316',
    icon: category.icon || '🍽️',
    sortOrder: category.sortOrder || 0,
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (category?._id) {
        await api.put(`/categories/${category._id}`, form);
        toast.success('Category updated');
      } else {
        await api.post('/categories', form);
        toast.success('Category created');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-lg animate-slide-up">
        <div className="flex items-center justify-between border-b border-dark-600 p-6">
          <h2 className="font-display text-xl font-bold text-white">
            {category ? 'Edit Category' : 'Add Category'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white" type="button">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-5 p-6">
          <div>
            <label className="label">Category Name *</label>
            <input
              className="input"
              required
              maxLength={80}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Breakfast"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Icon</label>
              <input
                className="input text-center text-xl"
                maxLength={8}
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="🍽️"
              />
            </div>
            <div>
              <label className="label">Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-10 w-12 rounded-lg border border-dark-500 bg-dark-700 p-1"
                />
                <input
                  className="input flex-1"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="#f97316"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="label">Sort Order</label>
            <input
              className="input"
              type="number"
              min="0"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : category ? 'Save Changes' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/categories?all=true');
      setCategories(res.data.categories || []);
    } catch {
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (category) => {
    try {
      await api.put(`/categories/${category._id}`, {
        name: category.name,
        color: category.color,
        icon: category.icon,
        sortOrder: category.sortOrder,
        isActive: !category.isActive,
      });
      toast.success(`${category.name} ${category.isActive ? 'deactivated' : 'activated'}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update category');
    }
  };

  const remove = async (category) => {
    if (!window.confirm(`Delete category “${category.name}”?`)) return;
    try {
      await api.delete(`/categories/${category._id}`);
      toast.success('Category deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete category');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Food Categories</h1>
          <p className="mt-1 text-sm text-gray-500">Manage categories available when adding menu items.</p>
        </div>
        <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Add Category
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : categories.length === 0 ? (
        <div className="card py-16 text-center">
          <div className="mb-3 text-4xl">🍽️</div>
          <p className="text-sm text-gray-500">No categories found.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead className="border-b border-dark-600 bg-dark-700/50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Category</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Order</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category._id} className="border-b border-dark-600 last:border-0">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
                          style={{ backgroundColor: `${category.color || '#f97316'}22` }}
                        >
                          {category.icon || '🍽️'}
                        </span>
                        <div>
                          <div className="font-semibold text-white">{category.name}</div>
                          <div className="text-xs text-gray-600">{category.color || '#f97316'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`badge ${category.isActive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        {category.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-400">{category.sortOrder ?? 0}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => toggleActive(category)}
                          className="flex items-center gap-1 rounded-lg bg-dark-700 px-3 py-2 text-xs text-gray-400 hover:text-white"
                          title={category.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {category.isActive ? <ToggleRight size={16} className="text-green-400" /> : <ToggleLeft size={16} />}
                          {category.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => setModal(category)} className="btn-ghost px-3 py-2 text-xs">
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => remove(category)}
                          className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 hover:bg-red-500/20"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <CategoryModal
          category={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
