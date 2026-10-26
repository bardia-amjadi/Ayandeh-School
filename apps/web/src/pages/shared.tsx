import { FormEvent, useState } from 'react';
import { api } from '../api';
import { fmtDateTime, fmtMinutes, fmtMoney, fmtNum, fmtDate, useFetch, WEEKDAYS } from '../lib';
import { Field, State, Table } from '../ui';

export function Announcements() {
  const r = useFetch<{ id: string; title: string; body: string; createdAt: string; read?: boolean }[]>('/announcements'); const [seen, setSeen] = useState<Set<string>>(new Set());
  async function opened(id: string, wasRead?: boolean) { if (wasRead === undefined || wasRead || seen.has(id)) return; setSeen(new Set(seen).add(id)); await api(`/announcements/${id}/read`, { method: 'POST' }).catch(() => undefined); }
  return <section><h1>اطلاعیه‌ها</h1><State loading={r.loading} error={r.error} empty={!r.data?.length}>{r.data?.map(a => { const unread = a.read === false && !seen.has(a.id); return <details className="card-flat" key={a.id} onToggle={e => (e.currentTarget as HTMLDetailsElement).open && opened(a.id, a.read)}>
    <summary><strong>{a.title}</strong> {unread && <span className="badge">جدید</span>} <small className="muted">{fmtDateTime(a.createdAt)}</small></summary><p className="pre">{a.body}</p></details>; })}</State></section>;
}

export function Sessions() {
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const r = useFetch<{ id: string; title: string; startsAt: string; endsAt: string; url: string; published: boolean }[]>(`/online-sessions?when=${when}`);
  return <section><h1>جلسات آنلاین</h1>
    <div className="tabs"><button className={when === 'upcoming' ? 'on' : ''} onClick={() => setWhen('upcoming')}>پیش‌رو</button><button className={when === 'past' ? 'on' : ''} onClick={() => setWhen('past')}>گذشته</button></div>
    <State loading={r.loading} error={r.error} empty={!r.data?.length}><Table head={['عنوان', 'شروع', 'پایان', 'لینک']}>{r.data?.map(s => <tr key={s.id}><td>{s.title}{!s.published && <span className="muted"> (پیش‌نویس)</span>}</td><td>{fmtDateTime(s.startsAt)}</td><td>{fmtDateTime(s.endsAt)}</td><td><a href={s.url} target="_blank" rel="noopener noreferrer">ورود به جلسه</a></td></tr>)}</Table></State></section>;
}

export function Timetable() {
  const r = useFetch<{ id: string; weekday: number; startMinute: number; endMinute: number; room?: string; classSubject: { subject: { title: string } } }[]>('/timetable');
  return <section><h1>برنامه هفتگی</h1><State loading={r.loading} error={r.error} empty={!r.data?.length}><Table head={['روز', 'ساعت', 'درس', 'کلاس/اتاق']}>{r.data?.map(e => <tr key={e.id}><td>{WEEKDAYS[e.weekday]}</td><td>{fmtMinutes(e.startMinute)} – {fmtMinutes(e.endMinute)}</td><td>{e.classSubject.subject.title}</td><td>{e.room ?? '—'}</td></tr>)}</Table></State></section>;
}

export function Exams() {
  const r = useFetch<{ id: string; title: string; startsAt: string; endsAt: string; classSubject: { subject: { title: string } } }[]>('/exams');
  return <section><h1>برنامه امتحانات</h1><State loading={r.loading} error={r.error} empty={!r.data?.length}><Table head={['امتحان', 'درس', 'شروع', 'پایان']}>{r.data?.map(e => <tr key={e.id}><td>{e.title}</td><td>{e.classSubject.subject.title}</td><td>{fmtDateTime(e.startsAt)}</td><td>{fmtDateTime(e.endsAt)}</td></tr>)}</Table></State></section>;
}

export function Resources() {
  const [q, setQ] = useState('');
  const r = useFetch<{ id: string; title: string; description?: string; type: string; file: { originalName: string; size: number } }[]>(`/resources${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  return <section><h1>منابع آموزشی</h1><Field label="جستجو"><input value={q} onChange={e => setQ(e.target.value)} /></Field>
    <State loading={r.loading} error={r.error} empty={!r.data?.length}><Table head={['عنوان', 'نوع', 'فایل', '']}>{r.data?.map(x => <tr key={x.id}><td>{x.title}</td><td>{x.type}</td><td dir="ltr">{x.file.originalName}</td><td><a href={`/api/resources/${x.id}/download`}>دانلود</a></td></tr>)}</Table></State></section>;
}

type Ticket = { id: string; subject: string; status: 'OPEN' | 'CLOSED'; updatedAt: string };
type TicketFull = Ticket & { messages: { id: string; authorId: string; body: string; createdAt: string }[] };
export function Tickets({ staff, meId }: { staff: boolean; meId: string }) {
  const list = useFetch<Ticket[]>('/tickets'); const [open, setOpen] = useState<string | null>(null);
  const [subject, setSubject] = useState(''); const [message, setMessage] = useState(''); const [err, setErr] = useState('');
  async function create(e: FormEvent) { e.preventDefault(); setErr(''); try { await api('/tickets', { method: 'POST', body: JSON.stringify({ subject, message }) }); setSubject(''); setMessage(''); list.reload(); } catch (x) { setErr((x as Error).message); } }
  return <section><h1>تیکت‌های پشتیبانی</h1>
    {!staff && <form className="stack" onSubmit={create}><Field label="موضوع"><input value={subject} onChange={e => setSubject(e.target.value)} required minLength={3} /></Field><Field label="پیام"><textarea value={message} onChange={e => setMessage(e.target.value)} required rows={4} /></Field>{err && <p role="alert" className="error">{err}</p>}<button>ارسال تیکت</button></form>}
    <State loading={list.loading} error={list.error} empty={!list.data?.length}><Table head={['موضوع', 'وضعیت', 'آخرین بروزرسانی', '']}>{list.data?.map(t => <tr key={t.id}><td>{t.subject}</td><td>{t.status === 'OPEN' ? 'باز' : 'بسته'}</td><td>{fmtDateTime(t.updatedAt)}</td><td><button className="link" onClick={() => setOpen(open === t.id ? null : t.id)}>مشاهده</button></td></tr>)}</Table></State>
    {open && <TicketThread id={open} staff={staff} meId={meId} onChange={list.reload} />}</section>;
}
function TicketThread({ id, staff, meId, onChange }: { id: string; staff: boolean; meId: string; onChange: () => void }) {
  const t = useFetch<TicketFull>(`/tickets/${id}`); const [body, setBody] = useState(''); const [err, setErr] = useState('');
  async function reply(e: FormEvent) { e.preventDefault(); setErr(''); try { await api(`/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); t.reload(); onChange(); } catch (x) { setErr((x as Error).message); } }
  async function close() { await api(`/tickets/${id}/close`, { method: 'PATCH' }); t.reload(); onChange(); }
  return <div className="card-flat"><State loading={t.loading} error={t.error}>{t.data && <>
    <h3>{t.data.subject}</h3>{t.data.messages.map(m => <p key={m.id} className={m.authorId === meId ? 'msg me' : 'msg'}>{m.body}<small className="muted"> {fmtDateTime(m.createdAt)}</small></p>)}
    {t.data.status === 'OPEN' && <form className="stack" onSubmit={reply}><textarea value={body} onChange={e => setBody(e.target.value)} required rows={3} aria-label="پاسخ" />{err && <p role="alert" className="error">{err}</p>}<button>ارسال پاسخ</button></form>}
    {staff && t.data.status === 'OPEN' && <button className="secondary" onClick={close}>بستن تیکت</button>}</>}</State></div>;
}

/* ---------- student ---------- */
export function MyGrades() {
  const r = useFetch<{ id: string; title: string; score: string; maxScore: string; date: string; term: number; subject: { title: string } }[]>('/grades/mine');
  return <section><h1>نمرات من</h1><State loading={r.loading} error={r.error} empty={!r.data?.length}><Table head={['درس', 'عنوان', 'نمره', 'تاریخ']}>{r.data?.map(g => <tr key={g.id}><td>{g.subject.title}</td><td>{g.title}</td><td>{fmtNum(g.score)} از {fmtNum(g.maxScore)}</td><td>{fmtDate(g.date)}</td></tr>)}</Table></State></section>;
}
export function MyFinance() {
  const r = useFetch<{ id: string; item: { title: string; description?: string }; amount: string; discount: string; paid: string; remaining: string; installments: { id: string; seq: number; amount: string; dueDate: string }[]; payments: { id: string; amount: string; paidAt: string; method: string }[] }[]>('/finance/mine');
  return <section><h1>امور مالی من</h1><State loading={r.loading} error={r.error} empty={!r.data?.length}>{r.data?.map(c => <div className="card-flat" key={c.id}>
    <h3>{c.item.title}</h3><dl className="kv"><dt>مبلغ</dt><dd>{fmtMoney(c.amount)}</dd><dt>تخفیف</dt><dd>{fmtMoney(c.discount)}</dd><dt>پرداخت‌شده</dt><dd>{fmtMoney(c.paid)}</dd><dt>مانده</dt><dd><strong>{fmtMoney(c.remaining)}</strong></dd></dl>
    <Table head={['قسط', 'مبلغ', 'سررسید']}>{c.installments.map(i => <tr key={i.id}><td>{fmtNum(i.seq)}</td><td>{fmtMoney(i.amount)}</td><td>{fmtDate(i.dueDate)}</td></tr>)}</Table>
    {c.payments.length > 0 && <Table head={['پرداخت', 'تاریخ', 'روش']}>{c.payments.map(p => <tr key={p.id}><td>{fmtMoney(p.amount)}</td><td>{fmtDate(p.paidAt)}</td><td>{p.method}</td></tr>)}</Table>}</div>)}</State></section>;
}

/* ---------- teacher ---------- */
type MyClass = { id: string; class: { id: string; name: string }; subject: { id: string; title: string } };
export function GradeEntry({ all = false }: { all?: boolean }) {
  const mine = useFetch<MyClass[]>(all ? '/academic/class-subjects' : '/academic/my-classes'); const [sel, setSel] = useState('');
  const cs = mine.data?.find(c => c.id === sel);
  const students = useFetch<{ student: { id: string; firstName: string; lastName: string } }[]>(cs ? `/academic/classes/${cs.class.id}/students` : null);
  const grades = useFetch<{ id: string; studentId: string; title: string; score: string; maxScore: string; published: boolean }[]>(cs ? `/grades/class/${cs.class.id}?subjectId=${cs.subject.id}` : null);
  const [f, setF] = useState({ studentId: '', title: '', score: '', maxScore: '20', date: new Date().toISOString().slice(0, 10) }); const [err, setErr] = useState('');
  async function add(e: FormEvent) { e.preventDefault(); if (!cs) return; setErr(''); try { await api('/grades', { method: 'POST', body: JSON.stringify({ ...f, classId: cs.class.id, subjectId: cs.subject.id, score: Number(f.score), maxScore: Number(f.maxScore) }) }); setF({ ...f, title: '', score: '' }); grades.reload(); } catch (x) { setErr((x as Error).message); } }
  async function toggle(id: string, published: boolean) { await api(`/grades/${id}/publish`, { method: 'PATCH', body: JSON.stringify({ published }) }); grades.reload(); }
  const name = (id: string) => { const s = students.data?.find(x => x.student.id === id)?.student; return s ? `${s.firstName} ${s.lastName}` : id; };
  return <section><h1>ثبت نمره</h1><State loading={mine.loading} error={mine.error} empty={!mine.data?.length}>
    <Field label="کلاس / درس"><select value={sel} onChange={e => setSel(e.target.value)}><option value="">انتخاب کنید</option>{mine.data?.map(c => <option key={c.id} value={c.id}>{c.class.name} — {c.subject.title}</option>)}</select></Field>
    {cs && <><form className="stack" onSubmit={add}>
      <Field label="دانش‌آموز"><select required value={f.studentId} onChange={e => setF({ ...f, studentId: e.target.value })}><option value="">انتخاب کنید</option>{students.data?.map(s => <option key={s.student.id} value={s.student.id}>{s.student.firstName} {s.student.lastName}</option>)}</select></Field>
      <Field label="عنوان ارزیابی"><input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <div className="row"><Field label="نمره"><input dir="ltr" inputMode="decimal" required value={f.score} onChange={e => setF({ ...f, score: e.target.value })} /></Field><Field label="سقف نمره"><input dir="ltr" inputMode="decimal" required value={f.maxScore} onChange={e => setF({ ...f, maxScore: e.target.value })} /></Field><Field label="تاریخ"><input dir="ltr" type="date" required value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field></div>
      {err && <p role="alert" className="error">{err}</p>}<button>ثبت نمره (پنهان)</button></form>
      <State loading={grades.loading} error={grades.error} empty={!grades.data?.length}><Table head={['دانش‌آموز', 'عنوان', 'نمره', 'وضعیت', '']}>{grades.data?.map(g => <tr key={g.id}><td>{name(g.studentId)}</td><td>{g.title}</td><td>{fmtNum(g.score)} از {fmtNum(g.maxScore)}</td><td>{g.published ? 'منتشرشده' : 'پنهان'}</td><td><button className="link" onClick={() => toggle(g.id, !g.published)}>{g.published ? 'پنهان کردن' : 'انتشار'}</button></td></tr>)}</Table></State></>}</State></section>;
}
