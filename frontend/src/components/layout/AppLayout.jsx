import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Coffee, LayoutDashboard, Store, UtensilsCrossed, Users, Receipt,
  FileText, ChefHat, LogOut, Menu, X, History, Lock, Tag,
  Shield, BarChart2, MapPin, IndianRupee,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { normalizeRole } from '../../utils/roles';

const MASTER_NAV = [
  { to: '/master/dashboard',       icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/master/franchises',      icon: Store,           label: 'Franchises' },
  { to: '/master/menu',            icon: UtensilsCrossed, label: 'Menu' },
  { to: '/master/staff',           icon: Users,           label: 'Staff' },
  { to: '/master/customers',       icon: Users,           label: 'Customers' },
  { to: '/master/invoices',        icon: FileText,        label: 'Invoices & GST' },
  { to: '/master/coupons',         icon: Tag,             label: 'Coupons' },
  { to: '/master/payment-reports', icon: IndianRupee,     label: 'Payment Reports' },
  { to: '/master/audit',           icon: Shield,          label: 'Audit Logs' },
];

const FRANCHISE_NAV = [
  { to: '/franchise/dashboard',       icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/franchise/orders',          icon: Receipt,         label: 'Orders' },
  { to: '/franchise/menu',            icon: UtensilsCrossed, label: 'Menu' },
  { to: '/franchise/staff',           icon: Users,           label: 'Staff' },
  { to: '/franchise/tables',          icon: MapPin,          label: 'Table Map' },
  { to: '/franchise/invoices',        icon: FileText,        label: 'Reports' },
  { to: '/franchise/payment-reports', icon: IndianRupee,     label: 'Payments' },
  { to: '/pos',                       icon: Receipt,         label: 'POS Billing', matchPaths: ['/pos', '/pos/history'] },
  { to: '/kitchen',                   icon: ChefHat,         label: 'Kitchen' },
];

const POS_NAV = [
  { to: '/pos',          icon: Receipt, label: 'POS Billing' },
  { to: '/pos/history',  icon: History, label: 'Order History' },
  { to: '/pos/tables',   icon: MapPin,  label: 'Table Map' },
];

const KITCHEN_NAV = [
  { to: '/kitchen', icon: ChefHat, label: 'Kitchen' },
];

const ROLE_LABELS = {
  master_admin:    'Master Admin',
  franchise_owner: 'Franchise Owner',
  manager:         'Manager',
  pos_staff:       'POS Staff',
  shift_operator:  'Shift Operator',
  kitchen_staff:   'Kitchen Staff',
};

const getNavForRole = (role) => {
  switch (role) {
    case 'master_admin':   return MASTER_NAV;
    case 'franchise_owner':
    case 'manager':        return FRANCHISE_NAV;
    case 'pos_staff':
    case 'shift_operator': return POS_NAV;
    case 'kitchen_staff':  return KITCHEN_NAV;
    default:               return [];
  }
};

export default function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);

  const nav = useMemo(() => getNavForRole(normalizeRole(user?.role)), [user?.role]);
  const franchiseStatus = user?.franchise_id?.status || (user?.franchise_id?.isActive === false ? 'inactive' : 'active');

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out');
    navigate('/login');
  };

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  return (
    <div className="flex min-h-screen bg-dark-900">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-dark-600 bg-dark-800',
          'transition-transform duration-300 ease-in-out',
          'lg:static lg:z-auto lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Logo */}
        <div className="flex items-center justify-between gap-3 border-b border-dark-600 px-4 py-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 flex-shrink-0">
              <Coffee size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-white leading-tight truncate">UTC Cafe</div>
              <div className="text-[10px] text-gray-600 uppercase tracking-widest truncate">Operations</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-dark-700 hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
          {nav.map(({ to, icon: Icon, label, matchPaths }) => {
            const isActive = matchPaths
              ? matchPaths.some((p) => location.pathname === p)
              : location.pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                className={[
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'border border-brand-500/20 bg-brand-500/15 text-brand-400'
                    : 'text-gray-500 hover:bg-dark-600 hover:text-white',
                ].join(' ')}
              >
                <Icon size={18} className="flex-shrink-0" />
                <span className="truncate">{label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User card + logout */}
        <div className="border-t border-dark-600 p-3">
          <div className="mb-2 rounded-xl bg-dark-700 p-3">
            <div className="truncate text-sm font-semibold text-white">{user?.name}</div>
            <div className="truncate text-xs text-gray-500">{user?.email}</div>
            <div className="mt-1">
              <span className="badge border border-brand-500/20 bg-brand-500/15 text-brand-400">
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
            </div>
            {user?.franchise_id && (
              <div className="mt-1 flex items-center gap-1 truncate text-xs text-gray-600">
                {franchiseStatus !== 'active' && <Lock size={11} className="text-red-400 flex-shrink-0" />}
                <span className="truncate">{user.franchise_id.name}</span>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-gray-500 transition-all hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut size={18} className="flex-shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center gap-4 border-b border-dark-600 bg-dark-800 px-4 sm:px-6 flex-shrink-0">
          <button
            onClick={toggleSidebar}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-dark-700 hover:text-white flex-shrink-0"
            aria-label="Toggle navigation"
            type="button"
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">
              {ROLE_LABELS[user?.role] || 'Workspace'}
            </div>
            {user?.franchise_id && (
              <div className="truncate text-xs text-gray-600">
                {user.franchise_id.franchiseCode} · {user.franchise_id.name}
              </div>
            )}
          </div>

          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-sm font-bold text-brand-400 flex-shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
