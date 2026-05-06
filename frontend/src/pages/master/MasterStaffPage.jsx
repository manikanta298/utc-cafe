// ── MasterStaffPage.jsx ──────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Plus, UserCheck, UserX, X } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const ROLES = ['franchise_owner', 'manager', 'pos_staff', 'kitchen_staff'];
const ROLE_LABELS = {
  master_admin: 'Master Admin',
  franchise_owner: 'Franchise Owner',
  manager: 'Manager',
  pos_staff: 'Shift Operator',
  shift_operator: 'Shift Operator',
  kitchen_staff: 'Kitchen Staff',
};
const ROLE_COLORS = {
  master_admin: 'bg-purple-500/10 text-purple-400',
  franchise_owner: 'bg-blue-500/10 text-blue-400',
  manager: 'bg-teal-500/10 text-teal-400',
  pos_staff: 'bg-green-500/10 text-green-400',
  kitchen_staff: 'bg-orange-500/10 text-orange-400',
};

export function MasterStaffPage() {
  const [staff, setStaff] = useState([]);
  const [franchises, setFranchises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'pos_staff', phone: '', franchise_id: '' });

  const load = async () => {
    setLoading(true);
    const [s, f] = await Promise.all([api.get('/staff'), api.get('/franchises')]);
    setStaff(s.data.staff);
    setFranchises(f.data.franchises);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/create-staff', form);
      toast.success('Staff created');
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'pos_staff', phone: '', franchise_id: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error'); }
  };

  const toggleActive = async (id) => {
    try {
      await api.put(`/staff/${id}/toggle`);
      toast.success('Status updated');
      load();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Staff Management</h1>
          <p className="text-gray-500 text-sm mt-1">{staff.length} team members</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Add Staff
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-700/50">
              <tr>{['Name', 'Email', 'Role', 'Franchise', 'Status', 'Actions'].map(h => <th key={h} className="table-head">{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-600">Loading...</td></tr>
              ) : staff.map((s) => (
                <tr key={s._id} className="table-row">
                  <td className="table-cell font-medium text-white">{s.name}</td>
                  <td className="table-cell text-gray-500">{s.email}</td>
                  <td className="table-cell"><span className={`badge ${ROLE_COLORS[s.role]}`}>{ROLE_LABELS[s.role] || s.role.replace('_', ' ')}</span></td>
                  <td className="table-cell">{s.franchise_id?.name || '—'}</td>
                  <td className="table-cell">
                    <span className={`badge ${s.isActive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <button onClick={() => toggleActive(s._id)}
                      className={`p-1.5 rounded-lg transition-colors ${s.isActive ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10'}`}>
                      {s.isActive ? <UserX size={16} /> : <UserCheck size={16} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-dark-600">
              <h2 className="font-display text-xl font-bold text-white">Create Staff Account</h2>
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
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Franchise</label>
                <select className="input" value={form.franchise_id} onChange={(e) => setForm({ ...form, franchise_id: e.target.value })}>
                  <option value="">Select franchise</option>
                  {franchises.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
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

export default MasterStaffPage;
