import { useState, useEffect } from 'react';
import { X, Banknote, CreditCard, Smartphone, Wallet, Plus, CheckCircle2, Loader2, IndianRupee, AlertCircle, Star } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const METHODS = [
  { id: 'Cash', label: 'Cash', Icon: Banknote }, { id: 'UPI', label: 'UPI', Icon: Smartphone }, { id: 'Card', label: 'Card', Icon: CreditCard }, { id: 'Net Banking', label: 'Net Banking', Icon: CreditCard }, { id: 'Loyalty Points', label: 'Loyalty', Icon: Star },
];
const fmt = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SplitPaymentModal({ sessionId, totalAmount, franchiseId, onSuccess, onClose }) {
  const [entries, setEntries] = useState([]); const [paidTotal, setPaidTotal] = useState(0); const [method, setMethod] = useState('Cash'); const [amount, setAmount] = useState(''); const [reference, setReference] = useState(''); const [adding, setAdding] = useState(false); const [done, setDone] = useState(false); const [upiQr, setUpiQr] = useState(null); const [upiLoading, setUpiLoading] = useState(false); const [loyalty, setLoyalty] = useState({ points: 0, pointsValue: 0 });
  const API = import.meta.env.VITE_API_URL || 'https://utc-cafe.onrender.com/api';

  const loadLoyalty = async () => { try { const r = await api.get(`/loyalty/wallet?phone=${encodeURIComponent('')}`); if (r.data?.points) setLoyalty({ points: r.data.points, pointsValue: r.data.pointsValue }); } catch {} };
  useEffect(() => { if (!sessionId) return; api.get(`/sessions/${sessionId}`).then(async r => { const s = r.data.session || r.data; setPaidTotal(s.paidAmount || 0); if (s.customerMobile) { try { const w = await api.get(`/loyalty/wallet?phone=${s.customerMobile}`); setLoyalty({ points: w.data.points || 0, pointsValue: w.data.pointsValue || 0 }); } catch {} } }).catch(() => {}); }, [sessionId]);
  useEffect(() => { const amt = parseFloat(amount); if (method !== 'UPI' || !amt || !franchiseId) { setUpiQr(null); return; } setUpiLoading(true); fetch(`${API}/public/upi-qr/${franchiseId}?amount=${amt.toFixed(2)}&sessionId=${sessionId}`).then(r=>r.json()).then(d=>{if(d.success&&d.qr)setUpiQr(d);}).catch(()=>{}).finally(()=>setUpiLoading(false)); }, [method, amount, franchiseId, sessionId]);

  const remaining = Math.max(0, totalAmount - paidTotal);
  const fillRemaining = () => setAmount(remaining.toFixed(2));
  const loyaltyMax = Math.min(loyalty.pointsValue, remaining);
  const loyaltyPointsForAmount = (Number(amount || 0) / (loyalty.pointsValue / Math.max(1, loyalty.points))).toFixed(4);

  const addPayment = async () => {
    let amt = parseFloat(amount);
    if (method === 'Loyalty Points') {
      const pointValue = loyalty.pointsValue / Math.max(1, loyalty.points);
      const maxPoints = Math.min(loyalty.points, Math.floor(remaining / pointValue + 1e-9));
      const requestedPoints = Math.min(maxPoints, Math.floor(Number(amount || 0)));
      if (!requestedPoints) { toast.error('Enter loyalty points to redeem'); return; }
      setAdding(true);
      try {
        const res = await api.post(`/loyalty/sessions/${sessionId}/redeem`, { points: requestedPoints });
        const value = Number(res.data.redemptionValue || 0); const newPaid = Number(res.data.session?.paidAmount || paidTotal + value);
        setPaidTotal(newPaid); setEntries(p => [...p, { method, amount: value, reference: `${res.data.appliedPoints} pts` }]); setAmount('');
        setLoyalty(p => ({ points: Math.max(0, p.points - Number(res.data.appliedPoints || 0)), pointsValue: Math.max(0, p.pointsValue - value) }));
        if (res.data.session?.paymentStatus === 'fully_paid') { setDone(true); setTimeout(() => onSuccess({ invoice: res.data.invoice, session: res.data.session }), 300); } else toast.success(`${res.data.appliedPoints} points redeemed · ${fmt(value)}`);
      } catch (err) { toast.error(err.response?.data?.message || 'Loyalty redemption failed'); } finally { setAdding(false); }
      return;
    }
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (amt > remaining + 0.01) { toast.error(`Amount exceeds remaining balance of ${fmt(remaining)}`); return; }
    setAdding(true);
    try {
      const res = await api.post(`/sessions/${sessionId}/payment`, { amount: amt, method, reference: reference.trim() || '' });
      const newPaid = res.data.session?.paidAmount ?? paidTotal + amt; setPaidTotal(newPaid); setEntries(p => [...p, { method, amount: amt, reference: reference.trim() }]); setAmount(''); setReference('');
      if (res.data.session?.paymentStatus === 'fully_paid') { await api.post(`/loyalty/sessions/${sessionId}/finalize`); setDone(true); toast.success('Payment complete!'); setTimeout(() => onSuccess({ invoice: res.data.invoice, session: res.data.session }), 300); } else toast.success(`${fmt(amt)} recorded · Remaining: ${fmt(res.data.balance ?? totalAmount - newPaid)}`);
    } catch (err) { toast.error(err.response?.data?.message || 'Payment failed'); } finally { setAdding(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"><div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between p-5 border-b border-dark-600"><div><h2 className="text-white font-bold flex items-center gap-2"><IndianRupee size={18}/> Split Payment</h2><p className="text-xs text-gray-500 mt-0.5">Cash, UPI, Card or Loyalty Points</p></div>{!done&&<button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18}/></button>}</div>
      <div className="px-5 py-4 border-b border-dark-600 grid grid-cols-3 gap-3 text-center"><div><div className="text-xs text-gray-500">Bill Total</div><div className="text-white font-mono font-semibold text-sm">{fmt(totalAmount)}</div></div><div><div className="text-xs text-gray-500">Paid</div><div className="text-green-400 font-mono font-semibold text-sm">{fmt(paidTotal)}</div></div><div><div className="text-xs text-gray-500">Remaining</div><div className="text-yellow-400 font-mono font-semibold text-sm">{fmt(remaining)}</div></div></div>
      {loyalty.points > 0 && <div className="mx-5 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs"><div className="flex justify-between text-amber-300 font-bold"><span>★ Loyalty Wallet</span><span>{loyalty.points} pts</span></div><div className="text-amber-200/70 mt-0.5">Available value: {fmt(loyalty.pointsValue)} · Use points to pay with no cash</div></div>}
      {entries.length>0&&<div className="px-5 pt-3 space-y-2"><div className="text-xs text-gray-500 uppercase">Transactions</div>{entries.map((e,i)=><div key={i} className="flex justify-between px-3 py-2 rounded-xl border border-dark-500 bg-dark-700 text-sm"><span className="text-gray-300">{e.method} {e.reference&&<span className="text-gray-600 ml-1">{e.reference}</span>}</span><span className="text-green-400 font-mono">{fmt(e.amount)}</span></div>)}</div>}
      {!done&&remaining>0&&<div className="px-5 pt-4 pb-5 space-y-3 border-t border-dark-600 mt-3"><div className="grid grid-cols-5 gap-1.5">{METHODS.map(m=><button key={m.id} onClick={()=>{setMethod(m.id);setAmount('')}} className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium ${method===m.id?'bg-brand-500/20 border-brand-500 text-brand-400':'border-dark-500 bg-dark-700 text-gray-500'}`}><m.Icon size={14}/><span className="text-[9px]">{m.label}</span></button>)}</div>
        {method==='Loyalty Points' ? <div className="space-y-2"><div className="text-xs text-amber-300">Points to redeem (max {Math.min(loyalty.points, Math.floor(remaining / (loyalty.pointsValue / Math.max(1, loyalty.points))))})</div><div className="flex gap-2"><input type="number" min="1" step="1" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Points" className="flex-1 bg-dark-700 border border-dark-500 text-white rounded-xl px-3 py-2.5"/><button onClick={()=>setAmount(String(Math.min(loyalty.points, Math.floor(remaining / (loyalty.pointsValue / Math.max(1, loyalty.points))))))} className="px-3 bg-dark-700 text-gray-400 rounded-xl text-xs">MAX</button></div><div className="text-xs text-gray-500">Value covered: {fmt(Math.min(Number(amount||0) * (loyalty.pointsValue / Math.max(1, loyalty.points)), remaining))}</div></div> : <><div className="flex gap-2"><input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount" className="flex-1 bg-dark-700 border border-dark-500 text-white rounded-xl px-3 py-2.5"/><button onClick={fillRemaining} className="px-3 bg-dark-700 text-gray-400 rounded-xl text-xs">FULL</button></div>{(method==='UPI'||method==='Card'||method==='Net Banking')&&<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Reference / TXN ID" className="w-full bg-dark-700 border border-dark-500 text-white rounded-xl px-3 py-2.5"/>}</>}
        <button onClick={addPayment} disabled={adding||!amount} className="w-full flex items-center justify-center gap-2 py-3 bg-green-500/20 border border-green-500/30 text-green-400 rounded-xl font-semibold disabled:opacity-50">{adding?<Loader2 size={16} className="animate-spin"/>:<Plus size={16}/>} Record {method}</button>
      </div>}
      {done&&<div className="flex flex-col items-center gap-3 py-8"><CheckCircle2 size={42} className="text-green-400"/><div className="text-white font-bold text-lg">Payment Complete!</div><div className="text-sm text-gray-500">{entries.length} transaction(s) recorded · {fmt(totalAmount)}</div></div>}
      {remaining<=0&&!done&&<div className="mx-5 mb-4 text-xs text-green-400">Bill fully covered.</div>}
    </div></div>
  );
}
