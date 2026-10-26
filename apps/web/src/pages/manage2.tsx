import { useState } from 'react';
import { api } from '../api';
import { fmtDateTime, useFetch } from '../lib';
import { Field, Html, State, Table } from '../ui';
import { Form, Select, post, toIso, upload, useAction } from './form';

type Cls = { id: string; name: string };
type MyCs = { id: string; class: Cls; subject: { id: string; title: string } };
// Classes a user may target: teachers → their assigned ones; admins → all.
function useTargetClasses(teacher: boolean) {
  const all = useFetch<Cls[]>(teacher ? null : '/academic/classes'); const mine = useFetch<MyCs[]>(teacher ? '/academic/my-classes' : null);
  const opts = teacher ? [...new Map((mine.data ?? []).map(x => [x.class.id, { id: x.class.id, label: x.class.name }])).values()] : (all.data ?? []).map(c => ({ id: c.id, label: c.name }));
  return opts;
}

export function AnnouncementsAdmin() {
  const list = useFetch<{ id: string; title: string; published: boolean; audience: string; createdAt: string }[]>('/announcements'); const classes = useTargetClasses(false);
  const [f, setF] = useState({ title: '', body: '', audience: 'ALL', published: true, classIds: [] as string[] }); const act = useAction();
  const toggle = (id: string) => setF({ ...f, classIds: f.classIds.includes(id) ? f.classIds.filter(x => x !== id) : [...f.classIds, id] });
  async function publish(id: string, published: boolean) { await post(`/announcements/${id}/publish`, { published }, 'PATCH'); list.reload(); }
  return <section><h1>اطلاعیه‌ها (مدیریت)</h1>
    <Form onSubmit={() => act.run(async () => { await post('/announcements', { ...f, classIds: f.audience === 'CLASSES' ? f.classIds : undefined }); setF({ ...f, title: '', body: '' }); list.reload(); }, f.published ? 'منتشر شد.' : 'پیش‌نویس ذخیره شد.')}>
      <Field label="عنوان"><input required maxLength={200} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="متن"><textarea required rows={5} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></Field>
      <Field label="مخاطبان"><select value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })}><option value="ALL">همه</option><option value="CLASSES">کلاس‌های مشخص</option></select></Field>
      {f.audience === 'CLASSES' && <fieldset><legend>کلاس‌ها</legend>{classes.map(c => <label className="check" key={c.id}><input type="checkbox" checked={f.classIds.includes(c.id)} onChange={() => toggle(c.id)} /> {c.label}</label>)}</fieldset>}
      <label className="check"><input type="checkbox" checked={f.published} onChange={e => setF({ ...f, published: e.target.checked })} /> همین الان منتشر شود (اعلان فوری ارسال می‌شود)</label>
      <button disabled={act.busy}>ذخیره</button>{act.msg}</Form>
    <State loading={list.loading} error={list.error} empty={!list.data?.length}><Table head={['عنوان', 'مخاطب', 'تاریخ', 'وضعیت', '']}>{list.data?.map(a => <tr key={a.id}><td>{a.title}</td><td>{a.audience === 'ALL' ? 'همه' : 'کلاس‌ها'}</td><td>{fmtDateTime(a.createdAt)}</td><td>{a.published ? 'منتشرشده' : 'پیش‌نویس'}</td><td><button className="link" onClick={() => publish(a.id, !a.published)}>{a.published ? 'لغو انتشار' : 'انتشار'}</button></td></tr>)}</Table></State></section>;
}

export function SessionForm({ teacher }: { teacher: boolean }) {
  const classes = useTargetClasses(teacher); const [f, setF] = useState({ title: '', description: '', classId: '', startsAt: '', endsAt: '', url: '', published: true }); const act = useAction(); const [n, setN] = useState(0);
  return <section><h1>ایجاد جلسه آنلاین</h1><p className="muted">فقط لینک جلسه ثبت می‌شود؛ جلسه روی سامانه‌های بیرونی (مثلاً Google Meet) برگزار می‌شود. لینک باید https باشد.</p>
    <Form onSubmit={() => act.run(async () => { await post('/online-sessions', { ...f, description: f.description || undefined, startsAt: toIso(f.startsAt), endsAt: toIso(f.endsAt) }); setF({ ...f, title: '', url: '' }); setN(n + 1); }, f.published ? 'جلسه منتشر شد و برای دانش‌آموزان کلاس نمایش داده می‌شود.' : 'پیش‌نویس ذخیره شد.')}>
      <Field label="عنوان"><input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="توضیحات"><textarea rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      <Select label="کلاس" value={f.classId} onChange={v => setF({ ...f, classId: v })} options={classes} />
      <div className="row"><Field label="شروع"><input dir="ltr" type="datetime-local" required value={f.startsAt} onChange={e => setF({ ...f, startsAt: e.target.value })} /></Field><Field label="پایان"><input dir="ltr" type="datetime-local" required value={f.endsAt} onChange={e => setF({ ...f, endsAt: e.target.value })} /></Field></div>
      <Field label="لینک جلسه (https)"><input dir="ltr" type="url" required value={f.url} onChange={e => setF({ ...f, url: e.target.value })} /></Field>
      <label className="check"><input type="checkbox" checked={f.published} onChange={e => setF({ ...f, published: e.target.checked })} /> منتشر شود</label>
      <button disabled={act.busy}>ذخیره جلسه</button>{act.msg}</Form><span hidden>{n}</span></section>;
}

export function ResourceUpload({ teacher }: { teacher: boolean }) {
  const classes = useTargetClasses(teacher); const subjects = useFetch<{ id: string; title: string }[]>('/academic/subjects'); const levels = useFetch<{ id: string; title: string }[]>('/academic/grade-levels');
  const [f, setF] = useState({ title: '', description: '', type: 'جزوه', scope: 'GENERAL', subjectId: '', gradeLevelId: '', classId: '' }); const [file, setFile] = useState<File | null>(null); const act = useAction();
  return <section><h1>بارگذاری منبع آموزشی</h1>
    <Form onSubmit={() => act.run(async () => { if (!file) throw new Error('فایل را انتخاب کنید'); const fd = new FormData(); (Object.entries(f) as [string, string][]).forEach(([k, v]) => { if (v) fd.append(k, v); }); fd.append('file', file); await upload('/resources', fd); setFile(null); }, 'بارگذاری شد.')}>
      <Field label="عنوان"><input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="توضیحات"><textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      <div className="row"><Field label="نوع"><input required value={f.type} onChange={e => setF({ ...f, type: e.target.value })} /></Field>
        <Field label="دامنه دسترسی"><select value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })}><option value="GENERAL">عمومی (بر اساس پایه/درس)</option><option value="CLASS">فقط اعضای یک کلاس</option></select></Field></div>
      {f.scope === 'CLASS' ? <Select label="کلاس" value={f.classId} onChange={v => setF({ ...f, classId: v })} options={classes} />
        : <div className="row"><Select required={false} label="درس (اختیاری)" value={f.subjectId} onChange={v => setF({ ...f, subjectId: v })} options={(subjects.data ?? []).map(s => ({ id: s.id, label: s.title }))} /><Select required={false} label="پایه (اختیاری)" value={f.gradeLevelId} onChange={v => setF({ ...f, gradeLevelId: v })} options={(levels.data ?? []).map(s => ({ id: s.id, label: s.title }))} /></div>}
      <Field label="فایل (PDF، تصویر، ویدیو MP4، صوت MP3، ZIP)"><input type="file" required accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mp3,.zip" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
      <button disabled={act.busy}>بارگذاری</button>{act.msg}</Form></section>;
}

/* ---------------- blog ---------------- */
type PostRow = { id: string; title: string; slug: string; markdown: string; status: 'DRAFT' | 'PUBLISHED'; videoUrl?: string | null };
export function PostsAdmin({ canPreview }: { canPreview: boolean }) {
  const list = useFetch<PostRow[]>('/posts'); const empty = { title: '', slug: '', markdown: '', status: 'DRAFT', videoUrl: '', category: '', tags: '' };
  const [f, setF] = useState(empty); const [id, setId] = useState(''); const [html, setHtml] = useState(''); const act = useAction(); const img = useAction();
  async function addImage(file: File, featured: boolean) {
    await img.run(async () => { const fd = new FormData(); fd.append('file', file); const r = await upload<{ id: string; url: string }>('/media/images', fd);
      if (featured && id) await post(`/posts/${id}/featured/${r.id}`, {}, 'PATCH'); else setF(x => ({ ...x, markdown: `${x.markdown}\n\n![توضیح تصویر](${r.url})\n` })); }, featured ? 'تصویر شاخص تنظیم شد.' : 'تصویر به متن اضافه شد.');
  }
  const edit = (p: PostRow) => { setId(p.id); setF({ ...empty, title: p.title, slug: p.slug, markdown: p.markdown, status: p.status, videoUrl: p.videoUrl ?? '' }); };
  const body = () => ({ title: f.title, slug: f.slug, markdown: f.markdown, status: f.status, videoUrl: f.videoUrl || undefined, ...(id ? {} : { category: f.category || undefined, tags: f.tags ? f.tags.split(/[,،]/).map(t => t.trim()).filter(Boolean) : undefined }) });
  return <section><h1>مطالب وبلاگ</h1>
    <Form onSubmit={() => act.run(async () => { await post(id ? `/posts/${id}` : '/posts', body(), id ? 'PATCH' : 'POST'); setId(''); setF(empty); list.reload(); })}>
      <div className="row"><Field label="عنوان"><input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field><Field label="نامک (انگلیسی، با خط تیره)"><input dir="ltr" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })} /></Field></div>
      <Field label="متن (Markdown)"><textarea dir="auto" rows={10} required value={f.markdown} onChange={e => setF({ ...f, markdown: e.target.value })} /></Field>
      <div className="row"><Field label="وضعیت"><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="DRAFT">پیش‌نویس</option><option value="PUBLISHED">منتشرشده</option></select></Field>
        {!id && <><Field label="دسته‌بندی"><input value={f.category} onChange={e => setF({ ...f, category: e.target.value })} /></Field><Field label="برچسب‌ها (با ویرگول)"><input value={f.tags} onChange={e => setF({ ...f, tags: e.target.value })} /></Field></>}
        <Field label="لینک ویدیو (https)"><input dir="ltr" type="url" value={f.videoUrl} onChange={e => setF({ ...f, videoUrl: e.target.value })} /></Field></div>
      <div className="row"><Field label="افزودن تصویر به متن"><input type="file" accept=".png,.jpg,.jpeg,.gif,.webp" onChange={e => { const x = e.target.files?.[0]; if (x) addImage(x, false); e.target.value = ''; }} /></Field>
        {id && <Field label="تصویر شاخص"><input type="file" accept=".png,.jpg,.jpeg,.gif,.webp" onChange={e => { const x = e.target.files?.[0]; if (x) addImage(x, true); e.target.value = ''; }} /></Field>}</div>{img.msg}
      <div className="row">{canPreview && <button type="button" className="secondary" onClick={async () => setHtml((await post<{ html: string }>('/pages/preview', { markdown: f.markdown })).html)}>پیش‌نمایش</button>}<button disabled={act.busy}>{id ? 'ذخیره تغییرات' : 'ایجاد مطلب'}</button>{id && <button type="button" className="secondary" onClick={() => { setId(''); setF(empty); }}>انصراف</button>}</div>{act.msg}</Form>
    {html && <div className="card-flat"><Html html={html} /></div>}
    <State loading={list.loading} error={list.error} empty={!list.data?.length}><Table head={['عنوان', 'نامک', 'وضعیت', '']}>{list.data?.map(p => <tr key={p.id}><td>{p.title}</td><td dir="ltr">{p.slug}</td><td>{p.status === 'PUBLISHED' ? 'منتشرشده' : 'پیش‌نویس'}</td>
      <td><button className="link" onClick={() => edit(p)}>ویرایش</button> <button className="link" onClick={async () => { if (confirm('حذف شود؟')) { await api(`/posts/${p.id}`, { method: 'DELETE' }); list.reload(); } }}>حذف</button></td></tr>)}</Table></State></section>;
}

/* ---------------- custom pages + About/Contact ---------------- */
type PageRow = { id: string; title: string; slug: string; markdown: string; published: boolean };
export function PagesAdmin() {
  const list = useFetch<PageRow[]>('/pages'); const empty = { title: '', slug: '', markdown: '', published: false }; const [f, setF] = useState(empty); const [id, setId] = useState(''); const [html, setHtml] = useState(''); const act = useAction();
  return <section><h1>صفحه‌های سفارشی</h1><p className="muted">صفحه منتشرشده در نشانی <bdi dir="ltr">/{f.slug || 'slug'}</bdi> در دسترس خواهد بود.</p>
    <Form onSubmit={() => act.run(async () => { await post(id ? `/pages/${id}` : '/pages', f, id ? 'PATCH' : 'POST'); setId(''); setF(empty); list.reload(); })}>
      <div className="row"><Field label="عنوان"><input required value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field><Field label="نامک"><input dir="ltr" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })} /></Field></div>
      <Field label="متن (Markdown)"><textarea dir="auto" rows={10} required value={f.markdown} onChange={e => setF({ ...f, markdown: e.target.value })} /></Field>
      <label className="check"><input type="checkbox" checked={f.published} onChange={e => setF({ ...f, published: e.target.checked })} /> منتشر شود</label>
      <div className="row"><button type="button" className="secondary" onClick={async () => setHtml((await post<{ html: string }>('/pages/preview', { markdown: f.markdown })).html)}>پیش‌نمایش</button><button disabled={act.busy}>{id ? 'ذخیره تغییرات' : 'ایجاد صفحه'}</button>{id && <button type="button" className="secondary" onClick={() => { setId(''); setF(empty); }}>انصراف</button>}</div>{act.msg}</Form>
    {html && <div className="card-flat"><Html html={html} /></div>}
    <State loading={list.loading} error={list.error} empty={!list.data?.length}><Table head={['عنوان', 'نشانی', 'وضعیت', '']}>{list.data?.map(p => <tr key={p.id}><td>{p.title}</td><td dir="ltr">/{p.slug}</td><td>{p.published ? 'منتشرشده' : 'پیش‌نویس'}</td>
      <td><button className="link" onClick={() => { setId(p.id); setF({ title: p.title, slug: p.slug, markdown: p.markdown, published: p.published }); }}>ویرایش</button> <button className="link" onClick={async () => { await post(`/pages/${p.id}`, { published: !p.published }, 'PATCH'); list.reload(); }}>{p.published ? 'لغو انتشار' : 'انتشار'}</button> <button className="link" onClick={async () => { if (confirm('حذف شود؟')) { await api(`/pages/${p.id}`, { method: 'DELETE' }); list.reload(); } }}>حذف</button></td></tr>)}</Table></State></section>;
}

function SettingEditor({ k, title, contact }: { k: 'about' | 'contact'; title: string; contact?: boolean }) {
  const cur = useFetch<{ markdown?: string; phone?: string; email?: string; address?: string }>(`/public/settings/${k}`); const [f, setF] = useState<{ markdown: string; phone: string; email: string; address: string } | null>(null); const act = useAction();
  const v = f ?? { markdown: cur.data?.markdown ?? '', phone: cur.data?.phone ?? '', email: cur.data?.email ?? '', address: cur.data?.address ?? '' };
  return <State loading={cur.loading} error={cur.error}><h2>{title}</h2><Form onSubmit={() => act.run(async () => { await post(`/settings/${k}`, { value: contact ? v : { markdown: v.markdown } }, 'PUT'); })}>
    <Field label="متن (Markdown)"><textarea dir="auto" rows={6} value={v.markdown} onChange={e => setF({ ...v, markdown: e.target.value })} /></Field>
    {contact && <div className="row"><Field label="تلفن"><input dir="ltr" value={v.phone} onChange={e => setF({ ...v, phone: e.target.value })} /></Field><Field label="ایمیل"><input dir="ltr" type="email" value={v.email} onChange={e => setF({ ...v, email: e.target.value })} /></Field><Field label="نشانی"><input value={v.address} onChange={e => setF({ ...v, address: e.target.value })} /></Field></div>}
    <button disabled={act.busy}>ذخیره</button>{act.msg}</Form></State>;
}
export const SettingsAdmin = () => <section><h1>محتوای عمومی سایت</h1><SettingEditor k="about" title="درباره ما" /><SettingEditor k="contact" title="تماس با ما" contact /></section>;

/* ---------------- deputy permissions (super admin) ---------------- */
const PERM_FA: Record<string, string> = { 'academic.manage': 'مدیریت ساختار آموزشی و برنامه‌ها', 'grades.manage.all': 'مدیریت نمرات همه کلاس‌ها', 'finance.view': 'مشاهده امور مالی', 'content.manage': 'مدیریت محتوا و اطلاعیه‌ها', 'tickets.manage': 'پاسخ به تیکت‌ها', 'sessions.manage.all': 'مدیریت همه جلسات آنلاین' };
export function DeputyPermissions() {
  const r = useFetch<{ permission: string; enabled: boolean }[]>('/admin/deputy-permissions'); const act = useAction();
  return <section><h1>دسترسی‌های معاون</h1><State loading={r.loading} error={r.error}>{r.data?.map(p => <label className="check" key={p.permission}><input type="checkbox" checked={p.enabled} onChange={e => act.run(async () => { await post('/admin/deputy-permissions', { permission: p.permission, enabled: e.target.checked }, 'PUT'); r.reload(); })} /> {PERM_FA[p.permission] ?? p.permission}</label>)}</State>{act.msg}</section>;
}
