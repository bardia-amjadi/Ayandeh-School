import { BadRequestException, Body, Controller, Get, Put, Query } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { AuthUser } from '../common/types';
import { DEPUTY_GRANTABLE } from '../common/permissions';
import { StorageService } from '../files/storage.service';
import { ALL_EXTS, HARD_MAX_MB, normalizeUploadSettings } from '../files/upload-settings';

class DeputyPermDto { @IsIn(DEPUTY_GRANTABLE as unknown as string[]) permission: string; @IsBoolean() enabled: boolean; }

class UploadSettingsDto { @IsInt() @Min(1) @Max(1024) maxMb: number; @IsArray() allowedExts: string[]; }

@Controller('admin')
export class AdminController {
  constructor(private prisma: PrismaService, private audit: AuditService, private storage: StorageService) {}

  // Only super admin holds 'settings.manage' (see ROLE_PERMISSIONS); deputies/admins cannot edit this.
  @Get('deputy-permissions') @RequirePermission('settings.manage')
  async get() {
    const rows = await this.prisma.deputyPermission.findMany();
    return DEPUTY_GRANTABLE.map(p => ({ permission: p, enabled: rows.find(r => r.permission === p)?.enabled ?? false }));
  }

  @Put('deputy-permissions') @RequirePermission('settings.manage')
  async set(@Body() dto: DeputyPermDto, @CurrentUser() u: AuthUser) {
    const r = await this.prisma.deputyPermission.upsert({ where: { permission: dto.permission }, update: { enabled: dto.enabled }, create: dto });
    await this.audit.log(u.id, 'deputy_permission.set', 'DeputyPermission', dto.permission, dto); return r;
  }

  // Super admin: storage limits and permitted file types (runtime values can only be stricter than the deploy-time ceiling).
  @Get('system-settings') @RequirePermission('settings.manage')
  async sys() { const row = await this.prisma.systemSetting.findUnique({ where: { key: 'upload' } }); return { upload: normalizeUploadSettings(row?.value), ceilingMb: HARD_MAX_MB, knownExts: ALL_EXTS }; }

  @Put('system-settings/upload') @RequirePermission('settings.manage')
  async setUpload(@Body() dto: UploadSettingsDto, @CurrentUser() u: AuthUser) {
    const v = normalizeUploadSettings(dto);
    if (!dto.allowedExts.length) throw new BadRequestException('حداقل یک نوع فایل لازم است');
    await this.prisma.systemSetting.upsert({ where: { key: 'upload' }, update: { value: v as object }, create: { key: 'upload', value: v as object } });
    this.storage.invalidate(); await this.audit.log(u.id, 'setting.upload', 'SystemSetting', 'upload', v); return v;
  }

  @Get('audit-logs') @RequirePermission('audit.view')
  async audits(@Query('entity') entity?: string, @Query('action') action?: string, @Query('page') page = '1') {
    const take = 50, skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    return this.prisma.auditLog.findMany({ where: { ...(entity ? { entity } : {}), ...(action ? { action: { startsWith: action } } : {}) }, orderBy: { createdAt: 'desc' }, take, skip,
      select: { id: true, action: true, entity: true, entityId: true, meta: true, createdAt: true, actor: { select: { username: true } } } });
  }
}
