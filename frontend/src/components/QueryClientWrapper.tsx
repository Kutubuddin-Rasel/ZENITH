"use client";
import { ReactNode, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createIDBPersister } from '@/lib/idb-persister';

interface QueryClientWrapperProps {
  children: ReactNode;
}

const CACHE_VERSION = 'v1'; // Bump this to invalidate old caches

export default function QueryClientWrapper({ children }: QueryClientWrapperProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes (Linear-grade aggression)
        gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days (Persistence duration)
        refetchOnWindowFocus: true, // Keep false? No, true is better for "alive" feel but persistence handles the offline part. Let's stick to default or smart. True is standard.
        retry: 1,
      },
    },
  }));

  const [persister] = useState(() => createIDBPersister());

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 Days
        buster: CACHE_VERSION,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const queryKey = query.queryKey;
            // Only persist core entities. Don't persist errors or transient search results.
            // Whitelist-ish approach based on key prefix
            const keyString = String(queryKey[0]);
            return ['projects', 'issues', 'sprints', 'user', 'dashboard', 'workspace'].includes(keyString);
          }
        }
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
} 