import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { AuthUser } from '../common/types';
import { visibleToStudent } from './visibility';
import { PushService } from '../push/push.service';

class CreateDto {
  @IsString() @MaxLength(200) title: string; @IsString() @MaxLength(10000) body: string;
  @IsIn(['ALL', 'CLASSES']) audience: 'ALL' | 'CLASSES'; @IsOptional() @IsArray() @IsUUID('all', { each: true }) classIds?: string[];
  @IsOptional() @IsBoolean() published?: boolean; @IsOptional() @IsDateString() publishAt?: string; @IsOptional() @IsDateString() expiresAt?: string;
}

@Controller('announcements')
export class AnnouncementsController {
  constructor(private prisma: PrismaService, private audit: AuditService, private push: PushService) {}

  @Post() @RequirePermission('content.manage')
  async create(@Body() dto: CreateDto, @CurrentUser() u: AuthUser) {
    if (dto.audience === 'CLASSES' && !dto.classIds?.length) throw new BadRequestException('حداقل یک کلاس لازم است');
    const a = await this.prisma.announcement.create({ data: {
      title: dto.title, body: dto.body, audience: dto.audience, published: dto.published ?? false, creatorId: u.id,
      publishAt: dto.publishAt ? new Date(dto.publishAt) : null, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      classes: dto.audience === 'CLASSES' ? { create: dto.classIds!.map(classId => ({ classId })) } : undefined } });
    await this.audit.log(u.id, 'announcement.create', 'Announcement', a.id, { published: a.published });
    if (a.published && !dto.publishAt) void this.notifyAudience(a.id);
    return a;
  }

  // Marks as read only if the announcement is actually visible to the caller.
  @HttpCode(204) @Post(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    const visible = (await this.list(u) as { id: string }[]).some(a => a.id === id);
    if (!visible) throw new ForbiddenException();
    await this.prisma.announcementRead.upsert({ where: { announcementId_userId: { announcementId: id, userId: u.id } }, update: {}, create: { announcementId: id, userId: u.id } });
  }

  @Patch(':id/publish') @RequirePermission('content.manage')
  async publish(@Param('id') id: string, @Body() b: { published: boolean }, @CurrentUser() u: AuthUser) {
    const a = await this.prisma.announcement.update({ where: { id }, data: { published: !!b.published } });
    await this.audit.log(u.id, b.published ? 'announcement.publish' : 'announcement.unpublish', 'Announcement', id);
    if (b.published) void this.notifyAudience(id);
    return a;
  }

  private async notifyAudience(id: string) {
    const a = await this.prisma.announcement.findUnique({ where: { id }, include: { classes: true } });
    if (!a) return;
    const where = a.audience === 'ALL' ? { role: 'STUDENT' as const } : { role: 'STUDENT' as const, enrollments: { some: { active: true, classId: { in: a.classes.map(c => c.classId) } } } };
    const users = await this.prisma.user.findMany({ where: { ...where, active: true }, select: { id: true } });
    await this.push.notify(users.map(x => x.id), 'announcements');
  }

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.announcement.findMany({ include: { classes: true, reads: { where: { userId: u.id }, select: { userId: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
    if (u.permissions.has('content.manage')) return rows.map(({ reads, ...a }) => ({ ...a, read: reads.length > 0 }));
    let classIds: string[] = [];
    if (u.role === 'STUDENT') { const e = await this.prisma.enrollment.findFirst({ where: { studentId: u.id, active: true } }); if (!e) return rows.filter(a => visibleToStudent({ ...a, classIds: [] }, null)); classIds = [e.classId]; }
    else if (u.role === 'TEACHER') classIds = (await this.prisma.classSubject.findMany({ where: { teacherId: u.id }, select: { classId: true } })).map(c => c.classId);
    else throw new ForbiddenException();
    const asLike = (a: (typeof rows)[number]) => ({ ...a, classIds: a.classes.map(c => c.classId) });
    return rows.filter(a => classIds.length
      ? classIds.some(c => visibleToStudent(asLike(a), c))   // respects publish/expiry for every audience rule
      : visibleToStudent(asLike(a), null)).map(({ reads, ...a }) => ({ ...a, read: reads.length > 0 }));
  }
}
