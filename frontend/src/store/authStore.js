import { create } from 'zustand';
import api from '../lib/api';

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('utc_token') || null,
  loading: false,
  initializing: true,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('utc_token', data.token);
      // SECURITY: refresh token is never in the response body — it lives
      // only in the HttpOnly cookie the browser stores automatically.
      api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
      set({ user: data.user, token: data.token, loading: false });
      return { success: true, user: data.user };
    } catch (err) {
      const msg =
        err.userMessage ||
        err.response?.data?.message ||
        err.message ||
        'Login failed. Please try again.';

      set({ error: msg, loading: false });
      return { success: false, message: msg };
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout', {}, { timeout: 3000 });
    } catch {
      // Ignore logout network errors — clear local state regardless.
    }
    localStorage.removeItem('utc_token');
    delete api.defaults.headers.common.Authorization;
    set({ user: null, token: null, initializing: false });
  },

  refreshSession: async () => {
    try {
      // Refresh token cookie is sent automatically (withCredentials: true).
      const { data } = await api.post('/auth/refresh');
      localStorage.setItem('utc_token', data.token);
      api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
      set({ user: data.user, token: data.token });
      return data.token;
    } catch {
      await get().logout();
      return null;
    }
  },

  fetchMe: async () => {
    const token = get().token;
    if (!token) {
      set({ initializing: false });
      return;
    }

    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data.user, initializing: false });
    } catch (err) {
      if (err.response?.status === 401) {
        const refreshedToken = await get().refreshSession();
        if (refreshedToken) {
          const { data } = await api.get('/auth/me');
          set({ user: data.user, initializing: false });
          return;
        }
      }

      await get().logout();
      set({ initializing: false });
    }
  },
}));

export default useAuthStore;
