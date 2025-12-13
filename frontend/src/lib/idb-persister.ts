import { get, set, del } from 'idb-keyval';
import { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

/**
 * Creates an IndexedDB persister for React Query using idb-keyval.
 * This is preferred over localStorage because it is asynchronous and handles
 * much larger data sets (necessary for full project boards).
 */
export function createIDBPersister(idbValidKey: IDBValidKey = "reactQueryClient"): Persister {
    return {
        persistClient: async (client: PersistedClient) => {
            try {
                // Try saving directly (supports Date, RegExp, etc.)
                await set(idbValidKey, client);
            } catch (error) {
                // Check if it's a DataCloneError (often caused by Promises or Functions leaking into state)
                if (error instanceof DOMException && error.name === 'DataCloneError') {
                    try {
                        // Fallback: Sanitize via JSON to strip non-cloneable values
                        const sanitized = JSON.parse(JSON.stringify(client));
                        await set(idbValidKey, sanitized);
                        // console.warn('Persisted cache using JSON sanitization due to DataCloneError');
                    } catch (jsonError) {
                        console.error('Failed to stick cache to IndexedDB (even sanitized):', jsonError);
                    }
                } else {
                    console.error('Failed to stick cache to IndexedDB:', error);
                }
            }
        },
        restoreClient: async () => {
            try {
                return await get<PersistedClient>(idbValidKey);
            } catch (error) {
                console.error('Failed to restore cache from IndexedDB:', error);
                return undefined;
            }
        },
        removeClient: async () => {
            await del(idbValidKey);
        },
    };
}
