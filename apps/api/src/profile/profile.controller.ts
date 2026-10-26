import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { StorageService } from '../files/storage.service';

// Field-level allow-list: role, username, active, identifier, names are NOT self-editable.
class ProfileDto { @IsOptional() @IsEmail() email?: string; @IsOptional() @IsString() @MaxLength(32) phone?: string; }

@Controller('profile')
export class ProfileController {
  constructor(private prisma: PrismaService, private storage: StorageService, private audit: AuditService) {}

  @Get()
  async get(@CurrentUser() u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { id: true, username: true, role: true, firstName: true, lastName: true, email: true, phone: true, identifier: true, avatarFileId: true, mustChangePassword: true } });
    const enrollment = u.role === 'STUDENT' ? await this.prisma.enrollment.findFirst({ where: { studentId: u.id, active: true }, include: { class: { select: { name: true, gradeLevel: { select: { title: true } } } }, academicYear: { select: { title: true } } } }) : null;
    const teaching = u.role === 'TEACHER' ? await this.prisma.classSubject.findMany({ where: { teacherId: u.id }, include: { class: { select: { name: true } }, subject: { select: { title: true } } } }) : [];
    return { ...user, hasAvatar: !!user.avatarFileId, avatarFileId: undefined,
      className: enrollment?.class.name ?? null, gradeLevel: enrollment?.class.gradeLevel.title ?? null, academicYear: enrollment?.academicYear.title ?? null,
      assignments: teaching.map(t => ({ class: t.class.name, subject: t.subject.title })) };
  }

  @Patch()
  async update(@Body() dto: ProfileDto, @CurrentUser() u: AuthUser) {
    const r = await this.prisma.user.update({ where: { id: u.id }, data: { email: dto.email, phone: dto.phone }, select: { email: true, phone: true } });
    await this.audit.log(u.id, 'profile.update', 'User', u.id, { fields: Object.keys(dto) }); return r;
  }

  @Post('avatar') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  async setAvatar(@UploadedFile() file: Express.Multer.File, @CurrentUser() u: AuthUser) {
    const asset = await this.storage.save(file, u.id, { imagesOnly: true }); // private (isPublic=false)
    await this.prisma.user.update({ where: { id: u.id }, data: { avatarFileId: asset.id } });
    await this.audit.log(u.id, 'profile.avatar', 'User', u.id); return { ok: true };
  }

  // Avatars are private: the owner and user-managers only.
  @Get('avatar/:userId')
  async avatar(@Param('userId') userId: string, @CurrentUser() u: AuthUser, @Res() res: Response) {
    if (userId !== u.id && !u.permissions.has('users.manage')) throw new ForbiddenException();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.avatarFileId) throw new NotFoundException();
    const f = await this.prisma.fileAsset.findUnique({ where: { id: user.avatarFileId } });
    if (!f || !f.mimeType.startsWith('image/')) throw new BadRequestException();
    res.setHeader('Content-Type', f.mimeType); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    this.storage.open(f.storageName).pipe(res);
  }
}
