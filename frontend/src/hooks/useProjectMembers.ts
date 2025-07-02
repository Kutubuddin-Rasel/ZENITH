import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/fetcher';

interface ProjectMember {
  userId: string;
  role: string;
  user: {
    id: string;
    name: string;
    email: string;
    defaultRole?: string;
  };
}

export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async (): Promise<ProjectMember[]> => {
      if (!projectId) return [];
      return await apiFetch<ProjectMember[]>(`/projects/${projectId}/members`);
    },
    enabled: !!projectId,
  });
} 