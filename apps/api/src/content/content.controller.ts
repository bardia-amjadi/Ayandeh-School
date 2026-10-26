import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, Public, RequirePermission } from '../common/decorators';
import { AuthUser } from '../common/types';
import { renderMarkdown } from './markdown';
import { validateSlug } from './slug';
import { safeExternalUrl } from '../sessions/url';

class PostDto {
  @IsString() @MaxLength(200) title: string; @IsString() @MaxLength(100) slug: string; @IsString() @MaxLength(100_000) markdown: string;
  @IsOptional() @IsString() videoUrl?: string; @IsOptional() @IsString() @MaxLength(60) category?: string; @IsOptional() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED']) status?: 'DRAFT' | 'PUBLISHED';
}
class PageDto { @IsString() @MaxLength(200) title: string; @IsString() @MaxLength(100) slug: string; @IsString() @MaxLength(100_000) markdown: string; @IsOptional() @IsBoolean() published?: boolean; }
class PreviewDto { @IsString() @MaxLength(100_000) markdown: string; }
class SettingDto { @IsObject() value: Record<string, unknown>; }
const SETTING_KEYS = ['about', 'contact', 'school-info'];

@Controller()
export class ContentController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private slugCheck(slug: string) { const e = validateSlug(slug); if (e) throw new BadRequestException(e); }
  private youtubeOrHttps(v?: string) { if (!v) return null; const s = safeExternalUrl(v); if (!s) throw new BadRequestException('لینک ویدیو نامعتبر است'); return s; }

  /* ---------- public (no auth) ---------- */
  @Public() @Get('public/posts')
  async publicPosts(@Query('q') q?: string, @Query('category') category?: string, @Query('tag') tag?: string) {
    return this.prisma.post.findMany({
      where: { status: 'PUBLISHED', ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}), ...(category ? { category: { title: category } } : {}), ...(tag ? { tags: { some: { tag: { title: tag } } } } : {}) },
      select: { id: true, title: true, slug: true, publishedAt: true, featuredId: true, category: { select: { title: true } }, author: { select: { firstName: true, lastName: true } } },
      orderBy: { publishedAt: 'desc' }, take: 50 });
  }
  @Public() @Get('public/posts/:slug')
  async publicPost(@Param('slug') slug: string) {
    const p = await this.prisma.post.findFirst({ where: { slug, status: 'PUBLISHED' }, include: { category: true, tags: { include: { tag: true } }, author: { select: { firstName: true, lastName: true } } } });
    if (!p) throw new NotFoundException();
    const { markdown, ...rest } = p; return { ...rest, featuredUrl: p.featuredId ? `/api/public/media/${p.featuredId}` : null, html: renderMarkdown(markdown) };
  }
  @Public() @Get('public/pages/:slug')
  async publicPage(@Param('slug') slug: string) {
    const p = await this.prisma.customPage.findFirst({ where: { slug, published: true } });
    if (!p) throw new NotFoundException();
    return { title: p.title, slug: p.slug, html: renderMarkdown(p.markdown), updatedAt: p.updatedAt };
  }
  @Public() @Get('public/settings/:key')
  async publicSetting(@Param('key') key: string) {
    if (!SETTING_KEYS.includes(key)) throw new NotFoundException();
    const s = await this.prisma.publicSetting.findUnique({ where: { key } });
    const v = (s?.value ?? {}) as { markdown?: string };
    return { ...v, html: typeof v.markdown === 'string' ? renderMarkdown(v.markdown) : undefined };
  }

  /* ---------- posts (admin: all, teacher: own) ---------- */
  private canPost(u: AuthUser) { return u.role === 'TEACHER' || u.permissions.has('content.manage'); }

  @Post('posts')
  async createPost(@Body() dto: PostDto, @CurrentUser() u: AuthUser) {
    if (!this.canPost(u)) throw new ForbiddenException();
    this.slugCheck(dto.slug);
    const videoUrl = this.youtubeOrHttps(dto.videoUrl);
    const status = dto.status ?? 'DRAFT';
    try {
      const p = await this.prisma.post.create({ data: {
        title: dto.title, slug: dto.slug, markdown: dto.markdown, videoUrl, status, authorId: u.id, publishedAt: status === 'PUBLISHED' ? new Date() : null,
        category: dto.category ? { connectOrCreate: { where: { title: dto.category }, create: { title: dto.category, slug: encodeURIComponent(dto.category) } } } : undefined,
        tags: dto.tags?.length ? { create: dto.tags.map(t => ({ tag: { connectOrCreate: { where: { title: t }, create: { title: t } } } })) } : undefined } });
      await this.audit.log(u.id, 'post.create', 'Post', p.id, { status }); return p;
    } catch (e) { if ((e as { code?: string }).code === 'P2002') throw new ConflictException('نامک تکراری است'); throw e; }
  }

  @Patch('posts/:id')
  async updatePost(@Param('id') id: string, @Body() dto: Partial<PostDto>, @CurrentUser() u: AuthUser) {
    const cur = await this.prisma.post.findUniqueOrThrow({ where: { id } });
    if (cur.authorId !== u.id && !u.permissions.has('content.manage')) throw new ForbiddenException(); // teachers: own posts only
    if (dto.slug) this.slugCheck(dto.slug);
    const data: Record<string, unknown> = {};
    for (const k of ['title', 'slug', 'markdown'] as const) if (dto[k] !== undefined) data[k] = dto[k];
    if (dto.videoUrl !== undefined) data.videoUrl = this.youtubeOrHttps(dto.videoUrl);
    if (dto.status) { data.status = dto.status; if (dto.status === 'PUBLISHED' && !cur.publishedAt) data.publishedAt = new Date(); }
    const p = await this.prisma.post.update({ where: { id }, data });
    await this.audit.log(u.id, 'post.update', 'Post', id, { status: dto.status }); return p;
  }

  @Delete('posts/:id')
  async deletePost(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    const cur = await this.prisma.post.findUniqueOrThrow({ where: { id } });
    if (cur.authorId !== u.id && !u.permissions.has('content.manage')) throw new ForbiddenException();
    await this.prisma.post.delete({ where: { id } }); await this.audit.log(u.id, 'post.delete', 'Post', id);
  }

  @Get('posts')
  mine(@CurrentUser() u: AuthUser) {
    if (!this.canPost(u)) throw new ForbiddenException();
    return this.prisma.post.findMany({ where: u.permissions.has('content.manage') ? {} : { authorId: u.id }, orderBy: { updatedAt: 'desc' }, take: 200 });
  }

  /* ---------- custom pages + settings (content managers) ---------- */
  @Post('pages/preview') @RequirePermission('content.manage')
  preview(@Body() dto: PreviewDto) { return { html: renderMarkdown(dto.markdown) }; }

  @Get('pages') @RequirePermission('content.manage')
  pages() { return this.prisma.customPage.findMany({ orderBy: { updatedAt: 'desc' } }); }

  @Post('pages') @RequirePermission('content.manage')
  async createPage(@Body() dto: PageDto, @CurrentUser() u: AuthUser) {
    this.slugCheck(dto.slug);
    try { const p = await this.prisma.customPage.create({ data: { ...dto, published: dto.published ?? false } }); await this.audit.log(u.id, 'page.create', 'CustomPage', p.id); return p; }
    catch (e) { if ((e as { code?: string }).code === 'P2002') throw new ConflictException('نامک تکراری است'); throw e; }
  }

  @Patch('pages/:id') @RequirePermission('content.manage')
  async updatePage(@Param('id') id: string, @Body() dto: Partial<PageDto>, @CurrentUser() u: AuthUser) {
    if (dto.slug) this.slugCheck(dto.slug);
    try { const p = await this.prisma.customPage.update({ where: { id }, data: dto }); await this.audit.log(u.id, 'page.update', 'CustomPage', id, { published: dto.published }); return p; }
    catch (e) { if ((e as { code?: string }).code === 'P2002') throw new ConflictException('نامک تکراری است'); throw e; }
  }

  @Delete('pages/:id') @RequirePermission('content.manage')
  async deletePage(@Param('id') id: string, @CurrentUser() u: AuthUser) { await this.prisma.customPage.delete({ where: { id } }); await this.audit.log(u.id, 'page.delete', 'CustomPage', id); }

  @Put('settings/:key') @RequirePermission('content.manage')
  async putSetting(@Param('key') key: string, @Body() dto: SettingDto, @CurrentUser() u: AuthUser) {
    if (!SETTING_KEYS.includes(key)) throw new NotFoundException();
    const s = await this.prisma.publicSetting.upsert({ where: { key }, update: { value: dto.value as object }, create: { key, value: dto.value as object } });
    await this.audit.log(u.id, 'setting.update', 'PublicSetting', key); return s;
  }
}
