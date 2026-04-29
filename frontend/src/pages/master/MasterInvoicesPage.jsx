import { useEffect, useState } from 'react';
import { FileText, Download } from 'lucide-react';
import api from '../../lib/api';
import { format } from 'date-fns';

export default function MasterInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [franchises, setFranchises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ franchiseId: '', month: '', year: new Date().getFullYear() });
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: 50, ...filters });
    const [inv, fr] = await Promise.all([api.get(`/invoices?${params}`), api.get('/franchises')]);
    setInvoices(inv.data.invoices);
    setTotal(inv.data.total);
    setFranchises(fr.data.franchises);
    setLoading(false);
  };
  useEffect(() => { load(); }, [filters]);

  // GST aggregate
  const gstTotals = invoices.reduce((acc, inv) => ({
    taxable: acc.taxable + (inv.taxable_amount || 0),
    cgst: acc.cgst + (inv.cgst || 0),
    sgst: acc.sgst + (inv.sgst || 0),
    igst: acc.igst + (inv.igst || 0),
    total: acc.total + (inv.total_tax || 0),
    final: acc.final + (inv.final_amount || 0),
  }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, final: 0 });

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Invoices & GST Reports</h1>
          <p className="text-gray-500 text-sm mt-1">{total} invoices</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select className="input w-48" value={filters.franchiseId} onChange={(e) => setFilters({ ...filters, franchiseId: e.target.value })}>
          <option value="">All Franchises</option>
          {franchises.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
        </select>
        <select className="input w-36" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}>
          <option value="">All Months</option>
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <input className="input w-28" type="number" placeholder="Year" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} />
      </div>

      {/* GST Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Taxable', value: gstTotals.taxable, color: 'text-white' },
          { label: 'CGST', value: gstTotals.cgst, color: 'text-blue-400' },
          { label: 'SGST', value: gstTotals.sgst, color: 'text-teal-400' },
          { label: 'IGST', value: gstTotals.igst, color: 'text-purple-400' },
          { label: 'Total Tax', value: gstTotals.total, color: 'text-orange-400' },
          { label: 'Final Revenue', value: gstTotals.final, color: 'text-green-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4">
            <div className="text-xs text-gray-600 mb-1">{label}</div>
            <div className={`font-mono font-bold text-sm ${color}`}>₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        ))}
      </div>

      {/* Invoice table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-700/50">
              <tr>{['Invoice No', 'Date', 'Franchise', 'Customer', 'Taxable', 'CGST', 'SGST', 'IGST', 'Tax', 'Final'].map(h => <th key={h} className="table-head">{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={10} className="text-center py-8 text-gray-600">Loading...</td></tr>
              : invoices.map((inv) => (
                <tr key={inv._id} className="table-row">
                  <td className="table-cell font-mono text-brand-400 text-xs">{inv.invoice_no}</td>
                  <td className="table-cell text-xs text-gray-500">{inv.invoice_date ? format(new Date(inv.invoice_date), 'dd/MM/yy') : ''}</td>
                  <td className="table-cell text-xs">{inv.franchise_id?.franchiseCode}</td>
                  <td className="table-cell text-xs">{inv.customer_name}</td>
                  <td className="table-cell font-mono text-xs">₹{inv.taxable_amount?.toFixed(2)}</td>
                  <td className="table-cell font-mono text-xs text-blue-400">₹{inv.cgst?.toFixed(2)}</td>
                  <td className="table-cell font-mono text-xs text-teal-400">₹{inv.sgst?.toFixed(2)}</td>
                  <td className="table-cell font-mono text-xs text-purple-400">₹{inv.igst?.toFixed(2)}</td>
                  <td className="table-cell font-mono text-xs text-orange-400">₹{inv.total_tax?.toFixed(2)}</td>
                  <td className="table-cell font-mono text-xs text-green-400 font-bold">₹{inv.final_amount?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
