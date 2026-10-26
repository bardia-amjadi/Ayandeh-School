const csrf = () => document.cookie.split('; ').find(c => c.startsWith('ayandeh_csrf='))?.split('=')[1] ?? '';
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (method !== 'GET') headers['x-csrf-token'] = csrf();
  const res = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join('، ') : data.message ?? 'خطا');
  return data as T;
}
