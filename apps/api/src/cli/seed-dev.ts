/* LOCAL DEVELOPMENT ONLY. Refuses to run when NODE_ENV=production.
 * Creates a sample year/class/subject, a teacher and a student with random passwords printed once. */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';

async function main() {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to seed in production.'); process.exit(1); }
  const prisma = new PrismaClient();
  const mk = async (username: string, role: 'TEACHER' | 'STUDENT' | 'ADMIN', firstName: string, lastName: string) => {
    const pw = randomBytes(9).toString('base64url');
    const u = await prisma.user.upsert({ where: { username }, update: {}, create: { username, role, firstName, lastName, passwordHash: await argon2.hash(pw) } });
    console.log(`${role.padEnd(8)} ${username} / ${pw}`); return u;
  };
  const year = await prisma.academicYear.upsert({ where: { title: '1405-1406' }, update: {}, create: { title: '1405-1406', startDate: new Date('2026-09-23'), endDate: new Date('2027-06-21'), isCurrent: true } });
  const level = await prisma.gradeLevel.upsert({ where: { title: 'دهم' }, update: {}, create: { title: 'دهم', order: 10 } });
  const cls = await prisma.schoolClass.upsert({ where: { academicYearId_name: { academicYearId: year.id, name: 'دهم الف' } }, update: {}, create: { name: 'دهم الف', academicYearId: year.id, gradeLevelId: level.id } });
  const math = await prisma.subject.upsert({ where: { title: 'ریاضی' }, update: {}, create: { title: 'ریاضی' } });
  await mk('dev-admin', 'ADMIN', 'مدیر', 'نمونه');
  const t = await mk('dev-teacher', 'TEACHER', 'معلم', 'نمونه');
  const s = await mk('dev-student', 'STUDENT', 'دانش‌آموز', 'نمونه');
  await prisma.classSubject.upsert({ where: { classId_subjectId: { classId: cls.id, subjectId: math.id } }, update: { teacherId: t.id }, create: { classId: cls.id, subjectId: math.id, teacherId: t.id } });
  await prisma.enrollment.upsert({ where: { studentId_academicYearId: { studentId: s.id, academicYearId: year.id } }, update: {}, create: { studentId: s.id, classId: cls.id, academicYearId: year.id } });
  await prisma.publicSetting.upsert({ where: { key: 'about' }, update: {}, create: { key: 'about', value: { markdown: '## درباره مدرسه آینده\n\nمتن نمونه — از پنل مدیریت قابل ویرایش است.' } } });
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
