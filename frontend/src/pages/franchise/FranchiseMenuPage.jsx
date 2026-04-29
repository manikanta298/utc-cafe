import { useEffect, useState } from 'react';
import { ToggleLeft, ToggleRight, Search } from 'lucide-react';
import api from '../../lib/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const CATEGORIES = ['All', 'Beverages', 'Snacks', 'Meals', 'Desserts', 'Breads', 'Specials', 'Add-ons'];

export default function FranchiseMenuPage() {
  const { user } = useAuthStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [toggling, setToggling] = useState(null);

  const franchiseId = (user?.franchise_id?._id || user?.franchise_id)?.toString();

  const load = async () => {
    setLoading(true);
    const res = await api.get('/menu/all');
    setItems(res.data.items);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const isDisabled = (item) =>
    item.disabledInFranchises?.some((id) => id.toString() === franchiseId);

  const handleToggle = async (item) => {
    setToggling(item._id);
    try {
      const res = await api.put(`/menu/${item._id}/toggle`);
      const enabled = res.data.isEnabled;
      toast.success(`${item.name} ${enabled ? 'enabled' : 'disabled'} for your outlet`);
      load();
    } catch { toast.error('Toggle failed'); }
    setToggling(null);
  };

  const filtered = items.filter((i) => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === 'All' || i.category === catFilter;
    return matchSearch && matchCat;
  });

  const enabledCount = items.filter((i) => !isDisabled(i) && i.isGlobalActive).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Menu Availability</h1>
          <p className="text-gray-500 text-sm mt-1">
            {enabledCount} of {items.length} items active for your outlet
          </p>
        </div>
      </div>

      <div className="card p-4 mb-6 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <ToggleRight size={16} className="text-brand-400" />
        </div>
        <div className="text-sm text-gray-400">
          Toggle items to enable or disable them specifically for <span className="text-white">{user?.franchise_id?.name}</span>.
          Base prices and GST rates are set by Master Admin and cannot be changed here.
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input pl-9 w-56" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${catFilter === c ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-500 hover:text-white'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => {
            const disabled = isDisabled(item);
            const globallyInactive = !item.isGlobalActive;
            return (
              <div key={item._id} className={`card overflow-hidden transition-all duration-200 ${disabled || globallyInactive ? 'opacity-50' : 'border-dark-500 hover:border-brand-500/30'}`}>
                <div className="h-36 bg-dark-700 relative overflow-hidden">
                  {item.image?.url ? (
                    <img src={item.image.url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>
                  )}
                  {globallyInactive && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <span className="text-xs text-gray-500">Disabled by Admin</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white text-sm">{item.name}</span>
                    <span className="font-mono text-brand-400 text-sm">₹{item.price}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      <span className="badge bg-dark-600 text-gray-500 border-0 text-[10px]">{item.category}</span>
                      <span className="badge bg-dark-600 text-gray-600 border-0 text-[10px]">{item.gst_rate}%</span>
                    </div>
                    {!globallyInactive && (
                      <button
                        onClick={() => handleToggle(item)}
                        disabled={toggling === item._id}
                        className="flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50"
                      >
                        {toggling === item._id ? (
                          <div className="w-4 h-4 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                        ) : disabled ? (
                          <><ToggleLeft size={20} className="text-gray-600" /><span className="text-gray-600">Off</span></>
                        ) : (
                          <><ToggleRight size={20} className="text-brand-400" /><span className="text-brand-400">On</span></>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
