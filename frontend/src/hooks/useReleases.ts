import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export interface Release {
  id: string;
  name: string;
  releaseDate?: string;
  status: 'upcoming' | 'released' | 'archived';
  description?: string;
}

export function useReleases(projectId: string) {
  const { data, isLoading, isError } = useQuery<Release[]>({
    queryKey: ['releases', projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/releases`),
    enabled: !!projectId,
  });
  return { releases: data, isLoading, isError };
}

export function useCreateRelease(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; releaseDate?: string; description?: string }) =>
      apiFetch(`/projects/${projectId}/releases`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['releases', projectId] });
    },
  });
}

export function useUpdateRelease(projectId: string, releaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; releaseDate?: string; status?: string; description?: string }) =>
      apiFetch(`/projects/${projectId}/releases/${releaseId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['releases', projectId] });
    },
  });
}

export function useArchiveRelease(projectId: string, releaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/projects/${projectId}/releases/${releaseId}/archive`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['releases', projectId] });
    },
  });
}

// Generate release notes from linked issues
export function useGenerateReleaseNotes(projectId: string, releaseId: string) {
  return useQuery<{ notes: string; issueCount: number }>({
    queryKey: ['release-notes-preview', projectId, releaseId],
    queryFn: () => apiFetch(`/projects/${projectId}/releases/${releaseId}/generate-notes`),
    enabled: !!projectId && !!releaseId,
  });
}

// Generate and save release notes to description
export function useSaveGeneratedReleaseNotes(projectId: string, releaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/projects/${projectId}/releases/${releaseId}/generate-notes`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['releases', projectId] });
      queryClient.invalidateQueries({ queryKey: ['release-notes-preview', projectId, releaseId] });
    },
  });
}
