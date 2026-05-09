import { useEffect, useState, useCallback } from 'react';
import { Users, Coffee, Clock, CreditCard, CheckCircle, Plus, Trash2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import { getSocket, joinFranchiseRoom } from '../../lib/socket';

const STATUS_CONFIG = {
  available: { label: 'Available', color: 'border-green-500/40 bg-green-500/10 text-green-400', dot: 'bg-green-500' },
  occupied: { label: 'Occupied', color: 'border-orange-500/40 bg-orange-500/10 text-orange-400', dot: 'bg-orange-500' },
  bill_pending: { label: 'Bill Due', color: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400', dot: 'bg-yellow-500' },
  reserved: { label: 'Reserved', color: 'border-blue-500/40 bg-blue-500/10 text-blue-400', dot: 'bg-blue-500' },
};

export default function TableMapPage() {
  const { user } = useAuthStore();
  const franchiseId = (user?.franchise_id?._id || user?.franchise_id)?.toString();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTable, setNewTable] = useState({ tableNumber: '', capacity: 4 });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/tables/map');
      setTables(res.data.tables || []);
    } catch {
      toast.error('Failed to load tables');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!franchiseId) return;
    joinFranchiseRoom(franchiseId);
    const socket = getSocket();
    const handleTableUpdate = (data) => {
      setTables((prev) =>
        prev.map((t) =>
          t._id === data.tableId || t.tableNumber === data.tableNumber
            ? { ...t, status: data.status, currentSessionId: data.tokenNumber ? { tokenNumber: data.tokenNumber } : null }
            : t
        )
      );
    };
    socket.on('table:statusUpdated', handleTableUpdate);
    return () => socket.off('table:statusUpdated', handleTableUpdate);
  }, [franchiseId]);

  const addTable = async () => {
    if (!newTable.tableNumber) return toast.error('Table number required');
    try {
      await api.post('/tables', newTable);
      toast.success(`Table ${newTable.tableNumber} added`);
      setNewTable({ tableNumber: '', capacity: 4 });
      setShowAdd(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add table');
    }
  };

  const removeTable = async (id, num) => {
    if (!window.confirm(`Remove Table ${num}?`)) return;
    try {
      await api.delete(`/tables/${id}`);
      toast.success(`Table ${num} removed`);
      load();
    } catch {
      toast.error('Failed to remove table');
    }
  };

  const counts = tables.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Table Map</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live table status — real-time updates</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost p-2 rounded-xl">
            <RefreshCw size={16} className={loading ? 'animate-spin text-brand-400' : 'text-gray-400'} />
          </button>
          {(user?.role === 'franchise_owner' || user?.role === 'manager' || user?.role === 'master_admin') && (
            <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 text-sm px-3 py-2 rounded-xl">
              <Plus size={16} /> Add Table
            </button>
          )}
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className="card p-3 flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
            <div>
              <div className="text-lg font-bold text-white">{counts[key] || 0}</div>
              <div className="text-xs text-gray-500">{cfg.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card h-36 animate-pulse bg-dark-700" />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <div className="card p-12 text-center">
          <Coffee size={40} className="mx-auto text-gray-600 mb-3" />
          <div className="text-gray-400">No tables configured yet.</div>
          <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 px-4 py-2 text-sm rounded-xl">
            Add Your First Table
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {tables.map((t) => {
            const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.available;
            return (
              <div key={t._id} className={`card border-2 ${cfg.color} p-4 relative group`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-2xl font-black text-white">Table {t.tableNumber}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className={`w-2 h-2 rounded-full ${cfg.dot} ${t.status === 'occupied' ? 'animate-pulse' : ''}`} />
                      <span className="text-xs font-medium">{cfg.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    <Users size={12} />
                    <span>{t.capacity}</span>
                  </div>
                </div>

                {t.currentSessionId?.tokenNumber && (
                  <div className="mt-3 pt-3 border-t border-current/20">
                    <div className="text-sm font-bold text-white">{t.currentSessionId.tokenNumber}</div>
                    {t.currentSessionId.totalAmount > 0 && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        Rs. {t.currentSessionId.totalAmount?.toFixed(2)}
                      </div>
                    )}
                  </div>
                )}

                {(user?.role === 'franchise_owner' || user?.role === 'manager') && t.status === 'available' && (
                  <button
                    onClick={() => removeTable(t._id, t.tableNumber)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-lg text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Table Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Add Table</h2>
            <div>
              <label className="label">Table Number / Name</label>
              <input
                className="input"
                placeholder="e.g. 1, 2A, Window-1"
                value={newTable.tableNumber}
                onChange={(e) => setNewTable({ ...newTable, tableNumber: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Capacity (seats)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={newTable.capacity}
                onChange={(e) => setNewTable({ ...newTable, capacity: Number(e.target.value) })}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 btn-ghost py-2 rounded-xl text-sm">Cancel</button>
              <button onClick={addTable} className="flex-1 btn-primary py-2 rounded-xl text-sm">Add Table</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
