import { Navigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';

const ROLE_HOME = {
  master_admin:    '/master/dashboard',
  franchise_owner: '/franchise/dashboard',
  manager:         '/franchise/dashboard',
  pos_staff:       '/pos',
  shift_operator:  '/pos',
  kitchen_staff:   '/kitchen',
};

export default function ProtectedRoute({ children, roles = [] }) {
  const { user, token, initializing } = useAuthStore();

  // Still checking session — App.jsx already shows spinner, but guard here too
  if (initializing) return null;

  // No token at all → login
  if (!token) return <Navigate to="/login" replace />;

  // Token present but user not loaded yet (edge case)
  if (!user) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Wrong role → redirect to their own home
  if (roles.length && !roles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />;
  }

  return children;
}
