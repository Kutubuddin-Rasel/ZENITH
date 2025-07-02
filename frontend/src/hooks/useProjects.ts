import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { useAuth } from '../context/AuthContext';

export interface Project {
  id: string;
  name: string;
  key: string;
  description?: string;
}

export function useProjects() {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  
  const { data, isLoading, isError } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => apiFetch('/projects'),
    enabled: !authLoading && !!user, // Only run query when auth is ready and user is logged in
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

  return {
    projects: data,
    isLoading: isLoading || authLoading, // Show loading while auth is loading
    isError,
    createProject,
  };
} 