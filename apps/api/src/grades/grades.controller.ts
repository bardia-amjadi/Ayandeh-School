import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { PushService } from '../push/push.service';

class CreateGradeDto {
  @IsUUID() studentId: string; @IsUUID() classId: string; @IsUUID() subjectId: string;
  @IsOptional() @IsInt() @Min(1) @Max(4) term?: number;
  @IsString() title: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) score: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) maxScore: number;
  @IsDateString() date: string;
  @IsOptional() @IsBoolean() published?: boolean;
}
class PublishDto { @IsBoolean() published: boolean; }

@Controller('grades')
export class GradesController {
  constructor(private prisma: PrismaService, private audit: AuditService, private push: PushService) {}

  // Teacher may touch a class+subject only if assigned to it. Admin-level may touch all.
  private async assertCanGrade(u: AuthUser, classId: string, subjectId: string) {
    if (u.permissions.has('grades.manage.all')) return;
    if (u.role !== 'TEACHER') throw new ForbiddenException();
    const cs = await this.prisma.classSubject.findFirst({ where: { classId, subjectId, teacherId: u.id } });
    if (!cs) throw new ForbiddenException('این کلاس/درس به شما اختصاص داده نشده است');
  }

  @Post()
  async create(@Body() dto: CreateGradeDto, @CurrentUser() u: AuthUser) {
    await this.assertCanGrade(u, dto.classId, dto.subjectId);
    if (dto.score > dto.maxScore) throw new ForbiddenException('نمره از سقف نمره بیشتر است');
    const enrolled = await this.prisma.enrollment.findFirst({ where: { studentId: dto.studentId, classId: dto.classId, active: true } });
    if (!enrolled) throw new ForbiddenException('دانش‌آموز عضو این کلاس نیست');
    const g = await this.prisma.gradeRecord.create({ data: { ...dto, date: new Date(dto.date), enteredById: u.id } });
    await this.audit.log(u.id, 'grade.create', 'GradeRecord', g.id, { studentId: dto.studentId, published: g.published });
    if (g.published) void this.push.notify([g.studentId], 'grades');
    return g;
  }

  @Patch(':id/publish')
  async publish(@Param('id') id: string, @Body() dto: PublishDto, @CurrentUser() u: AuthUser) {
    const g = await this.prisma.gradeRecord.findUniqueOrThrow({ where: { id } });
    await this.assertCanGrade(u, g.classId, g.subjectId);
    const updated = await this.prisma.gradeRecord.update({ where: { id }, data: { published: dto.published } });
    await this.audit.log(u.id, dto.published ? 'grade.publish' : 'grade.hide', 'GradeRecord', id);
    if (dto.published && !g.published) void this.push.notify([g.studentId], 'grades');
    return updated;
  }

  @Get('class/:classId')
  async byClass(@Param('classId') classId: string, @Query('subjectId') subjectId: string | undefined, @CurrentUser() u: AuthUser) {
    if (!u.permissions.has('grades.manage.all')) {
      if (u.role !== 'TEACHER') throw new ForbiddenException();
      const mine = await this.prisma.classSubject.findMany({ where: { classId, teacherId: u.id }, select: { subjectId: true } });
      if (!mine.length) throw new ForbiddenException();
      const allowed = mine.map(m => m.subjectId);
      if (subjectId && !allowed.includes(subjectId)) throw new ForbiddenException();
      return this.prisma.gradeRecord.findMany({ where: { classId, subjectId: subjectId ?? { in: allowed } }, orderBy: { date: 'desc' } });
    }
    return this.prisma.gradeRecord.findMany({ where: { classId, ...(subjectId ? { subjectId } : {}) }, orderBy: { date: 'desc' } });
  }

  // Student-facing: ONLY own, ONLY published. Enforced in the query itself.
  @Get('mine')
  async mine(@CurrentUser() u: AuthUser) {
    if (u.role !== 'STUDENT') throw new ForbiddenException();
    return this.prisma.gradeRecord.findMany({
      where: { studentId: u.id, published: true },
      select: { id: true, title: true, score: true, maxScore: true, date: true, term: true, subject: { select: { title: true } } },
      orderBy: { date: 'desc' },
    });
  }
}
