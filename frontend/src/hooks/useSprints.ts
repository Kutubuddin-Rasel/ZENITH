import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export interface Sprint {
  id: string;
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}

export function useSprints(projectId: string) {
  const { data, isLoading, isError } = useQuery<Sprint[]>({
    queryKey: ['sprints', projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/sprints`),
    enabled: !!projectId,
  });
  return { sprints: data, isLoading, isError };
}

export function useCreateSprint(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; goal?: string; startDate?: string; endDate?: string }) =>
      apiFetch(`/projects/${projectId}/sprints`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', projectId] });
    },
  });
}

export function useUpdateSprint(projectId: string, sprintId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; goal?: string; startDate?: string; endDate?: string; status?: string }) =>
      apiFetch(`/projects/${projectId}/sprints/${sprintId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', projectId] });
    },
  });
}

export function useArchiveSprint(projectId: string, sprintId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nextSprintId?: string) =>
      apiFetch(`/projects/${projectId}/sprints/${sprintId}/archive`, {
        method: 'PATCH',
        body: JSON.stringify(nextSprintId ? { nextSprintId } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', projectId] });
    },
  });
}

export function useActiveSprint(projectId: string) {
  const { data, isLoading, isError } = useQuery<Sprint[]>({
    queryKey: ['active-sprint', projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/sprints?active=true`),
    enabled: !!projectId,
  });
  return {
    activeSprint: data && data.length > 0 ? data[0] : null,
    isLoading,
    isError,
  };
}

export function useStartSprint(projectId: string, sprintId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/projects/${projectId}/sprints/${sprintId}/start`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', projectId] });
    },
  });
}

export type SprintAttachment = {
  id: string;
  sprintId: string;
  uploader: { id: string; name?: string; email: string; avatarUrl?: string };
  filename: string;
  filepath: string;
  createdAt: string;
};

export function useSprintAttachments(projectId: string, sprintId: string) {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<SprintAttachment[], Error>({
    queryKey: ['sprint-attachments', projectId, sprintId],
    queryFn: async () => {
      return apiFetch<SprintAttachment[]>(`/projects/${projectId}/sprints/${sprintId}/attachments`);
    },
    enabled: !!projectId && !!sprintId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/sprints/${sprintId}/attachments`, {
        method: 'POST',
        body: formData,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<SprintAttachment>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint-attachments', projectId, sprintId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiFetch<{ message: string }>(`/projects/${projectId}/sprints/${sprintId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint-attachments', projectId, sprintId] });
    },
  });

  return {
    attachments: data,
    isLoading,
    isError,
    error,
    refetch,
    uploadAttachment: uploadMutation.mutateAsync,
    isUploading: uploadMutation.status === 'pending',
    uploadError: uploadMutation.error,
    deleteAttachment: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.status === 'pending',
    deleteError: deleteMutation.error,
  };
} 