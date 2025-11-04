import io from 'socket.io-client';

let socket: ReturnType<typeof io> | null = null;

export function connectSocket(token: string, userId?: string) {
  socket = io(`http://localhost:3000/notifications`, {
    auth: { token },
    transports: ['websocket'],
  });
  
  // Authenticate with the notifications gateway
  if (userId) {
    socket.emit('authenticate', userId);
  }
  
  return socket;
}

export function getSocket() {
  return socket;
} 