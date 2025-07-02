import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export interface Epic {
  id: string;
  name: string;
  description?: string;
  status: 'open' | 'closed' | 'archived';
  dueDate?: string;
}

export function useEpics(projectId: string) {
  const { data, isLoading, isError } = useQuery<Epic[]>({
    queryKey: ['epics', projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/epics`),
    enabled: !!projectId,
  });
  return { epics: data, isLoading, isError };
}

export function useCreateEpic(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      apiFetch(`/projects/${projectId}/epics`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['epics', projectId] });
    },
  });
}

export function useUpdateEpic(projectId: string, epicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; description?: string; status?: string }) =>
      apiFetch(`/projects/${projectId}/epics/${epicId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['epics', projectId] });
    },
  });
}

export function useArchiveEpic(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (epicId: string) =>
      apiFetch(`/projects/${projectId}/epics/${epicId}/archive`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['epics', projectId] });
    },
  });
}

export type EpicAttachment = {
  id: string;
  epicId: string;
  uploader: { id: string; name?: string; email: string; avatarUrl?: string };
  filename: string;
  filepath: string;
  createdAt: string;
};

export function useEpicAttachments(projectId: string, epicId: string) {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<EpicAttachment[], Error>({
    queryKey: ['epic-attachments', projectId, epicId],
    queryFn: async () => {
      return apiFetch<EpicAttachment[]>(`/projects/${projectId}/epics/${epicId}/attachments`);
    },
    enabled: !!projectId && !!epicId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/epics/${epicId}/attachments`, {
        method: 'POST',
        body: formData,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<EpicAttachment>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['epic-attachments', projectId, epicId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiFetch<{ message: string }>(`/projects/${projectId}/epics/${epicId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['epic-attachments', projectId, epicId] });
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