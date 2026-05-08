import axios from 'axios';

const API_ROOT = '/api';

const normalizeBackendUrl = (url) => {
  const trimmed = (url || 'https://utc-cafe.onrender.com').replace(/\/+$/, '');
  return trimmed.endsWith(API_ROOT) ? trimmed : `${trimmed}${API_ROOT}`;
};

const BACKEND_URL = normalizeBackendUrl(import.meta.env.VITE_BACKEND_URL);

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const MAX_RETRIES = 3;
let refreshPromise = null;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('utc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && err.config && !err.config.__isRetryRequest) {
      const isRefreshRoute = err.config.url?.includes('/auth/refresh');
      if (!isRefreshRoute) {
        try {
          refreshPromise = refreshPromise || api.post('/auth/refresh');
          const { data } = await refreshPromise;
          localStorage.setItem('utc_token', data.token);
          refreshPromise = null;
          err.config.__isRetryRequest = true;
          err.config.headers.Authorization = `Bearer ${data.token}`;
          return api(err.config);
        } catch (refreshErr) {
          refreshPromise = null;
        }
      }

      localStorage.removeItem('utc_token');
      window.location.href = '/login';
      return Promise.reject(err);
    }

    if (!err.response && err.config) {
      err.config.__retryCount = (err.config.__retryCount || 0) + 1;

      if (err.config.__retryCount > MAX_RETRIES) {
        return Promise.reject(err);
      }

      const delay = 2 ** (err.config.__retryCount - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return api(err.config);
    }

    if (!err.response) {
      if (err.code === 'ECONNABORTED' || err.code === 'ENOTFOUND') {
        err.userMessage = 'Unable to connect to server. Please check your internet connection.';
      } else if (err.message.includes('ERR_FAILED')) {
        err.userMessage = 'Network request failed. The server may be unavailable.';
      } else {
        err.userMessage = `Network error: ${err.message || 'Unknown error'}`;
      }
    }

    return Promise.reject(err);
  }
);

export default api;
