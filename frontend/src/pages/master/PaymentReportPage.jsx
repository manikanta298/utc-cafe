import { useEffect, useState } from 'react';
import { Download, IndianRupee, Filter, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';

const METHOD_COLORS = {
  Cash: 'text-green-400', UPI: 'text-blue-400', Card: 'text-purple-400',
  'Net Banking': 'text-yellow-400', Pending: 'text-red-400',
};

export default function PaymentReportPage() {
  const { user } = useAuthStore();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', franchiseId: '' });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters);
      const res = await api.get(`/reports/payments?${params}`);
      setRows(res.data.rows || []);
      setSummary(res.data.summary || {});
    } catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const downloadCsv = async () => {
    try {
      const params = new URLSearchParams({ ...filters, format: 'csv' });
      const res = await api.get(`/reports/payments?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url;
      a.download = `payment-report-${new Date().toISOString().split('T')[0]}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const summaryCards = [
    { label: 'Total', amount: summary.total || 0, color: 'text-white' },
    { label: 'Cash', amount: summary.Cash || 0, color: 'text-green-400' },
    { label: 'UPI', amount: summary.UPI || 0, color: 'text-blue-400' },
    { label: 'Card', amount: summary.Card || 0, color: 'text-purple-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <IndianRupee size={20} className="text-brand-400" /> Payment Reports
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Unified report — all payment methods</p>
        </div>
        <button onClick={downloadCsv} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-xl">
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="text-xs text-gray-500 mb-1">{c.label}</div>
            <div className={`text-xl font-bold ${c.color}`}>Rs. {(c.amount || 0).toFixed(2)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">From Date</label>
          <input className="input" type="date" value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
        </div>
        <div>
          <label className="label">To Date</label>
          <input className="input" type="date" value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
        </div>
        <button onClick={load} className="btn-primary px-4 py-2 rounded-xl text-sm flex items-center gap-2">
          <Filter size={14} /> Apply
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600">
                {['Token/Ref', 'Franchise', 'Customer', 'Mobile', 'Method', 'Original', 'Discount', 'Paid', 'Status', 'Date'].map((h) => (
                  <th key={h} className="text-left px-3 py-3 text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-dark-700/30 transition-colors">
                  <td className="px-3 py-2 text-brand-400 font-mono text-xs whitespace-nowrap">{r.tokenNumber || r.sessionRef}</td>
                  <td className="px-3 py-2 text-gray-300 text-xs whitespace-nowrap">{r.franchise}</td>
                  <td className="px-3 py-2 text-gray-300 text-xs">{r.customerName || '—'}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs">{r.mobile}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={METHOD_COLORS[r.paymentType] || 'text-gray-400'}>{r.paymentType}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-300 text-xs whitespace-nowrap">Rs. {Number(r.originalAmount || 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-red-400 text-xs">{r.discount > 0 ? `-Rs. ${Number(r.discount).toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-2 text-green-400 font-semibold text-xs whitespace-nowrap">Rs. {Number(r.finalAmount || 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={r.paymentStatus === 'fully_paid' ? 'text-green-400' : r.paymentStatus === 'unpaid' ? 'text-red-400' : 'text-yellow-400'}>
                      {r.paymentStatus?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                    {r.date ? format(new Date(r.date), 'dd MMM HH:mm') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <div className="text-center py-12 text-gray-500">No payment records found for selected range</div>
          )}
          {loading && <div className="text-center py-8 text-gray-500">Loading...</div>}
        </div>
      </div>
    </div>
  );
}
