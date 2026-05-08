import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coffee, Eye, EyeOff, LogIn } from 'lucide-react';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

const ROLE_HOME = {
  master_admin: '/master/dashboard',
  franchise_owner: '/franchise/dashboard',
  manager: '/franchise/dashboard',
  pos_staff: '/pos',
  pos_shift_operator: '/pos',
  shift_operator: '/pos',
  kitchen_staff: '/kitchen',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(email, password);
    if (result.success) {
      toast.success(`Welcome back, ${result.user.name}!`);
      // Use role from returned user object — store is already set at this point
      navigate(ROLE_HOME[result.user.role] || '/login');
    } else {
      toast.error(result.message);
    }
  };

  const quickFill = (email, pass) => { setEmail(email); setPassword(pass); };

  return (
    <div className="login-bg min-h-screen flex items-center justify-center p-4">
      {/* Decorative background rings */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-brand-600/5 rounded-full blur-2xl" />
      </div>

      <div className="w-full max-w-md animate-fade-in relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-500 rounded-2xl mb-4 shadow-lg shadow-brand-500/30">
            <Coffee size={32} className="text-white" />
          </div>
          <h1 className="font-display text-4xl font-bold text-white tracking-tight">UTC Café</h1>
          <p className="text-gray-500 mt-1 text-sm">Unified Café Technology Platform</p>
        </div>

        {/* Card */}
        <div className="card p-8 shadow-2xl">
          <h2 className="font-display text-xl font-semibold text-white mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                className="input"
                placeholder="you@utccafe.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input pr-11"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><LogIn size={18} /> Sign In</>
              )}
            </button>
          </form>

          {/* Quick access demo logins */}
          <div className="mt-8 pt-6 border-t border-dark-500">
            <p className="text-xs text-gray-600 text-center mb-3">Quick access — Demo accounts</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Master Admin', e: 'admin@utccafe.com', p: 'Admin@1234', color: 'text-purple-400' },
                { label: 'Franchise Owner', e: 'raj@utccafe.com', p: 'Owner@1234', color: 'text-blue-400' },
                { label: 'POS Staff', e: 'pos1@utccafe.com', p: 'Staff@1234', color: 'text-green-400' },
                { label: 'Kitchen Staff', e: 'kitchen1@utccafe.com', p: 'Staff@1234', color: 'text-orange-400' },
              ].map(({ label, e, p, color }) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => quickFill(e, p)}
                  className="bg-dark-700 hover:bg-dark-600 border border-dark-500 rounded-lg px-3 py-2 text-xs text-left transition-colors"
                >
                  <div className={`font-semibold ${color}`}>{label}</div>
                  <div className="text-gray-600 truncate">{e}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-gray-700 text-xs mt-6">
          © 2025 UTC — Unified Café Technology. All rights reserved.
        </p>
      </div>
    </div>
  );
}
