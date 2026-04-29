// FranchiseStaffPage.jsx
import { useEffect, useState } from 'react';
import { Plus, UserCheck, UserX, X } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const STAFF_ROLES = ['manager', 'pos_staff', 'kitchen_staff'];
const ROLE_COLORS = {
  manager: 'bg-teal-500/10 text-teal-400',
  pos_staff: 'bg-green-500/10 text-green-400',
  kitchen_staff: 'bg-orange-500/10 text-orange-400',
};

export default function FranchiseStaffPage() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'pos_staff', phone: '' });

  const load = async () => {
    setLoading(true);
    const res = await api.get('/staff');
    setStaff(res.data.staff);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/create-staff', form);
      toast.success('Staff member added');
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'pos_staff', phone: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const toggleActive = async (id) => {
    try { await api.put(`/staff/${id}/toggle`); load(); }
    catch { toast.error('Failed'); }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Team Management</h1>
          <p className="text-gray-500 text-sm mt-1">{staff.length} staff members</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Add Staff
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : staff.map((s) => (
          <div key={s._id} className={`card p-5 transition-all ${!s.isActive ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-dark-600 rounded-full flex items-center justify-center text-lg font-bold text-brand-400">
                {s.name[0].toUpperCase()}
              </div>
              <span className={`badge ${s.isActive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {s.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="font-semibold text-white mb-0.5">{s.name}</div>
            <div className="text-xs text-gray-500 mb-1">{s.email}</div>
            {s.phone && <div className="text-xs text-gray-600 mb-2">{s.phone}</div>}
            <div className="flex items-center justify-between mt-3">
              <span className={`badge ${ROLE_COLORS[s.role] || 'bg-gray-500/10 text-gray-400'}`}>
                {s.role.replace('_', ' ')}
              </span>
              <button onClick={() => toggleActive(s._id)}
                className={`p-1.5 rounded-lg transition-colors ${s.isActive ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10'}`}>
                {s.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-dark-600">
              <h2 className="font-display text-xl font-bold text-white">Add Staff Member</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {[
                { label: 'Full Name', key: 'name', type: 'text' },
                { label: 'Email', key: 'email', type: 'email' },
                { label: 'Password', key: 'password', type: 'password' },
                { label: 'Phone', key: 'phone', type: 'tel' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input className="input" type={type} required={key !== 'phone'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                </div>
              ))}
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {STAFF_ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
