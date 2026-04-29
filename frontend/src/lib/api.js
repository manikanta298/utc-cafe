import axios from 'axios';

// Use environment variable or fallback to production URL
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://utc-cafe.onrender.com';

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request counter for retry logic
let requestCount = 0;
const MAX_RETRIES = 3;

// Attach token on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('utc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  requestCount++;
  return config;
});

// Enhanced error handler with retry logic
api.interceptors.response.use(
  (res) => {
    requestCount--;
    return res;
  },
  async (err) => {
    requestCount--;
    
    // Handle 401 Unauthorized
    if (err.response?.status === 401) {
      localStorage.removeItem('utc_token');
      window.location.href = '/login';
      return Promise.reject(err);
    }

    // Retry logic for network errors (ECONNABORTED, ENOTFOUND, ERR_FAILED)
    if (!err.response && err.config && requestCount < MAX_RETRIES) {
      err.config.__retryCount = (err.config.__retryCount || 0) + 1;
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, err.config.__retryCount - 1) * 1000;
      
      console.warn(
        `[API] Network error on ${err.config.method?.toUpperCase()} ${err.config.url}. ` +
        `Retrying in ${delay}ms... (Attempt ${err.config.__retryCount}/${MAX_RETRIES})`
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return api(err.config);
    }

    // Enhanced error logging
    if (!err.response) {
      console.error('[API] Network Error:', {
        message: err.message,
        code: err.code,
        url: err.config?.url,
        method: err.config?.method,
      });
      
      // Create user-friendly error message
      if (err.code === 'ECONNABORTED' || err.code === 'ENOTFOUND') {
        err.userMessage = 'Unable to connect to server. Please check your internet connection.';
      } else if (err.message.includes('ERR_FAILED')) {
        err.userMessage = 'Network request failed. The server may be unavailable.';
      } else {
        err.userMessage = 'Network error: ' + (err.message || 'Unknown error');
      }
    }

    return Promise.reject(err);
  }
);

export default api;
