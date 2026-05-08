import { useEffect, useState, useRef } from 'react';
import { Coffee, ChefHat, Clock, CheckCircle, LogOut, RefreshCw, Volume2, VolumeX } from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { joinFranchiseRoom, getSocket } from '../../lib/socket';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

const STATUS_CONFIG = {
  Pending:   { label: 'Accept',    next: 'Accepted',  color: 'bg-yellow-500',  ring: 'ring-yellow-500/40',  text: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30' },
  Accepted:  { label: 'Preparing', next: 'Preparing', color: 'bg-blue-500',    ring: 'ring-blue-500/40',    text: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30' },
  Preparing: { label: 'Ready',     next: 'Ready',     color: 'bg-orange-500',  ring: 'ring-orange-500/40',  text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  Ready:     { label: 'Delivered', next: 'Delivered', color: 'bg-green-500',   ring: 'ring-green-500/40',   text: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/30' },
};

const getElapsedMinutes = (createdAt) => {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
};

const isUrgent = (createdAt, status) => {
  const mins = getElapsedMinutes(createdAt);
  if (status === 'Pending') return mins >= 3;
  if (status === 'Accepted' || status === 'Preparing') return mins >= 15;
  return false;
};

const OrderCard = ({ order, onStatusUpdate, updating }) => {
  const config = STATUS_CONFIG[order.kitchen_status];
  const urgent = isUrgent(order.createdAt, order.kitchen_status);
  const elapsedMins = getElapsedMinutes(order.createdAt);

  return (
    <div className={`rounded-2xl border-2 p-4 flex flex-col gap-3 transition-all duration-300 ${config?.bg || 'bg-dark-700'} ${config?.border || 'border-dark-500'} ${urgent ? 'animate-pulse-glow' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-8 h-8 ${config?.color || 'bg-gray-500'} rounded-lg flex items-center justify-center text-white font-bold text-sm`}>
              {order.token_number}
            </div>
            <div>
              <div className="text-xs font-mono text-gray-500">{order.order_number}</div>
              <div className="text-sm font-semibold text-white">{order.customer_id?.name}</div>
              {order.table_number ? (
                <div className="text-xs text-gray-500">Table {order.table_number}</div>
              ) : null}
            </div>
          </div>
        </div>

        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${urgent ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-dark-600 text-gray-500'}`}>
          <Clock size={11} />
          {elapsedMins}m
        </div>
      </div>

      {/* Items */}
      <div className="space-y-1.5">
        {order.is_addition ? (
          <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 px-2 py-1 text-xs font-bold uppercase tracking-wide text-brand-400">
            Addition to token #{order.token_number}
          </div>
        ) : null}
        {order.items?.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-white font-medium">{item.name}</span>
            <span className="w-7 h-7 bg-dark-800/60 rounded-lg flex items-center justify-center text-xs font-bold text-brand-400 flex-shrink-0">
              ×{item.quantity}
            </span>
          </div>
        ))}
      </div>

      {/* Status badge */}
      <div className={`flex items-center gap-2 text-xs font-semibold ${config?.text}`}>
        <div className={`w-2 h-2 rounded-full ${config?.color} ${order.kitchen_status === 'Pending' ? 'animate-pulse' : ''}`} />
        {order.kitchen_status}
      </div>

      {/* Action button */}
      {config && order.kitchen_status !== 'Delivered' && (
        <button
          onClick={() => onStatusUpdate(order._id, config.next)}
          disabled={updating === order._id}
          className={`w-full py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50 ${config.color} hover:opacity-90 shadow-lg`}
        >
          {updating === order._id ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
          ) : (
            config.label
          )}
        </button>
      )}

      {order.kitchen_status === 'Ready' && (
        <div className="text-center text-xs text-green-400 font-semibold animate-pulse">
          Customer notification sent
        </div>
      )}
    </div>
  );
};

export default function KitchenScreen() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const franchiseId = (user?.franchise_id?._id || user?.franchise_id)?.toString();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastCount, setLastCount] = useState(0);
  const audioRef = useRef(null);

  const load = async () => {
    try {
      const res = await api.get('/kitchen/orders');
      const newOrders = res.data.orders;
      if (newOrders.length > lastCount && lastCount > 0 && soundEnabled) {
        // Play notification sound on new order
        try { new Audio('https://www.soundjay.com/misc/sounds/bell-ringing-01.mp3').play(); } catch {}
      }
      setLastCount(newOrders.length);
      setOrders(newOrders);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // refresh every 15s as fallback
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!franchiseId) return;
    joinFranchiseRoom(franchiseId);
    const socket = getSocket();
    socket.on('order:new', (order) => {
      setOrders((prev) => {
        const exists = prev.find((o) => o._id === order._id);
        if (!exists) {
          toast(order.is_addition ? `Addition to token #${order.token_number}` : 'New order arrived!');
          return [order, ...prev];
        }
        return prev;
      });
    });
    socket.on('order:statusUpdate', (data) => {
      if (data.status === 'Delivered') {
        setOrders((prev) => prev.filter((o) => o._id.toString() !== data.orderId.toString()));
      }
    });
    return () => { socket.off('order:new'); socket.off('order:statusUpdate'); };
  }, [franchiseId]);

  const handleStatusUpdate = async (orderId, newStatus) => {
    setUpdating(orderId);
    try {
      await api.put(`/kitchen/orders/${orderId}/status`, { status: newStatus });
      if (newStatus === 'Delivered') {
        setOrders((prev) => prev.filter((o) => o._id !== orderId));
      } else {
        setOrders((prev) => prev.map((o) => o._id === orderId ? { ...o, kitchen_status: newStatus } : o));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
    setUpdating(null);
  };

  // Group by status
  const grouped = {
    Pending:   orders.filter((o) => o.kitchen_status === 'Pending'),
    Accepted:  orders.filter((o) => o.kitchen_status === 'Accepted'),
    Preparing: orders.filter((o) => o.kitchen_status === 'Preparing'),
    Ready:     orders.filter((o) => o.kitchen_status === 'Ready'),
  };

  const totalActive = orders.length;

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* Kitchen header */}
      <header className="h-14 bg-dark-800 border-b border-dark-600 flex items-center px-5 gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <ChefHat size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Kitchen Display</div>
            <div className="text-[10px] text-gray-600">{user?.franchise_id?.name}</div>
          </div>
        </div>

        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold ${totalActive > 0 ? 'bg-brand-500/20 text-brand-400' : 'bg-dark-700 text-gray-600'}`}>
          <div className={`w-2 h-2 rounded-full ${totalActive > 0 ? 'bg-brand-500 animate-pulse' : 'bg-gray-700'}`} />
          {totalActive} active order{totalActive !== 1 ? 's' : ''}
        </div>

        <div className="flex-1" />

        <button onClick={() => setSoundEnabled(!soundEnabled)} className={`p-2 rounded-lg transition-colors ${soundEnabled ? 'text-brand-400 hover:text-brand-300' : 'text-gray-600 hover:text-gray-400'}`}>
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <button onClick={load} className="text-gray-500 hover:text-white p-2 rounded-lg transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
        <button onClick={() => { logout(); navigate('/login'); }} className="text-gray-500 hover:text-red-400 p-2 rounded-lg transition-colors">
          <LogOut size={16} />
        </button>
      </header>

      {/* Status legend */}
      <div className="bg-dark-800 border-b border-dark-600 px-5 py-2 flex items-center gap-4 text-xs">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${cfg.color}`} />
            <span className={cfg.text}>{status}</span>
            <span className="text-gray-700">({grouped[status]?.length || 0})</span>
          </div>
        ))}
        <div className="ml-auto text-gray-700">Auto-refreshes every 15s</div>
      </div>

      {/* Order columns */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : totalActive === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-700">
            <ChefHat size={48} />
            <div className="text-lg font-medium">Kitchen is clear!</div>
            <div className="text-sm">No active orders — waiting for new orders</div>
          </div>
        ) : (
          <div className="h-full grid grid-cols-4 divide-x divide-dark-600 overflow-hidden">
            {Object.entries(grouped).map(([status, statusOrders]) => {
              const cfg = STATUS_CONFIG[status];
              return (
                <div key={status} className="flex flex-col overflow-hidden">
                  {/* Column header */}
                  <div className={`px-4 py-3 border-b border-dark-600 flex items-center gap-2 ${cfg.bg}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${cfg.color} ${status === 'Pending' ? 'animate-pulse' : ''}`} />
                    <span className={`font-semibold text-sm ${cfg.text}`}>{status}</span>
                    <span className={`ml-auto w-6 h-6 rounded-full ${cfg.color} text-white text-xs font-bold flex items-center justify-center`}>
                      {statusOrders.length}
                    </span>
                  </div>

                  {/* Orders */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {statusOrders.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-gray-700 text-sm">Empty</div>
                    ) : (
                      statusOrders
                        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                        .map((order) => (
                          <OrderCard
                            key={order._id}
                            order={order}
                            onStatusUpdate={handleStatusUpdate}
                            updating={updating}
                          />
                        ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
