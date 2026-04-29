import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  Coffee, LayoutDashboard, Store, UtensilsCrossed, Users,
  Receipt, FileText, ChefHat, LogOut, Menu, X, Settings
} from 'lucide-react';
import { useState } from 'react';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const MASTER_NAV = [
  { to: '/master/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/master/franchises', icon: Store, label: 'Franchises' },
  { to: '/master/menu', icon: UtensilsCrossed, label: 'Menu' },
  { to: '/master/staff', icon: Users, label: 'Staff' },
  { to: '/master/customers', icon: Users, label: 'Customers' },
  { to: '/master/invoices', icon: FileText, label: 'Invoices & GST' },
];

const FRANCHISE_NAV = [
  { to: '/franchise/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/franchise/orders', icon: Receipt, label: 'Orders' },
  { to: '/franchise/menu', icon: UtensilsCrossed, label: 'Menu' },
  { to: '/franchise/staff', icon: Users, label: 'Staff' },
  { to: '/pos', icon: Receipt, label: 'POS Billing' },
  { to: '/kitchen', icon: ChefHat, label: 'Kitchen' },
];

const ROLE_LABELS = {
  master_admin: 'Master Admin',
  franchise_owner: 'Franchise Owner',
  manager: 'Manager',
};

export default function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const nav = user?.role === 'master_admin' ? MASTER_NAV : FRANCHISE_NAV;

  const handleLogout = () => {
    logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-dark-900">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-60' : 'w-16'} flex-shrink-0 bg-dark-800 border-r border-dark-600 flex flex-col transition-all duration-300 z-30`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-dark-600">
          <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Coffee size={20} className="text-white" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <div className="font-display font-bold text-white leading-tight">UTC Café</div>
              <div className="text-[10px] text-gray-600 uppercase tracking-widest">Management</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                ${isActive
                  ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20'
                  : 'text-gray-500 hover:text-white hover:bg-dark-600'}`
              }
            >
              <Icon size={18} className="flex-shrink-0" />
              {sidebarOpen && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User profile + logout */}
        <div className="border-t border-dark-600 p-3">
          {sidebarOpen ? (
            <div className="bg-dark-700 rounded-xl p-3 mb-2">
              <div className="text-sm font-semibold text-white truncate">{user?.name}</div>
              <div className="text-xs text-gray-500 truncate">{user?.email}</div>
              <div className="mt-1">
                <span className="badge bg-brand-500/15 text-brand-400 border border-brand-500/20">
                  {ROLE_LABELS[user?.role] || user?.role}
                </span>
              </div>
              {user?.franchise_id && (
                <div className="text-xs text-gray-600 mt-1 truncate">
                  {user.franchise_id.name}
                </div>
              )}
            </div>
          ) : null}

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut size={18} className="flex-shrink-0" />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-dark-800 border-b border-dark-600 flex items-center px-6 gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-500 hover:text-white transition-colors"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            {user?.franchise_id && (
              <span className="text-xs text-gray-600 hidden sm:block">
                {user.franchise_id.franchiseCode} · {user.franchise_id.name}
              </span>
            )}
            <div className="w-8 h-8 bg-brand-500/20 rounded-full flex items-center justify-center text-brand-400 font-bold text-sm">
              {user?.name?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
