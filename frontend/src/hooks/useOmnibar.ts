import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface SearchResult {
    issues: { id: string; title: string; key: string }[];
    projects: { id: string; name: string }[];
    users: { id: string; name: string }[];
}

export function useOmnibar(query: string) {
    return useQuery({
        queryKey: ['search', query],
        queryFn: () => apiClient.get<SearchResult>(`/search`, { params: { q: query } }),
        enabled: query.length >= 2,
        staleTime: 60 * 1000, // Cache results for 1 minute
        // Don't retry search queries aggressively
        retry: 0,
    });
}
