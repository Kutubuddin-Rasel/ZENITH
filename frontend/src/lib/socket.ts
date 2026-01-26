/* eslint-disable @typescript-eslint/no-explicit-any */
interface ClientSocket {
  on(event: string, listener: (...args: any[]) => void): any;
  off(event: string, listener: (...args: any[]) => void): any;
  emit(event: string, ...args: any[]): any;
  disconnect(): any;
  [key: string]: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

import { wsEndpoint } from './config';

// Define strict type for options
interface SocketConfig {
  auth?: Record<string, unknown>;
  withCredentials?: boolean;
  transports?: string[];
  [key: string]: unknown;
}

let socket: ClientSocket | null = null;

export async function connectSocket(token: string | null, userId?: string) {
  if (socket) return socket;

  const { default: io } = await import('socket.io-client');

  // If using cookies, we don't need to pass token in auth object explicitly, 
  // but we need withCredentials: true.
  // Although, if the cookie is HttpOnly, we CANNOT read it to pass it here.
  // Socket.IO should automatically send cookies if on same domain or withCredentials.
  socket = io(wsEndpoint('/notifications'), {
    auth: {
      // token: token // Removed
    },
    withCredentials: true,
    transports: ['websocket'],
  } as SocketConfig);

  // Authenticate with the notifications gateway
  if (userId && socket) {
    socket.emit('authenticate', userId);
  }

  return socket;
}

export function getSocket() {
  return socket;
}