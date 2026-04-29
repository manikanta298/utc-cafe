import { create } from 'zustand';
import api from '../lib/api';

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('utc_token') || null,
  loading: false,
  initializing: true,  // true until fetchMe resolves — prevents flash redirect to /login
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('utc_token', data.token);
      api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
      set({ user: data.user, token: data.token, loading: false });
      // Return user so LoginPage can navigate immediately without waiting
      return { success: true, user: data.user };
    } catch (err) {
      // Use custom user-friendly message if available (from API interceptor)
      const msg = err.userMessage || 
                  err.response?.data?.message || 
                  err.message ||
                  'Login failed. Please try again.';
      
      console.error('[Auth] Login error:', err);
      set({ error: msg, loading: false });
      return { success: false, message: msg };
    }
  },

  logout: () => {
    localStorage.removeItem('utc_token');
    delete api.defaults.headers.common['Authorization'];
    set({ user: null, token: null, initializing: false });
  },

  fetchMe: async () => {
    const token = get().token;
    if (!token) {
      set({ initializing: false });
      return;
    }
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data.user, initializing: false });
    } catch {
      get().logout();
      set({ initializing: false });
    }
  },
}));

export default useAuthStore;

