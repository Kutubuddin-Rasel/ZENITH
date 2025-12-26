import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { Project } from './useProjects';
import { useAuth } from '../context/AuthContext';

export function useProject(id: string) {
  const { user } = useAuth();
  const { data: project, isLoading, isError } = useQuery<Project>({
    queryKey: ['project', id],
    queryFn: () => apiFetch(`/projects/${id}`),
    enabled: !!id,
  });
  const { data: members } = useQuery<{ userId: string; roleName: string }[]>({
    queryKey: ['project-members', id],
    queryFn: () => apiFetch(`/projects/${id}/members`),
    enabled: !!id,
  });
  const currentUserRole = user && members ? members.find(m => m.userId === user.id)?.roleName : undefined;
  return { project, isLoading, isError, currentUserRole };
}

export type ProjectSummary = {
  projectId: string;
  projectName: string;
  totalIssues: number;
  doneIssues: number;
  percentDone: number;
  statusCounts: Record<string, number>;
};

export function useProjectSummary(id: string) {
  return useQuery<ProjectSummary, Error>({
    queryKey: ['project-summary', id],
    queryFn: () => apiFetch(`/projects/${id}/summary`),
    enabled: !!id,
    staleTime: 0, // Always consider data stale
    refetchOnMount: 'always', // Refetch when component mounts
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      return apiFetch(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
  });
}

export function useArchiveProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return apiFetch(`/projects/${id}/archive`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
  });
}

export type ProjectMember = {
  userId: string;
  roleName: string;
  user?: { id: string; name?: string; email: string; avatarUrl?: string; defaultRole?: string };
};

export function useProjectMembers(id: string) {
  return useQuery<ProjectMember[], Error>({
    queryKey: ['project-members', id],
    queryFn: () => apiFetch(`/projects/${id}/members`),
    enabled: !!id,
  });
}

export function useRemoveProjectMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      return apiFetch(`/projects/${id}/members/${userId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-members', id] });
    },
  });
}

export function useUpdateProjectMemberRole(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; roleName: string }) => {
      return apiFetch(`/projects/${id}/members/${input.userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ roleName: input.roleName }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-members', id] });
    },
  });
}

export function useAddProjectMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; roleName: string }) => {
      return apiFetch(`/projects/${id}/members`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-members', id] });
    },
  });
} 