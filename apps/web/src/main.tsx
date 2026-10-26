import { StrictMode, FormEvent, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from './api';
import { Footer } from './Footer';
import { registerServiceWorker } from './push';
import { Dashboard, Profile, SystemSettings } from './pages/account';
import { Field } from './ui';
import { About, Blog, BlogPost, Contact, CustomPage, Home } from './pages/public';
import { Announcements, Exams, GradeEntry, MyFinance, MyGrades, Resources, Sessions, Tickets, Timetable } from './pages/shared';
import { Audit, Backups, Users } from './pages/admin';
import { AcademicAdmin, ExamsAdmin, FinanceAdmin, TimetableAdmin } from './pages/manage1';
import { AnnouncementsAdmin, DeputyPermissions, PagesAdmin, PostsAdmin, ResourceUpload, SessionForm, SettingsAdmin } from './pages/manage2';
import './styles.css';

type Me = { id: string; username: string; role: string; permissions: string[] };
const ROLE_FA: Record<string, string> = { SUPER_ADMIN: 'ادمین کل', ADMIN: 'مدیر مدرسه', DEPUTY: 'معاون', TEACHER: 'معلم', STUDENT: 'دانش‌آموز' };

function PublicLayout({ me }: { me: Me | null }) {
  return <><header className="topbar"><Link to="/" className="brand">مدرسه آینده</Link>
    <nav aria-label="منوی اصلی"><NavLink to="/about">درباره ما</NavLink><NavLink to="/blog">اخبار</NavLink><NavLink to="/contact">تماس</NavLink><NavLink to={me ? '/app' : '/login'}>{me ? 'پنل من' : 'ورود'}</NavLink></nav></header>
    <main className="content"><Outlet /></main><Footer /></>;
}

function Login({ onDone }: { onDone: () => void }) {
  const nav = useNavigate(); const [username, setU] = useState(''); const [password, setP] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setErr(''); try { await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); onDone(); nav('/app'); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }
  return <form className="card" onSubmit={submit}><h1>ورود</h1>
    <Field label="نام کاربری"><input dir="ltr" autoComplete="username" value={username} onChange={e => setU(e.target.value)} required /></Field>
    <Field label="گذرواژه"><input dir="ltr" type="password" autoComplete="current-password" value={password} onChange={e => setP(e.target.value)} required /></Field>
    {err && <p role="alert" className="error">{err}</p>}<button disabled={busy}>{busy ? 'در حال ورود…' : 'ورود'}</button></form>;
}

function ResetPassword() {
  const [sp] = useSearchParams(); const [token, setToken] = useState(sp.get('token') ?? ''); const [password, setP] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  async function submit(e: FormEvent) { e.preventDefault(); setErr(''); try { await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }); setMsg('گذرواژه تغییر کرد. اکنون می‌توانید وارد شوید.'); } catch (x) { setErr((x as Error).message); } }
  return <form className="card" onSubmit={submit}><h1>بازیابی گذرواژه</h1><p className="muted">توکن را از مدیر مدرسه دریافت کنید.</p>
    <Field label="توکن"><input dir="ltr" value={token} onChange={e => setToken(e.target.value)} required /></Field>
    <Field label="گذرواژه جدید (حداقل ۱۰ نویسه)"><input dir="ltr" type="password" minLength={10} autoComplete="new-password" value={password} onChange={e => setP(e.target.value)} required /></Field>
    {err && <p role="alert" className="error">{err}</p>}{msg && <p className="notice">{msg} <Link to="/login">ورود</Link></p>}<button>تغییر گذرواژه</button></form>;
}

function navFor(me: Me): [string, string][] {
  const p = new Set(me.permissions); const items: [string, string][] = [['', 'داشبورد'], ['profile', 'پروفایل']];
  if (me.role === 'STUDENT') items.push(['grades', 'نمرات'], ['finance', 'امور مالی'], ['timetable', 'برنامه هفتگی'], ['exams', 'امتحانات'], ['sessions', 'جلسات آنلاین'], ['announcements', 'اطلاعیه‌ها'], ['resources', 'منابع'], ['tickets', 'پشتیبانی']);
  if (me.role === 'TEACHER') items.push(['grade-entry', 'ثبت نمره'], ['timetable', 'برنامه هفتگی'], ['exams', 'امتحانات'], ['sessions', 'جلسات آنلاین'], ['new-session', 'جلسه جدید'], ['announcements', 'اطلاعیه‌ها'], ['resources', 'منابع'], ['upload', 'بارگذاری منبع'], ['posts', 'وبلاگ من']);
  if (['SUPER_ADMIN', 'ADMIN', 'DEPUTY'].includes(me.role)) {
    if (p.has('users.manage')) items.push(['users', 'کاربران']);
    if (p.has('grades.manage.all')) items.push(['grade-entry', 'مدیریت نمرات']);
    if (p.has('academic.manage')) items.push(['academic', 'ساختار آموزشی'], ['timetable-admin', 'مدیریت برنامه هفتگی'], ['exams-admin', 'مدیریت امتحانات']);
    if (p.has('finance.view')) items.push(['finance-admin', 'مدیریت مالی']);
    if (p.has('content.manage')) items.push(['announcements-admin', 'مدیریت اطلاعیه‌ها'], ['posts', 'وبلاگ'], ['pages', 'صفحه‌های سفارشی'], ['site', 'محتوای سایت'], ['upload', 'بارگذاری منبع']);
    if (p.has('sessions.manage.all')) items.push(['new-session', 'جلسه جدید']);
    items.push(['sessions', 'جلسات آنلاین'], ['resources', 'منابع']);
    if (p.has('tickets.manage')) items.push(['tickets', 'تیکت‌ها']);
    if (p.has('settings.manage')) items.push(['deputy', 'دسترسی‌های معاون'], ['system', 'تنظیمات سامانه']);
    if (p.has('audit.view')) items.push(['audit', 'گزارش رویدادها']);
    if (p.has('backup.manage')) items.push(['backups', 'پشتیبان‌گیری']);
  }
  return items;
}

function Panel({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const staff = me.permissions.includes('tickets.manage');
  return <div className="panel"><aside><p className="who">{ROLE_FA[me.role]}<br /><bdi dir="ltr">{me.username}</bdi></p>
    <nav aria-label="پنل">{navFor(me).map(([to, label]) => <NavLink key={to} to={to ? `/app/${to}` : '/app'} end={!to}>{label}</NavLink>)}</nav>
    <button className="secondary" onClick={async () => { await api('/auth/logout', { method: 'POST' }); onLogout(); }}>خروج</button></aside>
    <main className="content"><Routes>
      <Route index element={<Dashboard />} /><Route path="profile" element={<Profile />} /><Route path="system" element={<SystemSettings />} />
      <Route path="grades" element={<MyGrades />} /><Route path="finance" element={<MyFinance />} /><Route path="timetable" element={<Timetable />} /><Route path="exams" element={<Exams />} />
      <Route path="sessions" element={<Sessions />} /><Route path="announcements" element={<Announcements />} /><Route path="resources" element={<Resources />} />
      <Route path="tickets" element={<Tickets staff={staff} meId={me.id} />} /><Route path="grade-entry" element={<GradeEntry all={me.role !== 'TEACHER'} />} />
      <Route path="academic" element={<AcademicAdmin />} /><Route path="timetable-admin" element={<TimetableAdmin />} /><Route path="exams-admin" element={<ExamsAdmin />} /><Route path="finance-admin" element={<FinanceAdmin canManage={me.permissions.includes('finance.manage')} />} />
      <Route path="announcements-admin" element={<AnnouncementsAdmin />} /><Route path="new-session" element={<SessionForm teacher={me.role === 'TEACHER'} />} /><Route path="upload" element={<ResourceUpload teacher={me.role === 'TEACHER'} />} /><Route path="posts" element={<PostsAdmin canPreview={me.permissions.includes('content.manage')} />} /><Route path="pages" element={<PagesAdmin />} /><Route path="site" element={<SettingsAdmin />} /><Route path="deputy" element={<DeputyPermissions />} />
      <Route path="users" element={<Users meRole={me.role} />} /><Route path="audit" element={<Audit />} /><Route path="backups" element={<Backups />} />
      <Route path="*" element={<p>صفحه یافت نشد.</p>} /></Routes></main></div>;
}

function App() {
  const [me, setMe] = useState<Me | null>(null); const [ready, setReady] = useState(false);
  const load = useCallback(() => api<Me>('/auth/me').then(setMe).catch(() => setMe(null)).finally(() => setReady(true)), []);
  useEffect(() => { load(); }, [load]);
  if (!ready) return <p className="center">در حال بارگذاری…</p>;
  return <Routes>
    <Route path="/app/*" element={me ? <><Panel me={me} onLogout={() => setMe(null)} /><Footer /></> : <Navigate to="/login" replace />} />
    <Route element={<PublicLayout me={me} />}>
      <Route index element={<Home />} /><Route path="about" element={<About />} /><Route path="contact" element={<Contact />} />
      <Route path="blog" element={<Blog />} /><Route path="blog/:slug" element={<BlogPost />} />
      <Route path="login" element={me ? <Navigate to="/app" replace /> : <div className="center-in"><Login onDone={load} /></div>} />
      <Route path="reset-password" element={<div className="center-in"><ResetPassword /></div>} />
      <Route path=":slug" element={<CustomPage />} />
    </Route></Routes>;
}
registerServiceWorker();
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);
