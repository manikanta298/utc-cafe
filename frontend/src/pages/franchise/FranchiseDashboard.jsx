import { useEffect, useState } from 'react';
import { ShoppingBag, IndianRupee, Clock, TrendingUp, Users, Star } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { format } from 'date-fns';

const COLORS = ['#f97316', '#ea580c', '#fb923c', '#fdba74', '#fed7aa'];

const StatCard = ({ icon: Icon, label, value, sub, color = 'text-brand-400', bg = 'bg-brand-500/10' }) => (
  <div className="stat-card animate-slide-up">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg} ${color}`}>
      <Icon size={20} />
    </div>
    <div className="mt-3">
      <div className="text-2xl font-bold text-white font-mono">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-700 border border-dark-500 rounded-xl p-3 text-xs">
      <div className="text-gray-400 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name === 'orders' ? p.value : `₹${Number(p.value).toLocaleString('en-IN')}`}
        </div>
      ))}
    </div>
  );
};

export default function FranchiseDashboard() {
  const { user } = useAuthStore();
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('today');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/dashboard/franchise?period=${period}`);
        setData(res.data.data);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    fetch();
  }, [period]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const { totalOrders, totalRevenue, pendingOrders, todayOrders, topItems, recentOrders, revenueChart, gstSummary, staffCount } = data || {};

  const pieData = (topItems || []).map((i) => ({ name: i._id, value: i.count }));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">
            {user?.franchise_id?.name || 'Franchise Dashboard'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {user?.franchise_id?.franchiseCode} · Real-time outlet overview
          </p>
        </div>
        <div className="flex gap-2">
          {['today', 'week', 'month'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${period === p ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-500 hover:text-white'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ShoppingBag} label="Orders" value={totalOrders || 0} sub={`Period: ${period}`} />
        <StatCard icon={IndianRupee} label="Revenue" value={`₹${((totalRevenue || 0) / 1000).toFixed(1)}K`} color="text-green-400" bg="bg-green-500/10" />
        <StatCard icon={Clock} label="Pending" value={pendingOrders || 0} sub="Active kitchen orders" color="text-orange-400" bg="bg-orange-500/10" />
        <StatCard icon={Users} label="Staff" value={staffCount || 0} color="text-blue-400" bg="bg-blue-500/10" />
      </div>

      {/* Today callout */}
      {period !== 'today' && (
        <div className="card p-4 flex items-center gap-3 border-brand-500/20">
          <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
          <span className="text-sm text-gray-400">Today so far: <span className="text-white font-semibold">{todayOrders} orders</span></span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <div className="card p-6 col-span-2">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-brand-400" /> Revenue (Last 7 Days)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenueChart || []}>
              <defs>
                <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
              <XAxis dataKey="_id" tick={{ fill: '#555', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => v ? format(new Date(v), 'dd MMM') : ''} />
              <YAxis tick={{ fill: '#555', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#f97316" strokeWidth={2} fill="url(#fg)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Top items pie */}
        <div className="card p-6">
          <h3 className="font-semibold text-white mb-4">Top Items</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" paddingAngle={3}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {pieData.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-400 truncate max-w-[120px]">{item.name}</span>
                    </div>
                    <span className="text-gray-600 font-mono">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="text-center text-gray-600 py-8 text-sm">No data</div>}
        </div>
      </div>

      {/* GST Summary */}
      {gstSummary?.taxableAmount > 0 && (
        <div className="card p-6">
          <h3 className="font-semibold text-white mb-4">GST Summary — {period}</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Taxable Amount', value: gstSummary.taxableAmount, color: 'text-white' },
              { label: 'CGST', value: gstSummary.totalCgst, color: 'text-blue-400' },
              { label: 'SGST', value: gstSummary.totalSgst, color: 'text-teal-400' },
              { label: 'IGST', value: gstSummary.totalIgst, color: 'text-purple-400' },
              { label: 'Total Tax Liability', value: gstSummary.totalTax, color: 'text-orange-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-dark-700 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-600 mb-1">{label}</div>
                <div className={`font-mono font-bold ${color}`}>₹{Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent orders */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-dark-600 flex items-center justify-between">
          <h3 className="font-semibold text-white">Recent Orders</h3>
          <a href="/franchise/orders" className="text-xs text-brand-400 hover:text-brand-300">View all →</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-700/50">
              <tr>{['Order #', 'Token', 'Customer', 'Items', 'Amount', 'Payment', 'Status'].map(h => <th key={h} className="table-head">{h}</th>)}</tr>
            </thead>
            <tbody>
              {(recentOrders || []).map((order) => (
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
                  <td className="table-cell font-mono text-green-400">₹{order.final_amount?.toLocaleString('en-IN')}</td>
                  <td className="table-cell">
                    <span className={`badge ${order.payment_mode === 'Cash' ? 'bg-green-500/10 text-green-400' : order.payment_mode === 'UPI' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                      {order.payment_mode}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className={`badge status-${order.kitchen_status?.toLowerCase()}`}>
                      {order.kitchen_status}
                    </span>
                  </td>
                </tr>
              ))}
              {!recentOrders?.length && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-600 text-sm">No orders yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
