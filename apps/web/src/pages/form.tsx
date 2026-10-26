import { FormEvent, ReactNode, useState } from 'react';
import { api } from '../api';
import { Field } from '../ui';
import { useFetch } from '../lib';

/** Wraps submit handling: busy flag, error text, success note. */
export function useAction() {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  async function run(fn: () => Promise<unknown>, okMsg = 'ذخیره شد.') {
    setBusy(true); setErr(''); setOk('');
    try { const r = await fn(); setOk(okMsg); return r; } catch (e) { setErr((e as Error).message); return undefined; } finally { setBusy(false); }
  }
  const msg = <>{err && <p role="alert" className="error">{err}</p>}{ok && <p className="notice" role="status">{ok}</p>}</>;
  return { busy, run, msg };
}
export const post = <T,>(path: string, body: unknown, method = 'POST', headers?: Record<string, string>) => api<T>(path, { method, body: JSON.stringify(body), headers });
export const Form = ({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) => <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }}>{children}</form>;

export type Person = { id: string; firstName: string; lastName: string; username: string; identifier?: string | null };
export function PersonPicker({ role, value, onChange, label }: { role: 'STUDENT' | 'TEACHER'; value: string; onChange: (id: string) => void; label: string }) {
  const [q, setQ] = useState(''); const r = useFetch<Person[]>(`/users/lookup?role=${role}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  return <div className="stack"><Field label={`جستجوی ${label}`}><input value={q} onChange={e => setQ(e.target.value)} /></Field>
    <Field label={label}><select required value={value} onChange={e => onChange(e.target.value)}><option value="">انتخاب کنید</option>{r.data?.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.username})</option>)}</select></Field></div>;
}
export type Opt = { id: string; label: string };
export const Select = ({ label, value, onChange, options, required = true }: { label: string; value: string; onChange: (v: string) => void; options: Opt[]; required?: boolean }) =>
  <Field label={label}><select required={required} value={value} onChange={e => onChange(e.target.value)}><option value="">انتخاب کنید</option>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>;
// <input type="datetime-local"> yields local time without zone; convert to ISO (browser zone).
export const toIso = (local: string) => new Date(local).toISOString();

export async function upload<T>(path: string, fd: FormData): Promise<T> {
  const csrf = document.cookie.split('; ').find(c => c.startsWith('ayandeh_csrf='))?.split('=')[1] ?? '';
  const res = await fetch(`/api${path}`, { method: 'POST', body: fd, headers: { 'x-csrf-token': csrf }, credentials: 'same-origin' }); // browser sets multipart boundary
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join('، ') : data.message ?? 'خطا');
  return data as T;
}
