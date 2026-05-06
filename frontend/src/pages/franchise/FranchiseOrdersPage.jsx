import { useEffect, useState } from 'react';
import { Download, Printer, RefreshCw } from 'lucide-react';
import api from '../../lib/api';
import { format } from 'date-fns';

const STATUS_FILTERS = ['', 'Pending', 'Accepted', 'Preparing', 'Ready', 'Delivered'];

export default function FranchiseOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ status: '', date: '', page: 1 });

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: 30, ...filters });
    const res = await api.get(`/orders?${params}`);
    setOrders(res.data.orders);
    setTotal(res.data.total);
    setLoading(false);
  };
  useEffect(() => { load(); }, [filters]);

  const downloadBlob = (data, type, filename) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  const downloadReport = async () => {
    const params = new URLSearchParams({ ...filters });
    const res = await api.get(`/orders/export.csv?${params}`, { responseType: 'blob' });
    downloadBlob(res.data, 'text/csv', 'orders-report.csv');
  };
  const openReceipt = async (orderId) => {
    const res = await api.get(`/orders/${orderId}`);
    const invoiceId = res.data.order?.invoice_id || res.data.invoice?._id;
    if (!invoiceId) return;
    const receipt = await api.get(`/invoices/${invoiceId}/receipt`, { responseType: 'text' });
    const url = URL.createObjectURL(new Blob([receipt.data], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Orders</h1>
          <p className="text-gray-500 text-sm mt-1">{total} total orders</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadReport} className="btn-ghost flex items-center gap-2 py-2">
            <Download size={15} /> Download CSV
          </button>
          <button onClick={load} className="btn-ghost flex items-center gap-2 py-2">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input type="date" className="input w-44" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value, page: 1 })} />
        <div className="flex gap-2">
          {STATUS_FILTERS.map((s) => (
            <button key={s} onClick={() => setFilters({ ...filters, status: s, page: 1 })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filters.status === s ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-500 hover:text-white'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-700/50">
              <tr>{['Order #', 'Token', 'Customer', 'Items', 'Amount', 'Payment', 'Kitchen', 'Time', 'Actions'].map(h => <th key={h} className="table-head">{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              ) : orders.map((order) => (
                <tr key={order._id} className="table-row">
                  <td className="table-cell font-mono text-brand-400 text-xs">{order.order_number}</td>
                  <td className="table-cell text-center">
                    <span className="w-7 h-7 bg-dark-600 rounded-full inline-flex items-center justify-center text-xs font-bold text-white">
                      {order.token_number}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="text-sm text-white">{order.customer_id?.name}</div>
                    <div className="text-xs text-gray-600">{order.customer_id?.phone_no}</div>
                  </td>
                  <td className="table-cell text-xs text-gray-500">{order.items?.length} items</td>
                  <td className="table-cell font-mono text-green-400 font-semibold">₹{order.final_amount?.toLocaleString('en-IN')}</td>
                  <td className="table-cell">
                    <span className={`badge text-xs ${order.payment_mode === 'Cash' ? 'bg-green-500/10 text-green-400' : order.payment_mode === 'UPI' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                      {order.payment_mode}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className={`badge status-${order.kitchen_status?.toLowerCase()}`}>
                      {order.kitchen_status}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-gray-600">
                    {order.createdAt ? format(new Date(order.createdAt), 'dd MMM, hh:mm a') : ''}
                  </td>
                  <td className="table-cell">
                    <button onClick={() => openReceipt(order._id)} className="text-gray-500 hover:text-brand-400 transition-colors" title="Reprint bill">
                      <Printer size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !orders.length && (
                <tr><td colSpan={9} className="text-center py-12 text-gray-600 text-sm">No orders found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
