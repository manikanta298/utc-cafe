import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';

// Pages
import LoginPage from './pages/LoginPage';
import MasterDashboard from './pages/master/MasterDashboard';
import FranchisesPage from './pages/master/FranchisesPage';
import MasterMenuPage from './pages/master/MasterMenuPage';
import MasterStaffPage from './pages/master/MasterStaffPage';
import MasterCustomersPage from './pages/master/MasterCustomersPage';
import MasterInvoicesPage from './pages/master/MasterInvoicesPage';
import FranchiseDashboard from './pages/franchise/FranchiseDashboard';
import FranchiseMenuPage from './pages/franchise/FranchiseMenuPage';
import FranchiseStaffPage from './pages/franchise/FranchiseStaffPage';
import FranchiseOrdersPage from './pages/franchise/FranchiseOrdersPage';
import POSScreen from './pages/pos/POSScreen';
import KitchenScreen from './pages/kitchen/KitchenScreen';

// Layouts
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

const ROLE_HOME = {
  master_admin:    '/master/dashboard',
  franchise_owner: '/franchise/dashboard',
  manager:         '/franchise/dashboard',
  pos_staff:       '/pos',
  shift_operator:  '/pos',
  kitchen_staff:   '/kitchen',
};

// Shown while checking existing session from localStorage token
function InitializingScreen() {
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-600 text-sm">Loading UTC Café...</p>
    </div>
  );
}

export default function App() {
  const { fetchMe, user, initializing } = useAuthStore();

  useEffect(() => { fetchMe(); }, []);

  // Block render until session check completes — prevents flash redirect to /login
  if (initializing) return <InitializingScreen />;

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1a1a1a', color: '#fff', border: '1px solid #2d2d2d' },
          success: { iconTheme: { primary: '#f97316', secondary: '#fff' } },
        }}
      />
      <Routes>
        {/* Public — redirect already-logged-in users away from login */}
        <Route path="/login" element={
          user ? <Navigate to={ROLE_HOME[user.role] || '/'} replace /> : <LoginPage />
        } />

        {/* Root redirect */}
        <Route path="/" element={
          user ? <Navigate to={ROLE_HOME[user.role]} replace /> : <Navigate to="/login" replace />
        } />

        {/* Master Admin */}
        <Route path="/master" element={
          <ProtectedRoute roles={['master_admin']}><AppLayout /></ProtectedRoute>
        }>
          <Route path="dashboard"  element={<MasterDashboard />} />
          <Route path="franchises" element={<FranchisesPage />} />
          <Route path="menu"       element={<MasterMenuPage />} />
          <Route path="staff"      element={<MasterStaffPage />} />
          <Route path="customers"  element={<MasterCustomersPage />} />
          <Route path="invoices"   element={<MasterInvoicesPage />} />
        </Route>

        {/* Franchise Owner / Manager */}
        <Route path="/franchise" element={
          <ProtectedRoute roles={['franchise_owner', 'manager']}><AppLayout /></ProtectedRoute>
        }>
          <Route path="dashboard" element={<FranchiseDashboard />} />
          <Route path="menu"      element={<FranchiseMenuPage />} />
          <Route path="staff"     element={<FranchiseStaffPage />} />
          <Route path="orders"    element={<FranchiseOrdersPage />} />
          <Route path="invoices"  element={<MasterInvoicesPage />} />
        </Route>

        {/* POS — full screen */}
        <Route path="/pos" element={
          <ProtectedRoute roles={['pos_staff', 'shift_operator', 'manager', 'franchise_owner']}>
            <POSScreen />
          </ProtectedRoute>
        } />

        {/* Kitchen — full screen */}
        <Route path="/kitchen" element={
          <ProtectedRoute roles={['kitchen_staff', 'manager', 'franchise_owner']}>
            <KitchenScreen />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
