import axios from 'axios';

const api = axios.create({
  baseURL: 'https://utc-cafe.onrender.com/api',
  timeout: 15000,
});

// Attach token on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('utc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global error handler
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('utc_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
