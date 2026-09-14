import { useEffect, useState } from 'react';
import { Star, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function LoyaltySettingsPage() {
  const [form, setForm] = useState({ earningAmount: 100, earningPoints: 10, rupeesPerPoint: 0.10 });
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/loyalty/settings').then(r => setForm({ ...form, ...(r.data.setting || {}) })).catch(e => toast.error(e.response?.data?.message || 'Could not load loyalty settings')).finally(() => setLoading(false)); }, []);
  const save = async () => { setSaving(true); try { const r = await api.put('/loyalty/settings', form); setForm(r.data.setting); toast.success('Global loyalty rule saved for all franchises'); } catch(e) { toast.error(e.response?.data?.message || 'Save failed'); } finally { setSaving(false); } };
  if (loading) return <div className="p-8 text-gray-500">Loading loyalty settings…</div>;
  return <div className="max-w-2xl space-y-5 animate-fade-in"><div><h1 className="section-title flex items-center gap-2"><Star className="text-brand-400" size={22}/> Global Loyalty Rewards</h1><p className="text-gray-500 text-sm mt-1">One rule applies to every franchise. Franchise users cannot override it.</p></div>
    <div className="card p-6 space-y-5"><div className="grid grid-cols-2 gap-4"><label className="text-sm text-gray-300">Spend amount (₹)<input type="number" min="0.01" step="0.01" value={form.earningAmount} onChange={e=>setForm({...form,earningAmount:e.target.value})} className="input mt-2 w-full"/></label><label className="text-sm text-gray-300">Points earned<input type="number" min="0" step="1" value={form.earningPoints} onChange={e=>setForm({...form,earningPoints:e.target.value})} className="input mt-2 w-full"/></label></div>
      <label className="text-sm text-gray-300 block">1 point redemption value (₹)<input type="number" min="0.0001" step="0.01" value={form.rupeesPerPoint} onChange={e=>setForm({...form,rupeesPerPoint:e.target.value})} className="input mt-2 w-full"/></label>
      <div className="rounded-xl bg-brand-500/10 border border-brand-500/20 p-4 text-sm text-gray-300">Example: spending <b>₹{Number(form.earningAmount||0).toFixed(2)}</b> earns <b>{Number(form.earningPoints||0)} points</b>; <b>1 point = ₹{Number(form.rupeesPerPoint||0).toFixed(2)}</b>.</div>
      <button onClick={save} disabled={saving} className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center justify-center gap-2"><Save size={16}/>{saving?'Saving…':'Save Global Loyalty Rule'}</button>
    </div></div>;
}
