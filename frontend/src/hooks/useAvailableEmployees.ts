import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';

interface AvailableEmployee {
  id: string;
  name: string;
  email: string;
  defaultRole?: string;
  isActive: boolean;
}

export function useAvailableEmployees() {
  return useQuery<AvailableEmployee[]>({
    queryKey: ['available-employees'],
    queryFn: () => apiFetch('/users/available'),
  });
}
