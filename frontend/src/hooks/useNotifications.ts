import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export interface Notification {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'error' | 'warning';
  read: boolean;
  createdAt: string;
  link?: string;
  context?: {
    projectId: string;
    issueId?: string;
    inviteId?: string;
  };
}

export function useNotifications() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => apiFetch('/notifications/all'),
    staleTime: 0, // Always consider data stale
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnMount: true, // Refetch when component mounts
  });

  const markAsRead = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: () =>
      apiFetch('/notifications/read/all', { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Force refresh function
  const forceRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    refetch();
  };

  return {
    notifications: data,
    isLoading,
    isError,
    markAsRead,
    markAllAsRead,
    forceRefresh,
    refetch
  };
}

export function useProjectNotifications(projectId: string) {
  const { notifications, isLoading, isError, markAsRead, markAllAsRead, forceRefresh, refetch } = useNotifications();
  const filtered = notifications?.filter(n => n.context?.projectId === projectId) || [];
  return {
    notifications: filtered,
    isLoading,
    isError,
    markAsRead,
    markAllAsRead,
    forceRefresh,
    refetch
  };
} 