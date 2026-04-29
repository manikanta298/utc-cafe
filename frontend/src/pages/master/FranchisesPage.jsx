import { useEffect, useState } from 'react';
import { Plus, Building2, MapPin, FileText, X } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Puducherry'];

export default function FranchisesPage() {
  const [franchises, setFranchises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', location: '', city: '', state: 'Tamil Nadu', gstin: '', phone: '', email: '', address: '' });

  const load = async () => {
    setLoading(true);
    const res = await api.get('/franchises');
    setFranchises(res.data.franchises);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', location: '', city: '', state: 'Tamil Nadu', gstin: '', phone: '', email: '', address: '' }); setShowModal(true); };
  const openEdit = (f) => { setEditing(f); setForm({ name: f.name, location: f.location, city: f.city, state: f.state, gstin: f.gstin, phone: f.phone || '', email: f.email || '', address: f.address || '' }); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/franchises/${editing._id}`, form); toast.success('Franchise updated'); }
      else { await api.post('/franchises', form); toast.success('Franchise created'); }
      setShowModal(false); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this franchise?')) return;
    await api.delete(`/franchises/${id}`);
    toast.success('Franchise deactivated'); load();
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Franchises</h1>
          <p className="text-gray-500 text-sm mt-1">{franchises.length} outlets registered</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus size={18} /> New Franchise</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : franchises.map((f) => (
          <div key={f._id} className="card-hover p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-500/15 rounded-xl flex items-center justify-center">
                  <Building2 size={20} className="text-brand-400" />
                </div>
                <div>
                  <div className="font-semibold text-white">{f.name}</div>
                  <div className="text-xs font-mono text-brand-400">{f.franchiseCode}</div>
                </div>
              </div>
              <span className={`badge ${f.isActive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {f.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="space-y-1.5 text-sm text-gray-500">
              <div className="flex items-center gap-2"><MapPin size={13} />{f.city}, {f.state}</div>
              <div className="flex items-center gap-2"><FileText size={13} />GSTIN: <span className="font-mono text-gray-400">{f.gstin}</span></div>
              {f.owner_id && <div className="text-xs text-gray-600">Owner: {f.owner_id.name}</div>}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => openEdit(f)} className="btn-ghost flex-1 py-1.5 text-xs">Edit</button>
              <button onClick={() => handleDelete(f._id)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg px-3 py-1.5 text-xs transition-colors">Deactivate</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-dark-600">
              <h2 className="font-display text-xl font-bold text-white">{editing ? 'Edit Franchise' : 'New Franchise'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="label">Franchise Name *</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="label">City *</label><input className="input" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><label className="label">State *</label>
                <select className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
                  {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className="label">Location / Area</label><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">GSTIN *</label><input className="input font-mono" required value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="27AABCU9603R1ZX" /></div>
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">Full Address</label><textarea className="input resize-none" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="col-span-2 flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">{editing ? 'Save' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
