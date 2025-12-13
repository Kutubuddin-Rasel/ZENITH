
const API_URL = 'http://localhost:3000';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const fullUrl = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include', //  Essential for HttpOnly Cookies
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  // Standardized API Response unwrapping
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    if (!json.success) {
      throw new Error(json.message || 'Operation failed');
    }
    return json.data as T;
  }
  // Fallback for non-standard responses (should rely on standard via interceptor now)
  return json as T;
} 