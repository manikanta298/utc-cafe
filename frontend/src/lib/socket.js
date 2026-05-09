import { io } from 'socket.io-client';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'https://utc-cafe.onrender.com').replace(/\/api\/?$/, '').replace(/\/$/, '');

let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(BACKEND_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
    socket.on('connect', () => console.log('Socket connected:', socket.id));
    socket.on('disconnect', (reason) => console.warn('Socket disconnected:', reason));
  }
  return socket;
};

export const joinFranchiseRoom = (franchiseId) => {
  const s = getSocket();
  s.emit('join:franchise', franchiseId);
};

export const joinPOSRoom = (franchiseId) => {
  const s = getSocket();
  s.emit('join:pos', franchiseId);
};

export const joinDisplayRoom = (franchiseId) => {
  const s = getSocket();
  s.emit('join:display', franchiseId);
};

export const joinAdminRoom = () => {
  const s = getSocket();
  s.emit('join:admin');
};
