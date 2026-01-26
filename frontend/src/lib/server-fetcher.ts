import { cookies } from 'next/headers';
import { config } from './config';

const API_URL = config.apiUrl;

export async function serverFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');

    const fullUrl = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;

    const res = await fetch(fullUrl, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Cookie': allCookies, // Forward cookies from the incoming request
            ...(options.headers || {}),
        },
        cache: 'no-store', // Default to no-store for real-time dashboard data
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error(`Fetch failed for ${fullUrl}: ${res.status} - ${errorText}`);
        // Return appropriate default or throw. 
        // Throwing allows Error Boundaries to catch it.
        throw new Error(`API call failed: ${res.statusText}`);
    }

    const json = await res.json();

    if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
        if (!json.success) {
            throw new Error(json.message || 'Operation failed');
        }
        return json.data as T;
    }

    return json as T;
}
