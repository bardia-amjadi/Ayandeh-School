import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { disablePush, enablePush, pushState, PushState } from '../push';
import { fmtDateTime, fmtMoney, fmtNum, useFetch } from '../lib';
import { Field, State } from '../ui';
import { Form, post, upload, useAction } from './form';

const PUSH_TEXT: Record<PushState, string> = { unsupported: 'مرورگر شما از اعلان پشتیبانی نمی‌کند (در iOS ابتدا برنامه را به صفحه اصلی اضافه کنید).', denied: 'اجازه اعلان در مرورگر مسدود شده است.', unconfigured: 'اعلان‌ها هنوز توسط مدیر سیستم فعال نشده‌اند.', off: 'اعلان‌ها خاموش است.', on: 'اعلان‌ها روشن است.' };
export function PushToggle() {
  const [st, setSt] = useState<PushState>('unsupported'); const [err, setErr] = useState('');
  useEffect(() => { pushState().then(setSt).catch(() => setSt('unsupported')); }, []);
  async function toggle() { setErr(''); try { setSt(st === 'on' ? await disablePush() : await enablePush()); } catch (e) { setErr((e as Error).message); } }
  return <div><p className="muted">{PUSH_TEXT[st]}</p>{(st === 'on' || st === 'off') && <button className="secondary" onClick={toggle}>{st === 'on' ? 'خاموش کردن اعلان‌ها' : 'روشن کردن اعلان‌ها'}</button>}{err && <p role="alert" className="error">{err}</p>}</div>;
}

const PREF_LABELS: [string, string][] = [['announcements', 'اطلاعیه‌ها'], ['grades', 'نمرات منتشرشده'], ['sessions', 'جلسات آنلاین'], ['tickets', 'پاسخ تیکت‌ها']];
export function NotificationPrefs() {
  const r = useFetch<Record<string, boolean>>('/push/preferences'); const act = useAction();
  return <State loading={r.loading} error={r.error}><fieldset><legend>نوع اعلان‌ها</legend>{PREF_LABELS.map(([k, label]) => <label className="check" key={k}><input type="checkbox" checked={r.data?.[k] ?? true}
    onChange={e => act.run(async () => { await post('/push/preferences', { [k]: e.target.checked }, 'PUT'); r.reload(); })} /> {label}</label>)}</fieldset>{act.msg}</State>;
}

type Card = { key: string; label: string; value: number | string };
export function Dashboard() {
  const r = useFetch<{ role: string; className?: string | null; cards: Card[]; finance?: { charged: string; paid: string; outstanding: string } | null; recentAnnouncements?: { id: string; title: string; createdAt: string }[] }>('/dashboard');
  const money = (c: Card) => c.key === 'outstanding' ? fmtMoney(c.value) : fmtNum(c.value);
  return <section><h1>داشبورد</h1><State loading={r.loading} error={r.error}>{r.data && <>
    {r.data.className && <p className="muted">کلاس: {r.data.className}</p>}
    <div className="cards">{r.data.cards.map(c => <div className="stat" key={c.key}><div className="stat-v">{money(c)}</div><div className="muted">{c.label}</div></div>)}</div>
    {r.data.finance && <div className="card-flat"><h3>خلاصه مالی (کل مدرسه)</h3><dl className="kv"><dt>مجموع بدهی‌ها پس از تخفیف</dt><dd>{fmtMoney(r.data.finance.charged)}</dd><dt>دریافتی</dt><dd>{fmtMoney(r.data.finance.paid)}</dd><dt>مانده</dt><dd><strong>{fmtMoney(r.data.finance.outstanding)}</strong></dd></dl></div>}
    {r.data.recentAnnouncements && r.data.recentAnnouncements.length > 0 && <div className="card-flat"><h3>آخرین اطلاعیه‌ها</h3><ul className="list">{r.data.recentAnnouncements.map(a => <li key={a.id}>{a.title} <span className="muted">{fmtDateTime(a.createdAt)}</span></li>)}</ul></div>}</>}</State>
    <h2>اعلان‌ها</h2><PushToggle /><NotificationPrefs /></section>;
}

export function Profile() {
  const r = useFetch<{ id: string; username: string; firstName: string; lastName: string; email?: string; phone?: string; identifier?: string; hasAvatar: boolean; mustChangePassword: boolean; className?: string; gradeLevel?: string; academicYear?: string; assignments: { class: string; subject: string }[] }>('/profile');
  const [contact, setContact] = useState<{ email: string; phone: string } | null>(null); const a1 = useAction(); const a2 = useAction(); const a3 = useAction(); const [pw, setPw] = useState({ current: '', next: '' }); const [bust, setBust] = useState(0);
  const d = r.data; const c = contact ?? { email: d?.email ?? '', phone: d?.phone ?? '' };
  return <section><h1>پروفایل من</h1><State loading={r.loading} error={r.error}>{d && <>
    {d.mustChangePassword && <p className="notice" role="status">گذرواژه شما توسط مدیر تعیین شده است؛ لطفاً آن را تغییر دهید.</p>}
    <div className="profile-head">{d.hasAvatar ? <img className="avatar" alt="تصویر پروفایل" src={`/api/profile/avatar/${d.id}?v=${bust}`} /> : <div className="avatar ph" aria-hidden>{d.firstName[0]}</div>}
      <div><h2>{d.firstName} {d.lastName}</h2><p className="muted"><bdi dir="ltr">{d.username}</bdi>{d.identifier && <> · شماره: <bdi dir="ltr">{d.identifier}</bdi></>}</p></div></div>
    {d.className && <p>پایه {d.gradeLevel} — کلاس {d.className} — سال تحصیلی {d.academicYear}</p>}
    {d.assignments.length > 0 && <ul className="list">{d.assignments.map((x, i) => <li key={i}>{x.subject} — کلاس {x.class}</li>)}</ul>}
    <h2>تصویر پروفایل</h2><Form onSubmit={() => undefined}><input type="file" accept=".png,.jpg,.jpeg,.gif,.webp" aria-label="تصویر" onChange={e => { const f = e.target.files?.[0]; if (f) a3.run(async () => { const fd = new FormData(); fd.append('file', f); await upload('/profile/avatar', fd); setBust(Date.now()); r.reload(); }, 'تصویر ذخیره شد.'); }} />{a3.msg}</Form>
    <h2>اطلاعات تماس</h2><Form onSubmit={() => a1.run(async () => { await post('/profile', { email: c.email || undefined, phone: c.phone || undefined }, 'PATCH'); })}>
      <div className="row"><Field label="ایمیل"><input dir="ltr" type="email" value={c.email} onChange={e => setContact({ ...c, email: e.target.value })} /></Field><Field label="تلفن"><input dir="ltr" value={c.phone} onChange={e => setContact({ ...c, phone: e.target.value })} /></Field></div><button disabled={a1.busy}>ذخیره</button>{a1.msg}</Form>
    <h2>تغییر گذرواژه</h2><Form onSubmit={() => a2.run(async () => { await post('/auth/change-password', pw); setPw({ current: '', next: '' }); }, 'گذرواژه تغییر کرد؛ سایر نشست‌ها بسته شدند.')}>
      <div className="row"><Field label="گذرواژه فعلی"><input dir="ltr" type="password" autoComplete="current-password" required value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} /></Field><Field label="گذرواژه جدید (حداقل ۱۰ نویسه)"><input dir="ltr" type="password" autoComplete="new-password" minLength={10} required value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} /></Field></div><button disabled={a2.busy}>تغییر گذرواژه</button>{a2.msg}</Form>
    <button className="secondary" onClick={async () => { if (confirm('از همه دستگاه‌ها خارج می‌شوید. ادامه؟')) { await api('/auth/logout-all', { method: 'POST' }); location.href = '/login'; } }}>خروج از همه دستگاه‌ها</button></>}</State></section>;
}

export function SystemSettings() {
  const r = useFetch<{ upload: { maxMb: number; allowedExts: string[] }; ceilingMb: number; knownExts: string[] }>('/admin/system-settings'); const act = useAction(); const [f, setF] = useState<{ maxMb: number; allowedExts: string[] } | null>(null);
  const v = f ?? r.data?.upload; const toggle = (e: string) => v && setF({ ...v, allowedExts: v.allowedExts.includes(e) ? v.allowedExts.filter(x => x !== e) : [...v.allowedExts, e] });
  return <section><h1>تنظیمات سامانه</h1><State loading={r.loading} error={r.error}>{r.data && v && <Form onSubmit={() => act.run(async () => { await post('/admin/system-settings/upload', v, 'PUT'); })}>
    <Field label={`حداکثر حجم فایل (مگابایت، حداکثر ${fmtNum(r.data.ceilingMb)} طبق پیکربندی استقرار)`}><input dir="ltr" type="number" min={1} max={r.data.ceilingMb} required value={v.maxMb} onChange={e => setF({ ...v, maxMb: Number(e.target.value) })} /></Field>
    <fieldset><legend>انواع فایل مجاز (تشخیص بر اساس محتوای واقعی فایل)</legend>{r.data.knownExts.map(e => <label className="check" key={e}><input type="checkbox" checked={v.allowedExts.includes(e)} onChange={() => toggle(e)} /> <bdi dir="ltr">{e}</bdi></label>)}</fieldset>
    <button disabled={act.busy || !v.allowedExts.length}>ذخیره</button>{act.msg}</Form>}</State></section>;
}
