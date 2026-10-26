import { FormEvent, useState } from 'react';
import { api } from '../api';
import { fmtDateTime, fmtNum, useFetch } from '../lib';
import { Field, State, Table } from '../ui';

const ROLES = [['STUDENT', 'دانش‌آموز'], ['TEACHER', 'معلم'], ['DEPUTY', 'معاون'], ['ADMIN', 'مدیر مدرسه'], ['SUPER_ADMIN', 'ادمین کل']] as const;
type U = { id: string; username: string; role: string; active: boolean; firstName: string; lastName: string };

export function Users({ meRole }: { meRole: string }) {
  const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const r = useFetch<{ items: U[]; total: number; pageSize: number }>(`/users?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const [f, setF] = useState({ username: '', password: '', role: 'STUDENT', firstName: '', lastName: '' }); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const creatable = ROLES.filter(([k]) => meRole === 'SUPER_ADMIN' || ['STUDENT', 'TEACHER', 'DEPUTY'].includes(k));
  async function create(e: FormEvent) { e.preventDefault(); setErr(''); try { await api('/users', { method: 'POST', body: JSON.stringify(f) }); setF({ ...f, username: '', password: '', firstName: '', lastName: '' }); r.reload(); } catch (x) { setErr((x as Error).message); } }
  async function toggle(u: U) { if (!confirm(u.active ? 'حساب غیرفعال شود؟' : 'حساب فعال شود؟')) return; try { await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ active: !u.active }) }); r.reload(); } catch (x) { setErr((x as Error).message); } }
  async function link(u: U) { if (!confirm('توکن بازیابی یک‌بارمصرف ساخته شود؟')) return; const t = await api<{ token: string }>(`/users/${u.id}/reset-link`, { method: 'POST' }); setNote(`توکن بازیابی برای ${u.username} (فقط یک‌بار نمایش داده می‌شود، ۶۰ دقیقه اعتبار): ${t.token}`); }
  const pages = r.data ? Math.max(1, Math.ceil(r.data.total / r.data.pageSize)) : 1;
  return <section><h1>کاربران</h1>
    <form className="stack" onSubmit={create}><div className="row">
      <Field label="نام"><input required value={f.firstName} onChange={e => setF({ ...f, firstName: e.target.value })} /></Field>
      <Field label="نام خانوادگی"><input required value={f.lastName} onChange={e => setF({ ...f, lastName: e.target.value })} /></Field>
      <Field label="نام کاربری"><input dir="ltr" required pattern="[a-z0-9._-]{3,32}" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></Field>
      <Field label="گذرواژه اولیه (حداقل ۱۰ نویسه)"><input dir="ltr" type="password" minLength={10} required autoComplete="new-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
      <Field label="نقش"><select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{creatable.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field></div>
      {err && <p role="alert" className="error">{err}</p>}<button>ایجاد کاربر</button></form>
    {note && <p className="notice" dir="auto">{note}</p>}
    <Field label="جستجو"><input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></Field>
    <State loading={r.loading} error={r.error} empty={!r.data?.items.length}><Table head={['نام', 'نام کاربری', 'نقش', 'وضعیت', '']}>{r.data?.items.map(u => <tr key={u.id}><td>{u.firstName} {u.lastName}</td><td dir="ltr">{u.username}</td><td>{ROLES.find(x => x[0] === u.role)?.[1]}</td><td>{u.active ? 'فعال' : 'غیرفعال'}</td><td><button className="link" onClick={() => toggle(u)}>{u.active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</button> <button className="link" onClick={() => link(u)}>بازیابی گذرواژه</button></td></tr>)}</Table>
      <div className="pager"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button><span>{fmtNum(page)} / {fmtNum(pages)}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>بعدی</button></div></State></section>;
}

export function Backups() {
  const r = useFetch<{ name: string; size: number }[]>('/admin/backups'); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function make() { setBusy(true); setErr(''); try { await api('/admin/backups', { method: 'POST' }); r.reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }
  return <section><h1>پشتیبان‌گیری</h1><p className="muted">هنگام پشتیبان‌گیری بارگذاری فایل موقتاً غیرفعال است. نسخه را در جای امن و خارج از سرور نگهداری کنید.</p>
    <button disabled={busy} onClick={make}>{busy ? 'در حال ایجاد…' : 'ایجاد پشتیبان جدید'}</button>{err && <p role="alert" className="error">{err}</p>}
    <State loading={r.loading} error={r.error} empty={!r.data?.length}><Table head={['فایل', 'حجم (مگابایت)', '']}>{r.data?.map(b => <tr key={b.name}><td dir="ltr">{b.name}</td><td>{fmtNum((b.size / 1048576).toFixed(1))}</td><td><a href={`/api/admin/backups/${b.name}`}>دانلود</a></td></tr>)}</Table></State></section>;
}

export function Audit() {
  const r = useFetch<{ id: string; action: string; entity: string; createdAt: string; actor?: { username: string } | null }[]>('/admin/audit-logs');
  return <section><h1>گزارش رویدادها</h1><State loading={r.loading} error={r.error} empty={!r.data?.length}><Table head={['زمان', 'کاربر', 'رویداد', 'موجودیت']}>{r.data?.map(a => <tr key={a.id}><td>{fmtDateTime(a.createdAt)}</td><td dir="ltr">{a.actor?.username ?? '—'}</td><td dir="ltr">{a.action}</td><td dir="ltr">{a.entity}</td></tr>)}</Table></State></section>;
}
