import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

// == Interfaces ==
export interface Component {
  id: string;
  name: string;
  projectId: string;
}

export interface Label {
  id: string;
  name: string;
  projectId: string;
}

// == Components ==
export function useComponents(projectId: string) {
  return useQuery<Component[]>({
    queryKey: ['components', projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/components`),
    enabled: !!projectId,
  });
}

export function useCreateComponent(projectId:string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) =>
      apiFetch(`/projects/${projectId}/components`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['components', projectId] });
    },
  });
}

export function useUpdateComponent(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string, name: string }) =>
      apiFetch(`/projects/${projectId}/components/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: data.name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['components', projectId] });
    },
  });
}

export function useDeleteComponent(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/projects/${projectId}/components/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['components', projectId] });
    },
  });
}

// == Labels ==
export function useLabels(projectId: string) {
    return useQuery<Label[]>({
      queryKey: ['labels', projectId],
      queryFn: () => apiFetch(`/projects/${projectId}/labels`),
      enabled: !!projectId,
    });
  }

export function useCreateLabel(projectId:string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) =>
      apiFetch(`/projects/${projectId}/labels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', projectId] });
    },
  });
}

export function useUpdateLabel(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string, name: string }) =>
      apiFetch(`/projects/${projectId}/labels/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: data.name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', projectId] });
    },
  });
}

export function useDeleteLabel(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/projects/${projectId}/labels/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', projectId] });
    },
  });
}

// == Combined Taxonomy Hook ==
export function useTaxonomy(projectId: string) {
  const components = useComponents(projectId);
  const labels = useLabels(projectId);
  return { components, labels };
}