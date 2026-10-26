import { BadRequestException, Body, ForbiddenException, Controller, Get, Param, Post, Patch } from '@nestjs/common';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { AuthUser } from '../common/types';

class YearDto { @IsString() title: string; @IsDateString() startDate: string; @IsDateString() endDate: string; @IsOptional() @IsBoolean() isCurrent?: boolean; }
class TitleDto { @IsString() title: string; @IsOptional() @IsInt() order?: number; }
class ClassDto { @IsString() name: string; @IsUUID() academicYearId: string; @IsUUID() gradeLevelId: string; }
class AssignDto { @IsUUID() subjectId: string; @IsOptional() @IsUUID() teacherId?: string; }
class EnrollDto { @IsUUID() studentId: string; }

@Controller('academic')
export class AcademicController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Teacher's own class/subject assignments (used by grade entry and session forms).
  @Get('my-classes')
  myClasses(@CurrentUser() u: AuthUser) { return this.prisma.classSubject.findMany({ where: { teacherId: u.id }, include: { class: { select: { id: true, name: true } }, subject: { select: { id: true, title: true } } } }); }

  // Every class/subject pair (grade management for admins/deputies).
  @Get('class-subjects')
  allClassSubjects(@CurrentUser() u: AuthUser) {
    if (!u.permissions.has('grades.manage.all') && !u.permissions.has('academic.manage')) throw new ForbiddenException();
    return this.prisma.classSubject.findMany({ include: { class: { select: { id: true, name: true } }, subject: { select: { id: true, title: true } } }, orderBy: { classId: 'asc' } });
  }

  @Get('years') years() { return this.prisma.academicYear.findMany({ orderBy: { startDate: 'desc' } }); }
  @Get('grade-levels') levels() { return this.prisma.gradeLevel.findMany({ orderBy: { order: 'asc' } }); }
  @Get('subjects') subjects() { return this.prisma.subject.findMany({ orderBy: { title: 'asc' } }); }
  @Get('classes') @RequirePermission('academic.manage') classes() { return this.prisma.schoolClass.findMany({ include: { gradeLevel: true, academicYear: true }, orderBy: { name: 'asc' } }); }

  @Post('years') @RequirePermission('academic.manage')
  async createYear(@Body() dto: YearDto, @CurrentUser() u: AuthUser) {
    const y = await this.prisma.$transaction(async tx => {
      if (dto.isCurrent) await tx.academicYear.updateMany({ data: { isCurrent: false } }); // single current year
      return tx.academicYear.create({ data: { ...dto, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) } });
    });
    await this.audit.log(u.id, 'year.create', 'AcademicYear', y.id); return y;
  }

  @Post('grade-levels') @RequirePermission('academic.manage')
  async createLevel(@Body() dto: TitleDto, @CurrentUser() u: AuthUser) { const r = await this.prisma.gradeLevel.create({ data: dto }); await this.audit.log(u.id, 'gradeLevel.create', 'GradeLevel', r.id); return r; }

  @Post('subjects') @RequirePermission('academic.manage')
  async createSubject(@Body() dto: TitleDto, @CurrentUser() u: AuthUser) { const r = await this.prisma.subject.create({ data: { title: dto.title } }); await this.audit.log(u.id, 'subject.create', 'Subject', r.id); return r; }

  @Post('classes') @RequirePermission('academic.manage')
  async createClass(@Body() dto: ClassDto, @CurrentUser() u: AuthUser) { const r = await this.prisma.schoolClass.create({ data: dto }); await this.audit.log(u.id, 'class.create', 'SchoolClass', r.id); return r; }

  @Get('classes/:classId/subjects') @RequirePermission('academic.manage')
  classSubjects(@Param('classId') classId: string) { return this.prisma.classSubject.findMany({ where: { classId }, include: { subject: true, teacher: { select: { id: true, firstName: true, lastName: true } } } }); }

  @Post('classes/:classId/subjects') @RequirePermission('academic.manage')
  async assignSubject(@Param('classId') classId: string, @Body() dto: AssignDto, @CurrentUser() u: AuthUser) {
    if (dto.teacherId) {
      const t = await this.prisma.user.findUnique({ where: { id: dto.teacherId } });
      if (!t || t.role !== 'TEACHER' || !t.active) throw new BadRequestException('معلم نامعتبر است');
    }
    const r = await this.prisma.classSubject.upsert({ where: { classId_subjectId: { classId, subjectId: dto.subjectId } }, update: { teacherId: dto.teacherId ?? null }, create: { classId, ...dto } });
    await this.audit.log(u.id, 'class.assign_subject', 'ClassSubject', r.id, dto); return r;
  }

  // Moving a student deactivates the old enrollment record's uniqueness slot by updating in place per year
  // (one enrollment per student per year); history stays via AuditLog + prior years' rows.
  @Post('classes/:classId/enroll') @RequirePermission('academic.manage')
  async enroll(@Param('classId') classId: string, @Body() dto: EnrollDto, @CurrentUser() u: AuthUser) {
    const cls = await this.prisma.schoolClass.findUniqueOrThrow({ where: { id: classId } });
    const s = await this.prisma.user.findUnique({ where: { id: dto.studentId } });
    if (!s || s.role !== 'STUDENT') throw new BadRequestException('دانش‌آموز نامعتبر است');
    const r = await this.prisma.enrollment.upsert({
      where: { studentId_academicYearId: { studentId: dto.studentId, academicYearId: cls.academicYearId } },
      update: { classId, active: true }, create: { studentId: dto.studentId, classId, academicYearId: cls.academicYearId },
    });
    await this.audit.log(u.id, 'class.enroll', 'Enrollment', r.id, dto); return r;
  }

  @Get('classes/:classId/students')
  async students(@Param('classId') classId: string, @CurrentUser() u: AuthUser) {
    if (!u.permissions.has('academic.manage') && !u.permissions.has('grades.manage.all')) {
      const mine = await this.prisma.classSubject.findFirst({ where: { classId, teacherId: u.id } });
      if (!mine) throw new ForbiddenException('دسترسی مجاز نیست');
    }
    return this.prisma.enrollment.findMany({ where: { classId, active: true }, select: { student: { select: { id: true, firstName: true, lastName: true, identifier: true } } } });
  }
}
