import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma.service';
import { sniff } from './sniff';
import { clamScan } from './clam';
import { backupState } from '../backup/backup.service';
import { normalizeUploadSettings, HARD_MAX_MB, UploadSettings } from './upload-settings';

export const MAX_UPLOAD_BYTES = HARD_MAX_MB * 1024 * 1024; // multer hard ceiling; runtime limit may be lower
const IMAGE_EXTS = ['png', 'jpg', 'gif', 'webp'];

@Injectable()
export class StorageService {
  private root = path.resolve(process.env.UPLOAD_DIR ?? './uploads');
  private cache?: { at: number; v: UploadSettings };
  constructor(private prisma: PrismaService) {}

  async settings(): Promise<UploadSettings> {
    if (this.cache && Date.now() - this.cache.at < 15_000) return this.cache.v;
    const row = await this.prisma.systemSetting.findUnique({ where: { key: 'upload' } });
    const v = normalizeUploadSettings(row?.value); this.cache = { at: Date.now(), v }; return v;
  }
  invalidate() { this.cache = undefined; }

  private async scan(buf: Buffer) {
    const host = process.env.CLAMAV_HOST; if (!host) return;
    try {
      const v = await clamScan(buf, host, Number(process.env.CLAMAV_PORT ?? 3310));
      if (v.error) throw new Error(v.error);
      if (!v.clean) throw new BadRequestException('فایل آلوده شناسایی شد و پذیرفته نشد');
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      if (process.env.CLAMAV_FAIL_OPEN === 'true') return; // explicit opt-in only
      throw new ServiceUnavailableException('بررسی ضدویروس در دسترس نیست؛ بعداً تلاش کنید');
    }
  }

  async save(file: Express.Multer.File, uploadedById: string, opts: { imagesOnly?: boolean; isPublic?: boolean } = {}) {
    if (backupState.running) throw new ServiceUnavailableException('سیستم در حال پشتیبان‌گیری است؛ چند دقیقه بعد تلاش کنید');
    if (!file?.buffer?.length) throw new BadRequestException('فایل خالی است');
    const cfg = await this.settings();
    if (file.size > cfg.maxMb * 1024 * 1024) throw new BadRequestException(`حداکثر حجم مجاز ${cfg.maxMb} مگابایت است`);
    const type = sniff(file.buffer);
    if (!type || !cfg.allowedExts.includes(type.ext)) throw new BadRequestException('نوع فایل مجاز نیست');
    if (opts.imagesOnly && !IMAGE_EXTS.includes(type.ext)) throw new BadRequestException('فقط تصویر مجاز است');
    await this.scan(file.buffer);
    const storageName = `${randomUUID()}.${type.ext}`; // server-generated; client name never touches the filesystem
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(path.join(this.root, storageName), file.buffer, { flag: 'wx', mode: 0o640 });
    const originalName = path.basename(file.originalname).replace(/[\u0000-\u001f"\\/]/g, '_').slice(0, 200);
    return this.prisma.fileAsset.create({ data: { storageName, originalName, mimeType: type.mime, size: file.size, sha256: createHash('sha256').update(file.buffer).digest('hex'), uploadedById, isPublic: !!opts.isPublic } });
  }

  /** Resolve strictly inside the upload root (defence in depth against traversal). */
  open(storageName: string) {
    const full = path.resolve(this.root, storageName);
    if (!full.startsWith(this.root + path.sep) || storageName !== path.basename(storageName)) throw new BadRequestException();
    return createReadStream(full);
  }
}
