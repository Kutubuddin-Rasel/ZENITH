import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import { Issue } from './useProjectIssues';

export function useReleaseIssues(projectId: string, releaseId: string) {
  const { data, isLoading, isError } = useQuery<Issue[]>({
    queryKey: ['release-issues', projectId, releaseId],
    queryFn: () => apiFetch(`/projects/${projectId}/releases/${releaseId}/issues`),
    enabled: !!projectId && !!releaseId,
  });
  return { issues: data, isLoading, isError };
}

export function useAssignIssueToRelease(projectId: string, releaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (issueId: string) =>
      apiFetch(`/projects/${projectId}/releases/${releaseId}/issues`, {
        method: 'POST',
        body: JSON.stringify({ issueId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release-issues', projectId, releaseId] });
    },
  });
}

export function useUnassignIssueFromRelease(projectId: string, releaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (issueId: string) =>
      apiFetch(`/projects/${projectId}/releases/${releaseId}/issues/unassign`, {
        method: 'POST',
        body: JSON.stringify({ issueId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release-issues', projectId, releaseId] });
    },
  });
}

export type ReleaseAttachment = {
  id: string;
  releaseId: string;
  uploader: { id: string; name?: string; email: string; avatarUrl?: string };
  filename: string;
  filepath: string;
  createdAt: string;
};

export function useReleaseAttachments(projectId: string, releaseId: string) {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ReleaseAttachment[], Error>({
    queryKey: ['release-attachments', projectId, releaseId],
    queryFn: async () => {
      return apiFetch<ReleaseAttachment[]>(`/projects/${projectId}/releases/${releaseId}/attachments`);
    },
    enabled: !!projectId && !!releaseId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/releases/${releaseId}/attachments`, {
        method: 'POST',
        body: formData,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<ReleaseAttachment>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release-attachments', projectId, releaseId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiFetch<{ message: string }>(`/projects/${projectId}/releases/${releaseId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release-attachments', projectId, releaseId] });
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