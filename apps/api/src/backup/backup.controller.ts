import { Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuditService } from '../common/audit.service';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { AuthUser } from '../common/types';
import { BackupService } from './backup.service';

// 'backup.manage' is held by SUPER_ADMIN only.
@Controller('admin/backups')
export class BackupController {
  constructor(private backups: BackupService, private audit: AuditService) {}

  @Post() @RequirePermission('backup.manage')
  async create(@CurrentUser() u: AuthUser) { const r = await this.backups.create(); await this.audit.log(u.id, 'backup.create', 'Backup', r.name); return { name: r.name, size: r.size, createdAt: r.manifest.createdAt }; }

  @Get() @RequirePermission('backup.manage')
  list() { return this.backups.list(); }

  @Get(':name') @RequirePermission('backup.manage')
  async download(@Param('name') name: string, @CurrentUser() u: AuthUser, @Res() res: Response) {
    const s = this.backups.stream(name);
    await this.audit.log(u.id, 'backup.download', 'Backup', name);
    res.setHeader('Content-Type', 'application/x-tar'); res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    s.pipe(res);
  }
}
