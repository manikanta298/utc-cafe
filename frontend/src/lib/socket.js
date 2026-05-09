import { io } from 'socket.io-client';

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

export const joinKitchenRoom = (franchiseId) => {
  if (!franchiseId) return;
  getSocket().emit('join:kitchen', franchiseId);
};

export const joinDisplayRoom = (franchiseId) => {
  if (!franchiseId) return;
  getSocket().emit('join:display', franchiseId);
};

export default getSocket;
