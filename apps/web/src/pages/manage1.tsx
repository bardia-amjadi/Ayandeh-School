import { useState } from 'react';
import { api } from '../api';
import { fmtDate, fmtMoney, fmtNum, newKey, useFetch, WEEKDAYS, fmtMinutes } from '../lib';
import { Field, State, Table } from '../ui';
import { Form, PersonPicker, Select, post, toIso, useAction } from './form';

type Year = { id: string; title: string }; type Level = { id: string; title: string }; type Subject = { id: string; title: string };
type Cls = { id: string; name: string; gradeLevel: { title: string }; academicYear: { title: string } };

/* ---------------- finance ---------------- */
type Item = { id: string; title: string; amount: string; installments: number; academicYear: { title: string } };
type Charge = { id: string; discount: string; amount: string; item: { title: string }; installments: { id: string; seq: number; amount: string; dueDate: string }[]; payments: { id: string; amount: string; paidAt: string; method: string; voidedAt: string | null }[] };

export function FinanceAdmin({ canManage }: { canManage: boolean }) {
  const years = useFetch<Year[]>('/academic/years'); const items = useFetch<Item[]>('/finance/items');
  const [f, setF] = useState({ title: '', amount: '', academicYearId: '', installments: '1', dueDate: '' }); const a = useAction();
  const [student, setStudent] = useState(''); const [itemId, setItemId] = useState(''); const [discount, setDiscount] = useState('0'); const b = useAction();
  const [ledgerStudent, setLedgerStudent] = useState(''); const ledger = useFetch<Charge[]>(ledgerStudent ? `/finance/student/${ledgerStudent}` : null);
  return <section><h1>مدیریت مالی</h1>
    {canManage && <><h2>تعریف آیتم مالی</h2>
      <Form onSubmit={() => a.run(async () => { await post('/finance/items', { title: f.title, amount: f.amount, academicYearId: f.academicYearId, installments: Number(f.installments), ...(f.dueDate ? { dueDate: new Date(f.dueDate).toISOString() } : {}) }); items.reload(); })}>
        <div className="row"><Field label="عنوان"><input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="مبلغ (ریال)"><input dir="ltr" inputMode="numeric" pattern="[0-9]+" required value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
          <Select label="سال تحصیلی" value={f.academicYearId} onChange={v => setF({ ...f, academicYearId: v })} options={(years.data ?? []).map(y => ({ id: y.id, label: y.title }))} />
          <Field label="تعداد اقساط"><input dir="ltr" type="number" min={1} max={24} value={f.installments} onChange={e => setF({ ...f, installments: e.target.value })} /></Field>
          <Field label="اولین سررسید"><input dir="ltr" type="date" value={f.dueDate} onChange={e => setF({ ...f, dueDate: e.target.value })} /></Field></div>
        <button disabled={a.busy}>ایجاد آیتم</button>{a.msg}</Form></>}
    <State loading={items.loading} error={items.error} empty={!items.data?.length}><Table head={['آیتم', 'سال', 'مبلغ', 'اقساط']}>{items.data?.map(i => <tr key={i.id}><td>{i.title}</td><td>{i.academicYear.title}</td><td>{fmtMoney(i.amount)}</td><td>{fmtNum(i.installments)}</td></tr>)}</Table></State>
    {canManage && <><h2>اختصاص به دانش‌آموز</h2>
      <Form onSubmit={() => b.run(async () => { await post(`/finance/items/${itemId}/assign`, { studentId: student, discount }); setLedgerStudent(student); ledger.reload(); })}>
        <PersonPicker role="STUDENT" label="دانش‌آموز" value={student} onChange={setStudent} />
        <Select label="آیتم" value={itemId} onChange={setItemId} options={(items.data ?? []).map(i => ({ id: i.id, label: `${i.title} — ${i.academicYear.title}` }))} />
        <Field label="تخفیف (ریال)"><input dir="ltr" inputMode="numeric" pattern="[0-9]+" value={discount} onChange={e => setDiscount(e.target.value)} /></Field>
        <button disabled={b.busy}>اختصاص</button>{b.msg}</Form></>}
    <h2>حساب دانش‌آموز</h2><PersonPicker role="STUDENT" label="دانش‌آموز" value={ledgerStudent} onChange={setLedgerStudent} />
    {ledgerStudent && <State loading={ledger.loading} error={ledger.error} empty={!ledger.data?.length}>{ledger.data?.map(c => <ChargeCard key={c.id} c={c} canManage={canManage} reload={ledger.reload} />)}</State>}</section>;
}

function ChargeCard({ c, canManage, reload }: { c: Charge; canManage: boolean; reload: () => void }) {
  const live = c.payments.filter(p => !p.voidedAt); const paid = live.reduce((s, p) => s + Number(p.amount), 0); const remaining = Number(c.amount) - Number(c.discount) - paid;
  const [amount, setAmount] = useState(''); const [method, setMethod] = useState('cash'); const [ref, setRef] = useState(''); const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [key, setKey] = useState(newKey()); const act = useAction(); // one Idempotency-Key per payment form submission; new one only after success
  return <div className="card-flat"><h3>{c.item.title}</h3>
    <dl className="kv"><dt>مبلغ</dt><dd>{fmtMoney(c.amount)}</dd><dt>تخفیف</dt><dd>{fmtMoney(c.discount)}</dd><dt>پرداخت‌شده</dt><dd>{fmtMoney(paid)}</dd><dt>مانده</dt><dd><strong>{fmtMoney(remaining)}</strong></dd></dl>
    <Table head={['قسط', 'مبلغ', 'سررسید']}>{c.installments.map(i => <tr key={i.id}><td>{fmtNum(i.seq)}</td><td>{fmtMoney(i.amount)}</td><td>{fmtDate(i.dueDate)}</td></tr>)}</Table>
    <Table head={['پرداخت', 'تاریخ', 'روش', 'وضعیت', '']}>{c.payments.map(p => <tr key={p.id}><td>{fmtMoney(p.amount)}</td><td>{fmtDate(p.paidAt)}</td><td>{p.method}</td><td>{p.voidedAt ? 'ابطال‌شده' : 'ثبت‌شده'}</td>
      <td>{canManage && !p.voidedAt && <button className="link" onClick={async () => { const reason = prompt('دلیل ابطال؟'); if (!reason) return; await post(`/finance/payments/${p.id}/void`, { reason }); reload(); }}>ابطال</button>}</td></tr>)}</Table>
    {canManage && remaining > 0 && <Form onSubmit={() => act.run(async () => { await post(`/finance/charges/${c.id}/payments`, { amount, method, reference: ref || undefined, paidAt: new Date(paidAt).toISOString() }, 'POST', { 'Idempotency-Key': key }); setAmount(''); setRef(''); setKey(newKey()); reload(); }, 'پرداخت ثبت شد.')}>
      <div className="row"><Field label="مبلغ پرداخت"><input dir="ltr" inputMode="numeric" pattern="[0-9]+" required value={amount} onChange={e => setAmount(e.target.value)} /></Field>
        <Field label="روش"><select value={method} onChange={e => setMethod(e.target.value)}><option value="cash">نقدی</option><option value="bank-transfer">حواله بانکی</option><option value="card">کارت‌به‌کارت</option></select></Field>
        <Field label="شماره پیگیری"><input dir="ltr" value={ref} onChange={e => setRef(e.target.value)} /></Field>
        <Field label="تاریخ"><input dir="ltr" type="date" required value={paidAt} onChange={e => setPaidAt(e.target.value)} /></Field></div>
      <button disabled={act.busy}>ثبت پرداخت</button>{act.msg}</Form>}</div>;
}

/* ---------------- academic structure ---------------- */
export function AcademicAdmin() {
  const years = useFetch<Year[]>('/academic/years'); const levels = useFetch<Level[]>('/academic/grade-levels'); const subjects = useFetch<Subject[]>('/academic/subjects'); const classes = useFetch<Cls[]>('/academic/classes');
  const [y, setY] = useState({ title: '', startDate: '', endDate: '', isCurrent: true }); const ay = useAction();
  const [lvl, setLvl] = useState(''); const al = useAction(); const [sub, setSub] = useState(''); const as_ = useAction();
  const [c, setC] = useState({ name: '', academicYearId: '', gradeLevelId: '' }); const ac = useAction();
  const [cid, setCid] = useState(''); const csubs = useFetch<{ id: string; subject: Subject; teacher?: { firstName: string; lastName: string } | null }[]>(cid ? `/academic/classes/${cid}/subjects` : null);
  const roster = useFetch<{ student: { id: string; firstName: string; lastName: string } }[]>(cid ? `/academic/classes/${cid}/students` : null);
  const [subjId, setSubjId] = useState(''); const [teacher, setTeacher] = useState(''); const asg = useAction(); const [stu, setStu] = useState(''); const enr = useAction();
  return <section><h1>ساختار آموزشی</h1>
    <h2>سال تحصیلی</h2><Form onSubmit={() => ay.run(async () => { await post('/academic/years', { ...y, startDate: new Date(y.startDate).toISOString(), endDate: new Date(y.endDate).toISOString() }); years.reload(); })}>
      <div className="row"><Field label="عنوان (مثلاً ۱۴۰۵-۱۴۰۶)"><input required value={y.title} onChange={e => setY({ ...y, title: e.target.value })} /></Field><Field label="شروع"><input dir="ltr" type="date" required value={y.startDate} onChange={e => setY({ ...y, startDate: e.target.value })} /></Field><Field label="پایان"><input dir="ltr" type="date" required value={y.endDate} onChange={e => setY({ ...y, endDate: e.target.value })} /></Field></div>
      <label className="check"><input type="checkbox" checked={y.isCurrent} onChange={e => setY({ ...y, isCurrent: e.target.checked })} /> سال جاری</label><button disabled={ay.busy}>افزودن سال</button>{ay.msg}</Form>
    <h2>پایه و درس</h2><div className="row">
      <Form onSubmit={() => al.run(async () => { await post('/academic/grade-levels', { title: lvl }); setLvl(''); levels.reload(); })}><Field label="پایه جدید"><input required value={lvl} onChange={e => setLvl(e.target.value)} /></Field><button disabled={al.busy}>افزودن پایه</button>{al.msg}</Form>
      <Form onSubmit={() => as_.run(async () => { await post('/academic/subjects', { title: sub }); setSub(''); subjects.reload(); })}><Field label="درس جدید"><input required value={sub} onChange={e => setSub(e.target.value)} /></Field><button disabled={as_.busy}>افزودن درس</button>{as_.msg}</Form></div>
    <h2>کلاس</h2><Form onSubmit={() => ac.run(async () => { await post('/academic/classes', c); setC({ ...c, name: '' }); classes.reload(); })}><div className="row">
      <Field label="نام کلاس"><input required value={c.name} onChange={e => setC({ ...c, name: e.target.value })} /></Field>
      <Select label="سال" value={c.academicYearId} onChange={v => setC({ ...c, academicYearId: v })} options={(years.data ?? []).map(x => ({ id: x.id, label: x.title }))} />
      <Select label="پایه" value={c.gradeLevelId} onChange={v => setC({ ...c, gradeLevelId: v })} options={(levels.data ?? []).map(x => ({ id: x.id, label: x.title }))} /></div><button disabled={ac.busy}>ایجاد کلاس</button>{ac.msg}</Form>
    <h2>درس‌ها، معلم و دانش‌آموزان کلاس</h2>
    <Select label="کلاس" value={cid} onChange={setCid} required={false} options={(classes.data ?? []).map(x => ({ id: x.id, label: `${x.name} — ${x.academicYear.title}` }))} />
    {cid && <><Form onSubmit={() => asg.run(async () => { await post(`/academic/classes/${cid}/subjects`, { subjectId: subjId, ...(teacher ? { teacherId: teacher } : {}) }); csubs.reload(); })}>
        <Select label="درس" value={subjId} onChange={setSubjId} options={(subjects.data ?? []).map(x => ({ id: x.id, label: x.title }))} /><PersonPicker role="TEACHER" label="معلم" value={teacher} onChange={setTeacher} /><button disabled={asg.busy}>اختصاص درس و معلم</button>{asg.msg}</Form>
      <State loading={csubs.loading} error={csubs.error} empty={!csubs.data?.length}><Table head={['درس', 'معلم']}>{csubs.data?.map(x => <tr key={x.id}><td>{x.subject.title}</td><td>{x.teacher ? `${x.teacher.firstName} ${x.teacher.lastName}` : '—'}</td></tr>)}</Table></State>
      <Form onSubmit={() => enr.run(async () => { await post(`/academic/classes/${cid}/enroll`, { studentId: stu }); roster.reload(); }, 'ثبت‌نام انجام شد.')}><PersonPicker role="STUDENT" label="دانش‌آموز" value={stu} onChange={setStu} /><button disabled={enr.busy}>ثبت‌نام در کلاس</button>{enr.msg}</Form>
      <State loading={roster.loading} error={roster.error} empty={!roster.data?.length}><Table head={['دانش‌آموزان کلاس']}>{roster.data?.map(x => <tr key={x.student.id}><td>{x.student.firstName} {x.student.lastName}</td></tr>)}</Table></State></>}</section>;
}

/* ---------------- timetable + exams (conflicts shown, never block) ---------------- */
type Warn = { kind: 'CLASS' | 'TEACHER'; withLabel?: string };
const Warnings = ({ w }: { w: Warn[] }) => w.length ? <div role="alert" className="warn"><strong>هشدار تداخل (ذخیره انجام شد):</strong><ul>{w.map((x, i) => <li key={i}>{x.kind === 'CLASS' ? 'تداخل با برنامه همین کلاس' : 'تداخل با برنامه همین معلم'}{x.withLabel ? `: ${x.withLabel}` : ''}</li>)}</ul></div> : null;

function useClassSubjects() {
  const classes = useFetch<Cls[]>('/academic/classes'); const [cid, setCid] = useState('');
  const subs = useFetch<{ id: string; subject: Subject; teacher?: { firstName: string; lastName: string } | null }[]>(cid ? `/academic/classes/${cid}/subjects` : null);
  return { classes, cid, setCid, subs };
}
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toLocalInput = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export function TimetableAdmin() {
  const { classes, cid, setCid, subs } = useClassSubjects(); const [csId, setCsId] = useState(''); const [day, setDay] = useState('0'); const [start, setStart] = useState('08:00'); const [end, setEnd] = useState('09:00'); const [room, setRoom] = useState('');
  const list = useFetch<{ id: string; weekday: number; startMinute: number; endMinute: number; room?: string; classSubject: { subject: Subject } }[]>(cid ? `/timetable?classId=${cid}` : null);
  const [warn, setWarn] = useState<Warn[]>([]); const act = useAction(); const [editId, setEditId] = useState('');
  return <section><h1>برنامه هفتگی (مدیریت)</h1>
    <Select label="کلاس" value={cid} onChange={v => { setCid(v); setCsId(''); }} required={false} options={(classes.data ?? []).map(x => ({ id: x.id, label: `${x.name} — ${x.academicYear.title}` }))} />
    {cid && <><Form onSubmit={() => act.run(async () => { const r = editId ? await post<{ warnings: Warn[] }>(`/timetable/${editId}`, { weekday: Number(day), startMinute: toMin(start), endMinute: toMin(end) }, 'PATCH') : await post<{ warnings: Warn[] }>('/timetable', { classSubjectId: csId, weekday: Number(day), startMinute: toMin(start), endMinute: toMin(end), room: room || undefined }); setWarn(r.warnings); setEditId(''); list.reload(); }, editId ? 'جابجایی ذخیره شد.' : 'ذخیره شد.')}>
      <div className="row">{!editId && <Select label="درس" value={csId} onChange={setCsId} options={(subs.data ?? []).map(x => ({ id: x.id, label: `${x.subject.title}${x.teacher ? ` — ${x.teacher.lastName}` : ''}` }))} />}
        <Field label="روز"><select value={day} onChange={e => setDay(e.target.value)}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
        <Field label="شروع"><input dir="ltr" type="time" required value={start} onChange={e => setStart(e.target.value)} /></Field><Field label="پایان"><input dir="ltr" type="time" required value={end} onChange={e => setEnd(e.target.value)} /></Field>
        {!editId && <Field label="اتاق"><input value={room} onChange={e => setRoom(e.target.value)} /></Field>}</div><div className="row"><button disabled={act.busy}>{editId ? 'ذخیره جابجایی' : 'افزودن به برنامه'}</button>{editId && <button type="button" className="secondary" onClick={() => setEditId('')}>انصراف</button>}</div>{act.msg}</Form>
      <Warnings w={warn} />
      <State loading={list.loading} error={list.error} empty={!list.data?.length}><Table head={['روز', 'ساعت', 'درس', '']}>{list.data?.map(e => <tr key={e.id}><td>{WEEKDAYS[e.weekday]}</td><td>{fmtMinutes(e.startMinute)} – {fmtMinutes(e.endMinute)}</td><td>{e.classSubject.subject.title}</td>
        <td><button className="link" onClick={() => { setEditId(e.id); setDay(String(e.weekday)); setStart(toTime(e.startMinute)); setEnd(toTime(e.endMinute)); }}>ویرایش/جابجایی</button> <button className="link" onClick={async () => { if (confirm('حذف شود؟')) { await api(`/timetable/${e.id}`, { method: 'DELETE' }); list.reload(); } }}>حذف</button></td></tr>)}</Table></State></>}</section>;
}

export function ExamsAdmin() {
  const { classes, cid, setCid, subs } = useClassSubjects(); const [csId, setCsId] = useState(''); const [title, setTitle] = useState(''); const [s, setS] = useState(''); const [e, setE] = useState('');
  const list = useFetch<{ id: string; title: string; startsAt: string; endsAt: string; classSubject: { subject: Subject } }[]>(cid ? `/exams?classId=${cid}` : null); const [warn, setWarn] = useState<Warn[]>([]); const act = useAction(); const [editId, setEditId] = useState('');
  return <section><h1>امتحانات (مدیریت)</h1>
    <Select label="کلاس" value={cid} onChange={v => { setCid(v); setCsId(''); }} required={false} options={(classes.data ?? []).map(x => ({ id: x.id, label: `${x.name} — ${x.academicYear.title}` }))} />
    {cid && <><Form onSubmit={() => act.run(async () => { const r = editId ? await post<{ warnings: Warn[] }>(`/exams/${editId}`, { title, startsAt: toIso(s), endsAt: toIso(e) }, 'PATCH') : await post<{ warnings: Warn[] }>('/exams', { classSubjectId: csId, title, startsAt: toIso(s), endsAt: toIso(e) }); setWarn(r.warnings); setEditId(''); list.reload(); }, editId ? 'تغییرات ذخیره شد.' : 'ذخیره شد.')}>
      <div className="row">{!editId && <Select label="درس" value={csId} onChange={setCsId} options={(subs.data ?? []).map(x => ({ id: x.id, label: x.subject.title }))} />}<Field label="عنوان"><input required value={title} onChange={ev => setTitle(ev.target.value)} /></Field>
        <Field label="شروع"><input dir="ltr" type="datetime-local" required value={s} onChange={ev => setS(ev.target.value)} /></Field><Field label="پایان"><input dir="ltr" type="datetime-local" required value={e} onChange={ev => setE(ev.target.value)} /></Field></div><div className="row"><button disabled={act.busy}>{editId ? 'ذخیره تغییرات' : 'افزودن امتحان'}</button>{editId && <button type="button" className="secondary" onClick={() => { setEditId(''); setTitle(''); }}>انصراف</button>}</div>{act.msg}</Form>
      <Warnings w={warn} />
      <State loading={list.loading} error={list.error} empty={!list.data?.length}><Table head={['امتحان', 'درس', 'شروع', '']}>{list.data?.map(x => <tr key={x.id}><td>{x.title}</td><td>{x.classSubject.subject.title}</td><td>{new Date(x.startsAt).toLocaleString('fa-IR-u-ca-persian')}</td>
        <td><button className="link" onClick={() => { setEditId(x.id); setTitle(x.title); setS(toLocalInput(x.startsAt)); setE(toLocalInput(x.endsAt)); }}>ویرایش/جابجایی</button> <button className="link" onClick={async () => { if (confirm('حذف شود؟')) { await api(`/exams/${x.id}`, { method: 'DELETE' }); list.reload(); } }}>حذف</button></td></tr>)}</Table></State></>}</section>;
}
