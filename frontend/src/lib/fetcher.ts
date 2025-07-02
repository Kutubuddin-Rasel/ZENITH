const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const fullUrl = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    // credentials: 'include', // should be removed for Bearer token auth
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
} 