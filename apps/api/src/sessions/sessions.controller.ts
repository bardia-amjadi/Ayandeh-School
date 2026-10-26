import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { safeExternalUrl } from './url';
import { PushService } from '../push/push.service';

class SessionDto {
  @IsString() @MaxLength(200) title: string; @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsUUID() classId: string; @IsOptional() @IsUUID() subjectId?: string;
  @IsDateString() startsAt: string; @IsDateString() endsAt: string;
  @IsString() url: string; @IsOptional() @IsBoolean() published?: boolean;
}
class UpdateDto { @IsOptional() @IsString() title?: string; @IsOptional() @IsDateString() startsAt?: string; @IsOptional() @IsDateString() endsAt?: string; @IsOptional() @IsString() url?: string; @IsOptional() @IsBoolean() published?: boolean; @IsOptional() @IsString() description?: string; }

@Controller('online-sessions')
export class SessionsController {
  constructor(private prisma: PrismaService, private audit: AuditService, private push: PushService) {}

  private async assertManage(u: AuthUser, classId: string, ownerId?: string) {
    if (u.permissions.has('sessions.manage.all')) return;
    if (u.role !== 'TEACHER') throw new ForbiddenException();
    if (ownerId && ownerId !== u.id) throw new ForbiddenException();
    if (!(await this.prisma.classSubject.findFirst({ where: { classId, teacherId: u.id } }))) throw new ForbiddenException('این کلاس به شما اختصاص داده نشده است');
  }

  @Post()
  async create(@Body() dto: SessionDto, @CurrentUser() u: AuthUser) {
    await this.assertManage(u, dto.classId);
    const url = safeExternalUrl(dto.url); if (!url) throw new BadRequestException('نشانی جلسه باید یک لینک https معتبر باشد');
    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) throw new BadRequestException('پایان باید بعد از شروع باشد');
    const s = await this.prisma.onlineSession.create({ data: { ...dto, url, startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt), creatorId: u.id } });
    await this.audit.log(u.id, 'session.create', 'OnlineSession', s.id, { published: s.published });
    if (s.published) void this.notifyClass(s.classId);
    return s;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDto, @CurrentUser() u: AuthUser) {
    const cur = await this.prisma.onlineSession.findUniqueOrThrow({ where: { id } });
    await this.assertManage(u, cur.classId, cur.creatorId);
    const data: Record<string, unknown> = { ...dto };
    if (dto.url !== undefined) { const url = safeExternalUrl(dto.url); if (!url) throw new BadRequestException('لینک نامعتبر'); data.url = url; }
    if (dto.startsAt) data.startsAt = new Date(dto.startsAt); if (dto.endsAt) data.endsAt = new Date(dto.endsAt);
    const s = await this.prisma.onlineSession.update({ where: { id }, data });
    await this.audit.log(u.id, 'session.update', 'OnlineSession', id, { published: dto.published });
    if (dto.published && !cur.published) void this.notifyClass(s.classId);
    return s;
  }

  private async notifyClass(classId: string) {
    const e = await this.prisma.enrollment.findMany({ where: { classId, active: true }, select: { studentId: true } });
    await this.push.notify(e.map(x => x.studentId), 'sessions');
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    const cur = await this.prisma.onlineSession.findUniqueOrThrow({ where: { id } });
    await this.assertManage(u, cur.classId, cur.creatorId);
    await this.prisma.onlineSession.delete({ where: { id } });
    await this.audit.log(u.id, 'session.delete', 'OnlineSession', id);
  }

  // when=upcoming|past. Students: published sessions of their own class only (enforced in the query).
  @Get()
  async list(@CurrentUser() u: AuthUser, @Query('when') when: 'upcoming' | 'past' = 'upcoming') {
    const now = new Date();
    const time = when === 'past' ? { endsAt: { lt: now } } : { endsAt: { gte: now } };
    let scope: object;
    if (u.role === 'STUDENT') {
      const e = await this.prisma.enrollment.findFirst({ where: { studentId: u.id, active: true } });
      if (!e) return [];
      scope = { classId: e.classId, published: true };
    } else if (u.permissions.has('sessions.manage.all')) scope = {};
    else if (u.role === 'TEACHER') scope = { creatorId: u.id };
    else throw new ForbiddenException();
    return this.prisma.onlineSession.findMany({ where: { ...scope, ...time }, orderBy: { startsAt: when === 'past' ? 'desc' : 'asc' }, take: 200 });
  }
}
