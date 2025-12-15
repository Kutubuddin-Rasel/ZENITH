"use client";
import { ReactNode, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createIDBPersister } from '@/lib/idb-persister';

interface QueryClientWrapperProps {
  children: ReactNode;
}

const CACHE_VERSION = 'v2'; // Bumped to fix rehydration errors with persisted pending queries

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
            // Don't persist pending or failed queries - they cause rehydration issues
            if (query.state.status !== 'success') {
              return false;
            }

            const queryKey = query.queryKey;
            const keyString = String(queryKey[0]);

            // Whitelist-ish approach based on key prefix
            const allowedPrefixes = ['projects', 'issues', 'sprints', 'user', 'dashboard', 'workspace'];

            // Exclude sensitive sub-queries that require authentication
            // These cause 403 errors during rehydration before login
            const keyPath = queryKey.join('/');
            if (keyPath.includes('invites') || keyPath.includes('members')) {
              return false;
            }

            return allowedPrefixes.includes(keyString);
          }
        }
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
} 