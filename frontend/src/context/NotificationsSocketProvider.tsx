"use client";
import React, { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { useToast } from './ToastContext';
import { useQueryClient } from '@tanstack/react-query';

interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  [key: string]: unknown;
}

export function NotificationsSocketProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    
    const notificationHandler = (notification: { message: string; type?: 'info' | 'success' | 'error' }) => {
      // Show a toast as a subtle indicator
      showToast(notification.message, notification.type);
      // Invalidate the query to refetch and update UI components
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    const deletionHandler = (data: { notificationIds: string[] }) => {
      console.log('🗑️ Received notification deletion event:', data);
      // Invalidate the query to refetch and update UI components
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    const updateHandler = (notification: Notification) => {
      console.log('🔄 Received notification update event:', notification);
      // Invalidate the query to refetch and update UI components
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    if (socket) {
      socket.on('notification', notificationHandler);
      socket.on('notification_deleted', deletionHandler);
      socket.on('notification_updated', updateHandler);
    }
    
    return () => {
      if (socket) {
        socket.off('notification', notificationHandler);
        socket.off('notification_deleted', deletionHandler);
        socket.off('notification_updated', updateHandler);
      }
    };
  }, [showToast, queryClient]);

  return <>{children}</>;
} 