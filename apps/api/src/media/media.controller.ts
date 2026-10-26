import { Controller, ForbiddenException, Get, NotFoundException, Param, Post, Res, UploadedFile, UseInterceptors, Patch } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, Public } from '../common/decorators';
import { AuthUser } from '../common/types';
import { StorageService } from '../files/storage.service';

const IMG = { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } };

@Controller()
export class MediaController {
  constructor(private prisma: PrismaService, private storage: StorageService, private audit: AuditService) {}
  private canAuthor = (u: AuthUser) => u.role === 'TEACHER' || u.permissions.has('content.manage');

  // Upload an image for use inside a post / as a featured image. Returns a public URL usable in Markdown: ![alt](url)
  @Post('media/images') @UseInterceptors(FileInterceptor('file', IMG))
  async image(@UploadedFile() file: Express.Multer.File, @CurrentUser() u: AuthUser) {
    if (!this.canAuthor(u)) throw new ForbiddenException();
    const a = await this.storage.save(file, u.id, { imagesOnly: true, isPublic: true });
    await this.audit.log(u.id, 'media.image', 'FileAsset', a.id); return { id: a.id, url: `/api/public/media/${a.id}` };
  }

  @Patch('posts/:id/featured/:fileId')
  async setFeatured(@Param('id') id: string, @Param('fileId') fileId: string, @CurrentUser() u: AuthUser) {
    const post = await this.prisma.post.findUniqueOrThrow({ where: { id } });
    if (post.authorId !== u.id && !u.permissions.has('content.manage')) throw new ForbiddenException();
    const f = await this.prisma.fileAsset.findUniqueOrThrow({ where: { id: fileId } });
    if (!f.isPublic || !f.mimeType.startsWith('image/')) throw new ForbiddenException();
    await this.prisma.post.update({ where: { id }, data: { featuredId: fileId } });
    await this.audit.log(u.id, 'post.featured', 'Post', id); return { ok: true };
  }

  // Only explicitly public IMAGE assets are served here; everything else 404s.
  @Public() @Get('public/media/:id')
  async serve(@Param('id') id: string, @Res() res: Response) {
    const f = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!f || !f.isPublic || !f.mimeType.startsWith('image/')) throw new NotFoundException();
    res.setHeader('Content-Type', f.mimeType); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox"); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    this.storage.open(f.storageName).pipe(res);
  }
}
