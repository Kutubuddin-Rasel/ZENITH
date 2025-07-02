import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

export interface Label {
  id: string;
  name: string;
  color?: string;
}

export type IssueType = 'Epic' | 'Story' | 'Task' | 'Bug' | 'Sub-task';

export interface Issue {
  id: string;
  key: string;
  title: string;
  type: IssueType;
  status: string;
  assigneeId?: string;
  assignee?: { id: string; name: string; email: string; avatarUrl?: string } | null;
  storyPoints?: number;
  priority: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
  labels?: Label[];
  createdAt: string;
  updatedAt: string;
  description?: string;
  parentId?: string;
  parent?: Issue | null;
  children?: Issue[];
  boardPosition?: number;
}

export interface IssueFilters {
  search?: string;
  status?: string;
  assigneeId?: string;
  label?: string;
  sprint?: string;
  sort?: string;
}

export function useProjectIssues(projectId: string, filters?: IssueFilters) {
  const queryKey = ['project-issues', projectId, filters];

  const { data, isLoading, isError } = useQuery<Issue[]>({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value) {
            params.append(key, value);
          }
        });
      }
      const queryString = params.toString();
      return apiFetch(`/projects/${projectId}/issues${queryString ? `?${queryString}` : ''}`);
    },
    enabled: !!projectId,
  });
  return { issues: data, isLoading, isError };
}

export type IssueComment = {
  id: string;
  author: { id: string; name?: string; email: string; avatarUrl?: string };
  content: string;
  createdAt: string;
};

export function useIssueComments(projectId: string, issueId: string) {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<IssueComment[], Error>({
    queryKey: ['comments', projectId, issueId],
    queryFn: async () => {
      return apiFetch<IssueComment[]>(`/projects/${projectId}/issues/${issueId}/comments`);
    },
    enabled: !!projectId && !!issueId,
  });

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      return apiFetch<IssueComment>(`/projects/${projectId}/issues/${issueId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', projectId, issueId] });
    },
  });

  return {
    comments: data,
    isLoading,
    isError,
    error,
    refetch,
    addComment: mutation.mutateAsync,
    isAdding: mutation.status === 'pending',
    addError: mutation.error,
  };
}

export function useUpdateComment(projectId: string, issueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      return apiFetch<IssueComment>(`/projects/${projectId}/issues/${issueId}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', projectId, issueId] });
    },
  });
}

export function useDeleteComment(projectId: string, issueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      return apiFetch<{ message: string }>(`/projects/${projectId}/issues/${issueId}/comments/${commentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', projectId, issueId] });
    },
  });
}

export type IssueAttachment = {
  id: string;
  issueId: string;
  uploader: { id: string; name?: string; email: string; avatarUrl?: string };
  filename: string;
  filepath: string;
  createdAt: string;
};

export function useIssueAttachments(projectId: string, issueId: string) {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<IssueAttachment[], Error>({
    queryKey: ['attachments', projectId, issueId],
    queryFn: async () => {
      return apiFetch<IssueAttachment[]>(`/projects/${projectId}/issues/${issueId}/attachments`);
    },
    enabled: !!projectId && !!issueId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/issues/${issueId}/attachments`, {
        method: 'POST',
        body: formData,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<IssueAttachment>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', projectId, issueId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiFetch<{ message: string }>(`/projects/${projectId}/issues/${issueId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', projectId, issueId] });
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

export type IssueRevision = {
  id: string;
  entityType: 'Issue';
  entityId: string;
  snapshot: Record<string, unknown>;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changedBy: string;
  createdAt: string;
};

export function useIssueHistory(issueId: string) {
  return useQuery<IssueRevision[], Error>({
    queryKey: ['issue-history', issueId],
    queryFn: async () => {
      return apiFetch<IssueRevision[]>(`/revisions/Issue/${issueId}`);
    },
    enabled: !!issueId,
  });
}

export type CommentAttachment = {
  id: string;
  commentId: string;
  uploader: { id: string; name?: string; email: string; avatarUrl?: string };
  filename: string;
  filepath: string;
  createdAt: string;
};

export function useCommentAttachments(projectId: string, issueId: string, commentId: string) {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CommentAttachment[], Error>({
    queryKey: ['comment-attachments', projectId, issueId, commentId],
    queryFn: async () => {
      return apiFetch<CommentAttachment[]>(`/projects/${projectId}/issues/${issueId}/comments/${commentId}/attachments`);
    },
    enabled: !!projectId && !!issueId && !!commentId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/issues/${issueId}/comments/${commentId}/attachments`, {
        method: 'POST',
        body: formData,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<CommentAttachment>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comment-attachments', projectId, issueId, commentId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiFetch<{ message: string }>(`/projects/${projectId}/issues/${issueId}/comments/${commentId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comment-attachments', projectId, issueId, commentId] });
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

export function useUpdateIssue(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ issueId, data }: { issueId: string, data: Partial<Omit<Issue, 'id'>> }) => {
      return apiFetch<Issue>(`/projects/${projectId}/issues/${issueId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['project-issues', projectId],
        exact: false 
      });
      queryClient.invalidateQueries({ queryKey: ['issue-details', variables.issueId] });
    },
  });
}

export type IssueWorkLog = {
  id: string;
  user: { id: string; name?: string; email: string; avatarUrl?: string };
  minutesSpent: number;
  note?: string;
  createdAt: string;
};

export function useIssueWorkLogs(projectId: string, issueId: string) {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<IssueWorkLog[], Error>({
    queryKey: ['worklogs', projectId, issueId],
    queryFn: async () => {
      return apiFetch<IssueWorkLog[]>(`/projects/${projectId}/issues/${issueId}/worklogs`);
    },
    enabled: !!projectId && !!issueId,
  });

  const addMutation = useMutation({
    mutationFn: async (input: { minutesSpent: number; note?: string }) => {
      return apiFetch<IssueWorkLog>(`/projects/${projectId}/issues/${issueId}/worklogs`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklogs', projectId, issueId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (workLogId: string) => {
      return apiFetch<{ message: string }>(`/projects/${projectId}/issues/${issueId}/worklogs/${workLogId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklogs', projectId, issueId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ workLogId, input }: { workLogId: string; input: { minutesSpent?: number; note?: string } }) => {
      return apiFetch<IssueWorkLog>(`/projects/${projectId}/issues/${issueId}/worklogs/${workLogId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklogs', projectId, issueId] });
    },
  });

  return {
    workLogs: data,
    isLoading,
    isError,
    error,
    refetch,
    addWorkLog: addMutation.mutateAsync,
    isAdding: addMutation.status === 'pending',
    addError: addMutation.error,
    deleteWorkLog: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.status === 'pending',
    deleteError: deleteMutation.error,
    updateWorkLog: updateMutation.mutateAsync,
    isUpdating: updateMutation.status === 'pending',
    updateError: updateMutation.error,
  };
} 