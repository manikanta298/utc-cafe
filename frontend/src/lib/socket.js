import { io } from 'socket.io-client';

// In dev, Vite proxy handles /socket.io → localhost:5000
// In production set VITE_API_URL=https://utc-cafe.onrender.com
const SOCKET_URL = import.meta.env.VITE_API_URL || 'https://utc-cafe.onrender.com';

let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socket.on('connect', () => console.log('✓ Socket connected:', socket.id));
    socket.on('disconnect', (r) => console.warn('Socket disconnected:', r));
    socket.on('connect_error', (e) => console.error('Socket error:', e.message));
  }
  return socket;
};

export const joinFranchiseRoom = (franchiseId) => {
  if (!franchiseId) return;
  getSocket().emit('join:franchise', franchiseId);
};

export const joinPOSRoom = (franchiseId) => {
  if (!franchiseId) return;
  getSocket().emit('join:pos', franchiseId);
};

export default getSocket;
