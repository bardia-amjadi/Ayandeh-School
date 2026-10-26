import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { D, chargeBalance } from '../finance/money';

@Controller('dashboard')
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async get(@CurrentUser() u: AuthUser) {
    const now = new Date(); const week = new Date(now.getTime() + 7 * 86_400_000);
    if (u.role === 'STUDENT') {
      const e = await this.prisma.enrollment.findFirst({ where: { studentId: u.id, active: true }, include: { class: { select: { id: true, name: true } } } });
      const [exams, sessions, openTickets, charges] = await Promise.all([
        e ? this.prisma.exam.count({ where: { classId: e.classId, startsAt: { gte: now, lte: week } } }) : 0,
        e ? this.prisma.onlineSession.count({ where: { classId: e.classId, published: true, endsAt: { gte: now } } }) : 0,
        this.prisma.ticket.count({ where: { studentId: u.id, status: 'OPEN' } }),
        this.prisma.studentCharge.findMany({ where: { studentId: u.id, voidedAt: null }, include: { payments: { where: { voidedAt: null } } } }),
      ]);
      const outstanding = charges.reduce((sum, c) => sum.plus(chargeBalance(c).remaining), D(0));
      return { role: 'STUDENT', className: e?.class.name ?? null, cards: [
        { key: 'exams', label: 'امتحان‌های ۷ روز آینده', value: exams }, { key: 'sessions', label: 'جلسات آنلاین پیش‌رو', value: sessions },
        { key: 'tickets', label: 'تیکت‌های باز', value: openTickets }, { key: 'outstanding', label: 'مانده بدهی (ریال)', value: String(outstanding) }] };
    }
    if (u.role === 'TEACHER') {
      const mine = await this.prisma.classSubject.findMany({ where: { teacherId: u.id }, select: { classId: true } });
      const classIds = [...new Set(mine.map(m => m.classId))];
      const [exams, sessions] = await Promise.all([
        this.prisma.exam.count({ where: { teacherId: u.id, startsAt: { gte: now, lte: week } } }),
        this.prisma.onlineSession.count({ where: { creatorId: u.id, endsAt: { gte: now } } }),
      ]);
      return { role: 'TEACHER', cards: [{ key: 'classes', label: 'کلاس‌های من', value: classIds.length }, { key: 'exams', label: 'امتحان‌های ۷ روز آینده', value: exams }, { key: 'sessions', label: 'جلسات پیش‌رو من', value: sessions }] };
    }
    // staff
    const [students, teachers, classes, exams, sessions, tickets, announcements] = await Promise.all([
      this.prisma.user.count({ where: { role: 'STUDENT', active: true } }), this.prisma.user.count({ where: { role: 'TEACHER', active: true } }),
      this.prisma.schoolClass.count({ where: { archived: false } }), this.prisma.exam.count({ where: { startsAt: { gte: now, lte: week } } }),
      this.prisma.onlineSession.count({ where: { published: true, endsAt: { gte: now } } }),
      u.permissions.has('tickets.manage') ? this.prisma.ticket.count({ where: { status: 'OPEN' } }) : Promise.resolve(null),
      this.prisma.announcement.findMany({ where: { published: true }, orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, title: true, createdAt: true } }),
    ]);
    const cards: { key: string; label: string; value: number | string }[] = [
      { key: 'students', label: 'دانش‌آموزان', value: students }, { key: 'teachers', label: 'معلمان', value: teachers }, { key: 'classes', label: 'کلاس‌ها', value: classes },
      { key: 'exams', label: 'امتحان‌های ۷ روز آینده', value: exams }, { key: 'sessions', label: 'جلسات آنلاین پیش‌رو', value: sessions }];
    if (tickets !== null) cards.push({ key: 'tickets', label: 'تیکت‌های بی‌پاسخ/باز', value: tickets });
    let finance: { charged: string; paid: string; outstanding: string } | null = null;
    if (u.permissions.has('finance.view')) {
      const [c, p] = await Promise.all([this.prisma.studentCharge.aggregate({ where: { voidedAt: null }, _sum: { amount: true, discount: true } }), this.prisma.payment.aggregate({ where: { voidedAt: null, charge: { voidedAt: null } }, _sum: { amount: true } })]);
      const net = c._sum.amount ? c._sum.amount.minus(c._sum.discount ?? 0) : D(0); const paid = p._sum.amount ?? D(0);
      finance = { charged: net.toString(), paid: paid.toString(), outstanding: net.minus(paid).toString() };
    }
    return { role: u.role, cards, finance, recentAnnouncements: announcements };
  }
}
