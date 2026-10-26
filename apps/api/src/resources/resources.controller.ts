import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { MAX_UPLOAD_BYTES, StorageService } from '../files/storage.service';
import { canAccessResource, Viewer } from './access';

class CreateResourceDto {
  @IsString() @MaxLength(200) title: string; @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString() @MaxLength(40) type: string; @IsIn(['GENERAL', 'CLASS']) scope: 'GENERAL' | 'CLASS';
  @IsOptional() @IsUUID() subjectId?: string; @IsOptional() @IsUUID() gradeLevelId?: string; @IsOptional() @IsUUID() classId?: string;
}

@Controller('resources')
export class ResourcesController {
  constructor(private prisma: PrismaService, private storage: StorageService, private audit: AuditService) {}

  private async viewer(u: AuthUser): Promise<Viewer> {
    const v: Viewer = { id: u.id, role: u.role, canManageContent: u.permissions.has('content.manage'), teachesClassIds: [] };
    if (u.role === 'TEACHER') v.teachesClassIds = (await this.prisma.classSubject.findMany({ where: { teacherId: u.id }, select: { classId: true } })).map(x => x.classId);
    if (u.role === 'STUDENT') {
      const e = await this.prisma.enrollment.findFirst({ where: { studentId: u.id, active: true }, include: { class: true } });
      v.studentClassId = e?.classId; v.studentGradeLevelId = e?.class.gradeLevelId;
      v.studentSubjectIds = e ? (await this.prisma.classSubject.findMany({ where: { classId: e.classId }, select: { subjectId: true } })).map(x => x.subjectId) : [];
    }
    return v;
  }

  @Post() @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async create(@Body() dto: CreateResourceDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() u: AuthUser) {
    const canUpload = u.role === 'TEACHER' || u.permissions.has('content.manage');
    if (!canUpload) throw new ForbiddenException();
    if (dto.scope === 'CLASS') {
      if (!dto.classId) throw new BadRequestException('کلاس الزامی است');
      if (u.role === 'TEACHER' && !(await this.prisma.classSubject.findFirst({ where: { classId: dto.classId, teacherId: u.id } })))
        throw new ForbiddenException('این کلاس به شما اختصاص داده نشده است');
    }
    const asset = await this.storage.save(file, u.id);
    const r = await this.prisma.resource.create({ data: { ...dto, fileId: asset.id, creatorId: u.id } });
    await this.audit.log(u.id, 'resource.create', 'Resource', r.id, { scope: dto.scope });
    return r;
  }

  @Get()
  async list(@CurrentUser() u: AuthUser, @Query('q') q?: string, @Query('subjectId') subjectId?: string, @Query('gradeLevelId') gradeLevelId?: string, @Query('classId') classId?: string) {
    const rows = await this.prisma.resource.findMany({
      where: { ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}), ...(subjectId ? { subjectId } : {}), ...(gradeLevelId ? { gradeLevelId } : {}), ...(classId ? { classId } : {}) },
      include: { file: { select: { originalName: true, mimeType: true, size: true } } }, orderBy: { createdAt: 'desc' }, take: 200,
    });
    const v = await this.viewer(u); // filter server-side with the same rule used for download
    return rows.filter(r => canAccessResource(r, v));
  }

  // Private files are only served here, after an authorization check. Never inline, never sniffed.
  @Get(':id/download')
  async download(@Param('id') id: string, @CurrentUser() u: AuthUser, @Res() res: Response) {
    const r = await this.prisma.resource.findUnique({ where: { id }, include: { file: true } });
    if (!r || !canAccessResource(r, await this.viewer(u))) throw new NotFoundException(); // 404 hides existence
    res.setHeader('Content-Type', r.file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(r.file.originalName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    this.storage.open(r.file.storageName).pipe(res);
  }
}
