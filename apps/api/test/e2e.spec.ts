import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { BootstrapError, createSuperAdmin } from '../src/cli/create-super-admin';
import { Client, PDF, PNG, future } from './helpers';

// Requires DATABASE_URL pointing at a MIGRATED, DISPOSABLE PostgreSQL database (tables are truncated).
const PW = 'Str0ng-Passw0rd!';
let app: INestApplication; const prisma = new PrismaClient();
let sa: Client, admin: Client, t1: Client, t2: Client, t3: Client, s1: Client, s2: Client, s3: Client, anon: Client;
const ids: Record<string, string> = {};

async function mkUser(c: Client, username: string, role: string, name: string) {
  const r = await c.post('/users', { username, password: PW, role, firstName: name, lastName: 'تست' }); expect(r.status, JSON.stringify(r.body)).toBe(201); ids[username] = r.body.id; return r.body;
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  anon = Client.anon(app);
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe('1. bootstrap + accounts (scenarios 1-3)', () => {
  it('creates the first super admin securely, once', async () => {
    await createSuperAdmin(prisma, { username: 'root', password: PW });
    await expect(createSuperAdmin(prisma, { username: 'root2', password: PW })).rejects.toMatchObject({ code: 2 });
    await expect(createSuperAdmin(new PrismaClient(), { username: 'x', password: 'short' })).rejects.toBeInstanceOf(BootstrapError);
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'root' } });
    expect(u.passwordHash).toMatch(/^\$argon2/); expect(u.passwordHash).not.toContain(PW);
  });
  it('has no public registration and requires auth', async () => {
    expect((await anon.post('/users', { username: 'evil', password: PW, role: 'SUPER_ADMIN', firstName: 'a', lastName: 'b' })).status).toBe(401);
    expect((await anon.get('/auth/me')).status).toBe(401);
  });
  it('super admin creates admin; admin creates staff and students', async () => {
    sa = await new Client(app).login('root', PW);
    await mkUser(sa, 'admin1', 'ADMIN', 'مدیر'); admin = await new Client(app).login('admin1', PW);
    for (const [u, r] of [['t1', 'TEACHER'], ['t2', 'TEACHER'], ['t3', 'TEACHER'], ['s1', 'STUDENT'], ['s2', 'STUDENT'], ['s3', 'STUDENT'], ['dep1', 'DEPUTY']]) await mkUser(admin, u, r, u);
    [t1, t2, t3, s1, s2, s3] = await Promise.all(['t1', 't2', 't3', 's1', 's2', 's3'].map(u => new Client(app).login(u, PW)));
  });
  it('admin cannot create super admins; teachers/students cannot manage users', async () => {
    expect((await admin.post('/users', { username: 'x1', password: PW, role: 'SUPER_ADMIN', firstName: 'a', lastName: 'b' })).status).toBe(403);
    expect((await t1.get('/users')).status).toBe(403); expect((await s1.get('/users')).status).toBe(403);
  });
  it('login errors do not reveal whether a user exists', async () => {
    const a = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'nobody', password: 'x' });
    const b = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 't1', password: 'wrong' });
    expect(a.status).toBe(401); expect(b.status).toBe(401); expect(a.body.message).toBe(b.body.message);
  });
  it('rejects state-changing requests without the CSRF token', async () => {
    expect((await s1.postNoCsrf('/tickets', { subject: 'abc', message: 'm' })).status).toBe(403);
  });
  it('mass assignment: self-profile cannot change role', async () => {
    expect((await s1.patch('/profile', { role: 'ADMIN' })).status).toBe(400);
    expect((await s1.patch('/profile', { phone: '09120000000' })).status).toBe(200);
  });
});

describe('2. academic structure + isolation (scenarios 4-5)', () => {
  it('builds year, classes, subjects, assignments and enrollments', async () => {
    const y = await admin.post('/academic/years', { title: '1405-1406', startDate: '2026-09-23T00:00:00Z', endDate: '2027-06-21T00:00:00Z', isCurrent: true }); expect(y.status).toBe(201); ids.year = y.body.id;
    const l = await admin.post('/academic/grade-levels', { title: 'دهم' }); ids.level = l.body.id;
    ids.math = (await admin.post('/academic/subjects', { title: 'ریاضی' })).body.id; ids.phys = (await admin.post('/academic/subjects', { title: 'فیزیک' })).body.id;
    ids.A = (await admin.post('/academic/classes', { name: 'الف', academicYearId: ids.year, gradeLevelId: ids.level })).body.id;
    ids.B = (await admin.post('/academic/classes', { name: 'ب', academicYearId: ids.year, gradeLevelId: ids.level })).body.id;
    const asg = (c: string, s: string, t: string) => admin.post(`/academic/classes/${c}/subjects`, { subjectId: s, teacherId: ids[t] });
    expect((await asg(ids.A, ids.math, 't1')).status).toBe(201); expect((await asg(ids.B, ids.phys, 't1')).status).toBe(201);
    expect((await asg(ids.B, ids.math, 't2')).status).toBe(201); expect((await asg(ids.A, ids.phys, 't3')).status).toBe(201);
    for (const [c, s] of [['A', 's1'], ['A', 's3'], ['B', 's2']]) expect((await admin.post(`/academic/classes/${ids[c]}/enroll`, { studentId: ids[s] })).status).toBe(201);
  });
  it('teacher cannot enter, read or publish grades for an unrelated class (4)', async () => {
    const body = { studentId: ids.s1, classId: ids.A, subjectId: ids.math, title: 'quiz', score: 10, maxScore: 20, date: new Date().toISOString() };
    expect((await t2.post('/grades', body)).status).toBe(403);
    expect((await t2.get(`/grades/class/${ids.A}`)).status).toBe(403);
    expect((await t2.get(`/academic/classes/${ids.A}/students`)).status).toBe(403);
    expect((await t1.post('/grades', { ...body, studentId: ids.s2 })).status).toBe(403); // s2 not in class A
    expect((await t1.get(`/grades/class/${ids.A}`)).status).toBe(200);
  });
  it('student cannot read other data or admin APIs (5)', async () => {
    expect((await s1.get(`/grades/class/${ids.A}`)).status).toBe(403);
    expect((await s1.get(`/finance/student/${ids.s3}`)).status).toBe(403);
    expect((await s1.post('/finance/items', { title: 'x', amount: '1', academicYearId: ids.year })).status).toBe(403);
    expect((await s1.get('/admin/backups')).status).toBe(403); expect((await t1.get('/admin/audit-logs')).status).toBe(403);
  });
});

describe('3. grades hidden/published (scenarios 6-7)', () => {
  it('enters hidden, publishes, hides again; server-side filtering for students', async () => {
    const g = await t1.post('/grades', { studentId: ids.s1, classId: ids.A, subjectId: ids.math, title: 'میان‌ترم', score: 18.5, maxScore: 20, date: new Date().toISOString() });
    expect(g.status).toBe(201); expect(g.body.published).toBe(false); const id = g.body.id;
    expect((await s1.get('/grades/mine')).body).toEqual([]);
    expect((await t2.patch(`/grades/${id}/publish`, { published: true })).status).toBe(403);
    expect((await t1.patch(`/grades/${id}/publish`, { published: true })).status).toBe(200);
    const mine = await s1.get('/grades/mine'); expect(mine.body).toHaveLength(1);
    expect(Object.keys(mine.body[0])).not.toContain('published'); expect(Object.keys(mine.body[0])).not.toContain('enteredById');
    expect((await s3.get('/grades/mine')).body).toEqual([]); expect((await s2.get('/grades/mine')).body).toEqual([]);
    await t1.patch(`/grades/${id}/publish`, { published: false });
    expect((await s1.get('/grades/mine')).body).toEqual([]);
  });
});

describe('4. timetable + exams: conflicts warn but never block (scenario 8)', () => {
  it('saves overlapping entries and reports teacher/class conflicts', async () => {
    const cs = async (c: string) => (await admin.get(`/academic/classes/${ids[c]}/subjects`)).body as { id: string; subject: { id: string } }[];
    const aMath = (await cs('A')).find(x => x.subject.id === ids.math)!.id, bPhys = (await cs('B')).find(x => x.subject.id === ids.phys)!.id, aPhys = (await cs('A')).find(x => x.subject.id === ids.phys)!.id;
    const e1 = await admin.post('/timetable', { classSubjectId: aMath, weekday: 0, startMinute: 480, endMinute: 540 }); expect(e1.status).toBe(201); expect(e1.body.warnings).toEqual([]);
    const e2 = await admin.post('/timetable', { classSubjectId: bPhys, weekday: 0, startMinute: 510, endMinute: 570 }); // same teacher t1, other class
    expect(e2.status).toBe(201); expect(e2.body.warnings.map((w: { kind: string }) => w.kind)).toEqual(['TEACHER']);
    const e3 = await admin.post('/timetable', { classSubjectId: aPhys, weekday: 0, startMinute: 500, endMinute: 520 }); // same class A
    expect(e3.status).toBe(201); expect(e3.body.warnings.map((w: { kind: string }) => w.kind)).toContain('CLASS');
    expect((await admin.get(`/timetable?classId=${ids.A}`)).body.length).toBe(2);
    expect((await s1.get('/timetable')).body.length).toBe(2); expect((await s2.get('/timetable')).body.length).toBe(1);
    const ex1 = await admin.post('/exams', { classSubjectId: aMath, title: 'پایان‌ترم', startsAt: future(24), endsAt: future(26) }); expect(ex1.status).toBe(201);
    const ex2 = await admin.post('/exams', { classSubjectId: aPhys, title: 'تداخل', startsAt: future(25), endsAt: future(27) });
    expect(ex2.status).toBe(201); expect(ex2.body.warnings.length).toBeGreaterThan(0);
    expect((await admin.post('/timetable', { classSubjectId: aMath, weekday: 1, startMinute: 600, endMinute: 540 })).status).toBe(400);
  });
});

describe('5. finance (scenario 9)', () => {
  it('computes charges, installments, discounts, payments and balances consistently; idempotent payments', async () => {
    const it = await admin.post('/finance/items', { title: 'شهریه', amount: '1000000', academicYearId: ids.year, installments: 3, dueDate: future(24) }); expect(it.status).toBe(201);
    const ch = await admin.post(`/finance/items/${it.body.id}/assign`, { studentId: ids.s1, discount: '100000' }); expect(ch.status).toBe(201);
    expect((await admin.post(`/finance/items/${it.body.id}/assign`, { studentId: ids.s1 })).status).toBe(409);
    expect((await admin.post(`/finance/items/${it.body.id}/assign`, { studentId: ids.s3, discount: '9999999' })).status).toBe(400);
    let mine = (await s1.get('/finance/mine')).body[0];
    expect(mine.installments.reduce((s: number, i: { amount: string }) => s + Number(i.amount), 0)).toBe(900000); expect(mine.remaining).toBe('900000');
    const pay = (key: string, amount: string) => admin.post(`/finance/charges/${ch.body.id}/payments`, { amount, method: 'cash', paidAt: new Date().toISOString() }).set('Idempotency-Key', key);
    const p1 = await pay('key-12345678', '300000'); expect(p1.status).toBe(201);
    const replay = await pay('key-12345678', '300000'); expect(replay.body.id).toBe(p1.body.id);
    expect((await pay('key-12345678', '1')).status).toBe(409);
    expect(await prisma.payment.count({ where: { chargeId: ch.body.id } })).toBe(1);
    expect((await admin.post(`/finance/charges/${ch.body.id}/payments`, { amount: '1', method: 'cash', paidAt: new Date().toISOString() })).status).toBe(400); // key required
    expect((await pay('key-overpay-0001', '700000')).status).toBe(400);
    mine = (await s1.get('/finance/mine')).body[0]; expect(mine.paid).toBe('300000'); expect(mine.remaining).toBe('600000');
    expect((await s3.get('/finance/mine')).body).toEqual([]);
    expect((await admin.post(`/finance/payments/${p1.body.id}/void`, { reason: 'اشتباه' })).status).toBe(201);
    expect((await s1.get('/finance/mine')).body[0].remaining).toBe('900000');
    expect((await t1.get('/finance/items')).status).toBe(403);
  });
});

describe('6. online sessions + files (scenarios 10-12)', () => {
  it('teacher publishes external link for own class only; students see own class only', async () => {
    const base = { title: 'جلسه', classId: ids.A, startsAt: future(2), endsAt: future(3), published: true };
    expect((await t1.post('/online-sessions', { ...base, url: 'https://meet.example.com/abc' })).status).toBe(201);
    for (const bad of ['http://meet.example.com/abc', 'javascript:alert(1)', 'https://localhost/x', 'https://10.0.0.1/x']) expect((await t1.post('/online-sessions', { ...base, url: bad })).status).toBe(400);
    expect((await t2.post('/online-sessions', { ...base, url: 'https://meet.example.com/abc' })).status).toBe(403);
    expect((await s1.get('/online-sessions')).body).toHaveLength(1); expect((await s2.get('/online-sessions')).body).toHaveLength(0);
    expect((await t1.post('/online-sessions', { ...base, title: 'draft', url: 'https://meet.example.com/d', published: false })).status).toBe(201);
    expect((await s1.get('/online-sessions')).body).toHaveLength(1);
  });
  it('class attachments are class-only; general resources open; unsafe uploads rejected', async () => {
    const cls = await t1.upload('/resources', { title: 'جزوه کلاس', type: 'pdf', scope: 'CLASS', classId: ids.A }, { buf: PDF, name: 'notes.pdf' }); expect(cls.status, JSON.stringify(cls.body)).toBe(201);
    const gen = await t1.upload('/resources', { title: 'عمومی', type: 'pdf', scope: 'GENERAL' }, { buf: PDF, name: 'g.pdf' }); expect(gen.status).toBe(201);
    const dl = await s1.get(`/resources/${cls.body.id}/download`); expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toMatch(/^attachment/); expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect((await s2.get(`/resources/${cls.body.id}/download`)).status).toBe(404); expect((await anon.get(`/resources/${cls.body.id}/download`)).status).toBe(401);
    expect((await s2.get(`/resources/${gen.body.id}/download`)).status).toBe(200);
    expect((await s2.get('/resources')).body.map((r: { id: string }) => r.id)).toEqual([gen.body.id]);
    expect((await t2.upload('/resources', { title: 'x', type: 'pdf', scope: 'CLASS', classId: ids.A }, { buf: PDF, name: 'x.pdf' })).status).toBe(403);
    expect((await t1.upload('/resources', { title: 'x', type: 'pdf', scope: 'GENERAL' }, { buf: Buffer.from('<html><script>alert(1)</script></html>'), name: 'x.pdf' })).status).toBe(400);
    expect((await s1.upload('/resources', { title: 'x', type: 'pdf', scope: 'GENERAL' }, { buf: PDF, name: 'x.pdf' })).status).toBe(403);
  });
  it('super admin can restrict allowed file types at runtime', async () => {
    expect((await admin.put('/admin/system-settings/upload', { maxMb: 5, allowedExts: ['pdf'] })).status).toBe(403);
    expect((await sa.put('/admin/system-settings/upload', { maxMb: 5, allowedExts: ['pdf'] })).status).toBe(200);
    expect((await t1.upload('/media/images', {}, { buf: PNG, name: 'a.png' })).status).toBe(400);
    await sa.put('/admin/system-settings/upload', { maxMb: 5, allowedExts: ['pdf', 'png', 'jpg'] });
    expect((await t1.upload('/media/images', {}, { buf: PNG, name: 'a.png' })).status).toBe(201);
  });
});

describe('7. public content (scenarios 13-14, 16-17)', () => {
  it('posts: draft vs published, XSS neutralised, featured image public', async () => {
    const md = '# سلام\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>';
    const p = await t1.post('/posts', { title: 'خبر', slug: 'hello-school', markdown: md, status: 'PUBLISHED', category: 'اخبار', tags: ['مدرسه'] }); expect(p.status, JSON.stringify(p.body)).toBe(201);
    await t1.post('/posts', { title: 'پیش‌نویس', slug: 'draft-one', markdown: 'secret', status: 'DRAFT' });
    const pub = await anon.get('/public/posts/hello-school'); expect(pub.status).toBe(200);
    expect(pub.body.html).not.toMatch(/<script|onerror|javascript:/i); expect(pub.body.html).toContain('<h1>');
    expect((await anon.get('/public/posts/draft-one')).status).toBe(404);
    expect((await anon.get('/public/posts')).body.map((x: { slug: string }) => x.slug)).toEqual(['hello-school']);
    expect((await t2.patch(`/posts/${p.body.id}`, { title: 'hijack' })).status).toBe(403); // teachers: own posts only
    const img = await t1.upload('/media/images', {}, { buf: PNG, name: 'cover.png' }); expect(img.status).toBe(201);
    expect((await t1.patch(`/posts/${p.body.id}/featured/${img.body.id}`)).status).toBe(200);
    expect((await anon.get(`/public/media/${img.body.id}`)).status).toBe(200);
    expect((await anon.get('/public/posts/hello-school')).body.featuredUrl).toBe(`/api/public/media/${img.body.id}`);
    const priv = await prisma.fileAsset.findFirstOrThrow({ where: { isPublic: false } }); expect((await anon.get(`/public/media/${priv.id}`)).status).toBe(404);
  });
  it('custom pages: create/publish/reserved/duplicate; editable About & Contact', async () => {
    expect((await admin.post('/pages', { title: 'قوانین', slug: 'rules', markdown: '## قوانین\n\n- یک\n- دو', published: true })).status).toBe(201);
    expect((await admin.post('/pages', { title: 'x', slug: 'hidden', markdown: 'x' })).status).toBe(201);
    expect((await anon.get('/public/pages/rules')).body.html).toContain('<li>'); expect((await anon.get('/public/pages/hidden')).status).toBe(404);
    for (const s of ['admin', 'login', 'blog', 'contact', 'Bad Slug']) expect((await admin.post('/pages', { title: 'x', slug: s, markdown: 'x' })).status).toBe(400);
    expect((await admin.post('/pages', { title: 'x', slug: 'rules', markdown: 'x' })).status).toBe(409);
    expect((await t1.post('/pages', { title: 'x', slug: 'tpage', markdown: 'x' })).status).toBe(403);
    expect((await admin.put('/settings/contact', { value: { phone: '021-1234', markdown: 'تماس <script>1</script>' } })).status).toBe(200);
    const c = await anon.get('/public/settings/contact'); expect(c.body.phone).toBe('021-1234'); expect(c.body.html).not.toContain('<script');
    expect((await t1.put('/settings/contact', { value: {} })).status).toBe(403); expect((await admin.put('/settings/evil', { value: {} })).status).toBe(404);
  });
});

describe('8. tickets, announcements, push, dashboard (scenario 15, 18)', () => {
  it('ticket flow with owner-only access', async () => {
    const t = await s1.post('/tickets', { subject: 'مشکل', message: 'سلام' }); expect(t.status).toBe(201);
    expect((await s2.get(`/tickets/${t.body.id}`)).status).toBe(403); expect((await t1.get(`/tickets/${t.body.id}`)).status).toBe(403);
    expect((await s2.get('/tickets')).body).toEqual([]); expect((await t1.post('/tickets', { subject: 'abc', message: 'm' })).status).toBe(403);
    expect((await admin.get('/tickets')).body).toHaveLength(1);
    expect((await admin.post(`/tickets/${t.body.id}/messages`, { body: 'پاسخ' })).status).toBe(201);
    expect((await s1.get(`/tickets/${t.body.id}`)).body.messages).toHaveLength(2);
    expect((await admin.patch(`/tickets/${t.body.id}/close`)).status).toBe(200); expect((await s1.patch(`/tickets/${t.body.id}/close`)).status).toBe(403);
    expect((await s1.post(`/tickets/${t.body.id}/messages`, { body: 'x' })).status).toBe(403);
  });
  it('announcements target classes and track read status', async () => {
    const a = await admin.post('/announcements', { title: 'اطلاعیه', body: 'متن', audience: 'CLASSES', classIds: [ids.A], published: true }); expect(a.status).toBe(201);
    await admin.post('/announcements', { title: 'پیش‌نویس', body: 'x', audience: 'ALL', published: false });
    const l1 = (await s1.get('/announcements')).body; expect(l1).toHaveLength(1); expect(l1[0].read).toBe(false);
    expect((await s2.get('/announcements')).body).toHaveLength(0); expect((await s2.post(`/announcements/${a.body.id}/read`)).status).toBe(403);
    expect((await s1.post(`/announcements/${a.body.id}/read`)).status).toBe(204); expect((await s1.get('/announcements')).body[0].read).toBe(true);
    expect((await s1.post('/announcements', { title: 'x', body: 'y', audience: 'ALL' })).status).toBe(403);
  });
  it('push subscription management; payload endpoint public key', async () => {
    expect((await anon.get('/push/public-key')).status).toBe(200);
    expect((await anon.post('/push/subscribe', { endpoint: 'https://push.example.com/a', p256dh: 'x', auth: 'y' })).status).toBe(401);
    expect((await s1.post('/push/subscribe', { endpoint: 'https://push.example.com/a', p256dh: 'x', auth: 'y' })).status).toBe(204);
    expect((await s1.post('/push/subscribe', { endpoint: 'http://insecure.example.com/a', p256dh: 'x', auth: 'y' })).status).toBe(400);
    expect((await s1.put('/push/preferences', { grades: false })).status).toBe(200); expect((await s1.get('/push/preferences')).body.grades).toBe(false);
    expect((await s1.del('/push/subscribe', { endpoint: 'https://push.example.com/a' })).status).toBe(204);
  });
  it('dashboards use real data', async () => {
    const d = (await admin.get('/dashboard')).body; expect(d.cards.find((c: { key: string }) => c.key === 'students').value).toBe(3);
    expect(d.cards.find((c: { key: string }) => c.key === 'teachers').value).toBe(3); expect(d.finance).toBeTruthy();
    const sd = (await s1.get('/dashboard')).body; expect(sd.role).toBe('STUDENT'); expect(sd.className).toBe('الف');
    expect((await s1.get('/profile')).body.className).toBe('الف'); expect((await t1.get('/profile')).body.assignments.length).toBe(2);
  });
});

describe('9. sessions, deputies, passwords, audit', () => {
  it('deputy permissions are configurable only by super admin', async () => {
    const dep = await new Client(app).login('dep1', PW);
    expect((await dep.get('/finance/items')).status).toBe(403);
    expect((await admin.put('/admin/deputy-permissions', { permission: 'finance.view', enabled: true })).status).toBe(403);
    expect((await sa.put('/admin/deputy-permissions', { permission: 'users.manage', enabled: true })).status).toBe(400);
    expect((await sa.put('/admin/deputy-permissions', { permission: 'finance.view', enabled: true })).status).toBe(200);
    expect((await dep.get('/finance/items')).status).toBe(200); expect((await dep.post('/finance/items', { title: 'x', amount: '1', academicYearId: ids.year })).status).toBe(403);
    expect((await dep.get('/users')).status).toBe(403);
    await sa.put('/admin/deputy-permissions', { permission: 'finance.view', enabled: false }); expect((await dep.get('/finance/items')).status).toBe(403);
  });
  it('password change revokes other sessions; deactivation revokes; admin reset token works once', async () => {
    const c1 = await new Client(app).login('s3', PW), c2 = await new Client(app).login('s3', PW);
    expect((await c1.post('/auth/change-password', { current: PW, next: 'An0ther-Passw0rd!' })).status).toBe(204);
    expect((await c2.get('/auth/me')).status).toBe(401); expect((await c1.get('/auth/me')).status).toBe(200);
    expect((await c1.post('/auth/logout-all')).status).toBe(204); expect((await c1.get('/auth/me')).status).toBe(401);
    const live = await new Client(app).login('s3', 'An0ther-Passw0rd!');
    expect((await admin.patch(`/users/${ids.s3}`, { active: false })).status).toBe(200); expect((await live.get('/auth/me')).status).toBe(401);
    expect((await request(app.getHttpServer()).post('/api/auth/login').send({ username: 's3', password: 'An0ther-Passw0rd!' })).status).toBe(401);
    expect((await admin.patch(`/users/${ids.s3}`, { active: true })).status).toBe(200);
    const tok = (await admin.post(`/users/${ids.s3}/reset-link`)).body.token; expect(typeof tok).toBe('string');
    const reset = (pw: string) => request(app.getHttpServer()).post('/api/auth/reset-password').send({ token: tok, password: pw });
    expect((await reset('Reset-Passw0rd!!')).status).toBe(204); expect((await reset('Reset-Passw0rd!!2')).status).toBe(400);
    await new Client(app).login('s3', 'Reset-Passw0rd!!');
    expect((await request(app.getHttpServer()).post('/api/auth/reset-password').send({ token: 'bogus', password: 'Reset-Passw0rd!!' })).status).toBe(400);
  });
  it('audit log records important actions and never secrets', async () => {
    for (const a of ['user.create', 'grade.create', 'grade.publish', 'finance.payment', 'finance.payment_void', 'auth.password_changed', 'deputy_permission.set', 'setting.upload', 'timetable.create'])
      expect(((await sa.get(`/admin/audit-logs?action=${a}`)).body as unknown[]).length, a).toBeGreaterThan(0);
    const all = JSON.stringify(await prisma.auditLog.findMany()); expect(all).not.toContain(PW); expect(all).not.toContain('Reset-Passw0rd'); expect(all).not.toMatch(/passwordHash|\$argon2/);
  });
});
