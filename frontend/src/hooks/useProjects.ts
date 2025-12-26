import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { useAuth } from '../context/AuthContext';

export interface Project {
  id: string;
  name: string;
  key: string;
  description?: string;
  createdAt?: string;
}

export function useProjects() {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading, isError } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => apiFetch('/projects'),
    enabled: !authLoading && !!user, // Only run query when auth is ready and user is logged in
    staleTime: 1000 * 60 * 1, // 1 minute
    refetchOnWindowFocus: true,
    refetchOnMount: 'always', // Always refetch when component mounts
  });

  const createProject = useMutation({
    mutationFn: (input: { name: string; key: string; description?: string }) =>
      apiFetch<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const deleteProject = useMutation({
    mutationFn: (projectId: string) =>
      apiFetch<{ message: string }>(`/projects/${projectId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const archiveProject = useMutation({
    mutationFn: (projectId: string) =>
      apiFetch<Project>(`/projects/${projectId}/archive`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return {
    projects: data,
    isLoading: isLoading || authLoading, // Show loading while auth is loading
    isError,
    createProject,
    deleteProject,
    archiveProject,
  };
} 