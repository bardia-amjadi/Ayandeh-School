import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { AuthUser } from '../common/types';
import { findConflicts, Slot } from './conflicts';

class SlotDto {
  @IsUUID() classSubjectId: string;
  @IsInt() @Min(0) @Max(6) weekday: number;
  @IsInt() @Min(0) @Max(1439) startMinute: number;
  @IsInt() @Min(1) @Max(1440) endMinute: number;
  @IsOptional() @IsString() room?: string;
}
class MoveDto { @IsOptional() @IsInt() @Min(0) @Max(6) weekday?: number; @IsOptional() @IsInt() @Min(0) @Max(1439) startMinute?: number; @IsOptional() @IsInt() @Min(1) @Max(1440) endMinute?: number; }

@Controller('timetable')
export class ScheduleController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async conflictsFor(s: Slot) {
    const existing = await this.prisma.timetableEntry.findMany({
      where: { weekday: s.weekday, OR: [{ classId: s.classId }, ...(s.teacherId ? [{ teacherId: s.teacherId }] : [])] },
      include: { classSubject: { include: { subject: true, class: true } } },
    });
    return findConflicts(s, existing.map(e => ({
      id: e.id, classId: e.classId, teacherId: e.teacherId, weekday: e.weekday, startMinute: e.startMinute, endMinute: e.endMinute,
      label: `${e.classSubject.subject.title} — ${e.classSubject.class.name}`,
    })));
  }

  // Saves ALWAYS succeed (if valid); conflicts come back as `warnings`.
  @Post() @RequirePermission('academic.manage')
  async create(@Body() dto: SlotDto, @CurrentUser() u: AuthUser) {
    if (dto.endMinute <= dto.startMinute) throw new BadRequestException('پایان باید بعد از شروع باشد');
    const cs = await this.prisma.classSubject.findUniqueOrThrow({ where: { id: dto.classSubjectId } });
    const slot: Slot = { classId: cs.classId, teacherId: cs.teacherId, weekday: dto.weekday, startMinute: dto.startMinute, endMinute: dto.endMinute };
    const warnings = await this.conflictsFor(slot);
    const entry = await this.prisma.timetableEntry.create({ data: { ...dto, classId: cs.classId, teacherId: cs.teacherId } });
    await this.audit.log(u.id, 'timetable.create', 'TimetableEntry', entry.id, { warnings: warnings.length });
    return { entry, warnings };
  }

  @Patch(':id') @RequirePermission('academic.manage')
  async move(@Param('id') id: string, @Body() dto: MoveDto, @CurrentUser() u: AuthUser) {
    const cur = await this.prisma.timetableEntry.findUniqueOrThrow({ where: { id } });
    const next = { ...cur, ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) };
    if (next.endMinute <= next.startMinute) throw new BadRequestException('پایان باید بعد از شروع باشد');
    const warnings = await this.conflictsFor({ id, classId: next.classId, teacherId: next.teacherId, weekday: next.weekday, startMinute: next.startMinute, endMinute: next.endMinute });
    const entry = await this.prisma.timetableEntry.update({ where: { id }, data: dto });
    await this.audit.log(u.id, 'timetable.move', 'TimetableEntry', id, dto);
    return { entry, warnings };
  }

  @Delete(':id') @RequirePermission('academic.manage')
  async remove(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    await this.prisma.timetableEntry.delete({ where: { id } });
    await this.audit.log(u.id, 'timetable.delete', 'TimetableEntry', id);
  }

  @Get()
  async list(@Query('classId') classId: string | undefined, @Query('teacherId') teacherId: string | undefined, @CurrentUser() u: AuthUser) {
    let where: object = { ...(classId ? { classId } : {}), ...(teacherId ? { teacherId } : {}) };
    if (u.role === 'STUDENT') { // students: only their own active class
      const e = await this.prisma.enrollment.findFirst({ where: { studentId: u.id, active: true } });
      if (!e) return [];
      where = { classId: e.classId };
    } else if (u.role === 'TEACHER') where = { teacherId: u.id };
    return this.prisma.timetableEntry.findMany({ where, include: { classSubject: { include: { subject: true } } }, orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] });
  }
}
