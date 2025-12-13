import { useEffect, useState } from 'react';

/**
 * Standard Debounce Hook
 * @param value value to debounce
 * @param delay delay in ms
 * @returns debounced value
 */
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}
