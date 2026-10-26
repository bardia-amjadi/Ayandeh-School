import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { AuthUser } from '../common/types';
import { findExamConflicts } from './exam-conflicts';

class ExamDto { @IsUUID() classSubjectId: string; @IsString() @MaxLength(200) title: string; @IsDateString() startsAt: string; @IsDateString() endsAt: string; }
class ExamUpdateDto { @IsOptional() @IsString() title?: string; @IsOptional() @IsDateString() startsAt?: string; @IsOptional() @IsDateString() endsAt?: string; }

@Controller('exams')
export class ExamsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async warnings(classId: string, teacherId: string | null, startsAt: Date, endsAt: Date, id?: string) {
    const rows = await this.prisma.exam.findMany({ where: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, OR: [{ classId }, ...(teacherId ? [{ teacherId }] : [])] }, include: { classSubject: { include: { subject: true, class: true } } } });
    return findExamConflicts({ id, classId, teacherId, startsAt, endsAt }, rows.map(r => ({ id: r.id, classId: r.classId, teacherId: r.teacherId, startsAt: r.startsAt, endsAt: r.endsAt, label: `${r.title} — ${r.classSubject.class.name}` })));
  }

  @Post() @RequirePermission('academic.manage')
  async create(@Body() dto: ExamDto, @CurrentUser() u: AuthUser) {
    const s = new Date(dto.startsAt), e = new Date(dto.endsAt);
    if (e <= s) throw new BadRequestException('پایان باید بعد از شروع باشد');
    const cs = await this.prisma.classSubject.findUniqueOrThrow({ where: { id: dto.classSubjectId } });
    const warnings = await this.warnings(cs.classId, cs.teacherId, s, e);
    const exam = await this.prisma.exam.create({ data: { classSubjectId: cs.id, classId: cs.classId, teacherId: cs.teacherId, title: dto.title, startsAt: s, endsAt: e } });
    await this.audit.log(u.id, 'exam.create', 'Exam', exam.id, { warnings: warnings.length });
    return { exam, warnings };
  }

  @Patch(':id') @RequirePermission('academic.manage')
  async update(@Param('id') id: string, @Body() dto: ExamUpdateDto, @CurrentUser() u: AuthUser) {
    const cur = await this.prisma.exam.findUniqueOrThrow({ where: { id } });
    const s = dto.startsAt ? new Date(dto.startsAt) : cur.startsAt, e = dto.endsAt ? new Date(dto.endsAt) : cur.endsAt;
    if (e <= s) throw new BadRequestException('پایان باید بعد از شروع باشد');
    const warnings = await this.warnings(cur.classId, cur.teacherId, s, e, id);
    const exam = await this.prisma.exam.update({ where: { id }, data: { title: dto.title, startsAt: s, endsAt: e } });
    await this.audit.log(u.id, 'exam.update', 'Exam', id); return { exam, warnings };
  }

  @Delete(':id') @RequirePermission('academic.manage')
  async remove(@Param('id') id: string, @CurrentUser() u: AuthUser) { await this.prisma.exam.delete({ where: { id } }); await this.audit.log(u.id, 'exam.delete', 'Exam', id); }

  @Get()
  async list(@CurrentUser() u: AuthUser, @Query('classId') classId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    let scope: object = classId ? { classId } : {};
    if (u.role === 'STUDENT') { const en = await this.prisma.enrollment.findFirst({ where: { studentId: u.id, active: true } }); if (!en) return []; scope = { classId: en.classId }; }
    else if (u.role === 'TEACHER') scope = { teacherId: u.id };
    return this.prisma.exam.findMany({ where: { ...scope, ...(from || to ? { startsAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}) }, include: { classSubject: { include: { subject: true } } }, orderBy: { startsAt: 'asc' }, take: 300 });
  }
}
