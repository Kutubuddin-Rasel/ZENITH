import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/fetcher';

export interface ProjectAttachment {
  id: string;
  projectId: string;
  uploaderId: string;
  filename: string;
  filepath: string;
  originalName?: string;
  fileSize?: number;
  mimeType?: string;
  createdAt: string;
  uploader?: {
    id: string;
    name: string;
    email: string;
  };
}

export function useProjectAttachments(projectId: string) {
  return useQuery({
    queryKey: ['project-attachments', projectId],
    queryFn: () => apiFetch<ProjectAttachment[]>(`/projects/${projectId}/attachments`),
    enabled: !!projectId,
  });
}

export function useUploadProjectAttachment(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/attachments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload file');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-attachments', projectId] });
    },
  });
}

export function useDeleteProjectAttachment(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiFetch(`/projects/${projectId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-attachments', projectId] });
    },
  });
}

export function useDownloadProjectAttachment(projectId: string) {
  return useMutation({
    mutationFn: async (attachment: ProjectAttachment) => {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/attachments/${attachment.id}/download`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to download file');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.originalName || attachment.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return { success: true };
    },
  });
} 