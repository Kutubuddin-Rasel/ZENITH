import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export interface Story {
  id: string;
  title: string;
  status: string;
  // ...other fields
}

export function useEpicStories(projectId: string, epicId: string) {
  const { data, isLoading, isError } = useQuery<Story[]>({
    queryKey: ['epic-stories', projectId, epicId],
    queryFn: () => apiFetch(`/projects/${projectId}/epics/${epicId}/stories`),
    enabled: !!projectId && !!epicId,
  });
  return { stories: data, isLoading, isError };
}

export function useAssignStoryToEpic(projectId: string, epicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storyId: string) =>
      apiFetch(`/projects/${projectId}/epics/${epicId}/stories`, {
        method: 'POST',
        body: JSON.stringify({ storyId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['epic-stories', projectId, epicId] });
    },
  });
}

export function useUnassignStoryFromEpic(projectId: string, epicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storyId: string) =>
      apiFetch(`/projects/${projectId}/epics/${epicId}/stories/unassign`, {
        method: 'POST',
        body: JSON.stringify({ storyId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['epic-stories', projectId, epicId] });
    },
  });
} 