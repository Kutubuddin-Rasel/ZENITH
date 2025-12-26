import { useState, useEffect } from 'react';

/**
 * Client-side timezone detection hook
 * Returns 'UTC' on server, then updates to detected timezone on client
 * This prevents hydration mismatch since Intl is not available on server
 */
export function useDetectedTimezone(): string {
    const [timezone, setTimezone] = useState('UTC');

    useEffect(() => {
        // Only runs on client
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setTimezone(detected);
    }, []);

    return timezone;
}
