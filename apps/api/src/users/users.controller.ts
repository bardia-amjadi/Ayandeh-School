import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AuthService } from '../auth/auth.service';

class CreateUserDto {
  @IsString() @Matches(/^[a-z0-9._-]{3,32}$/) username: string;
  @IsString() @MinLength(10) @MaxLength(200) password: string;
  @IsEnum(Role) role: Role;
  @IsString() @MaxLength(80) firstName: string;
  @IsString() @MaxLength(80) lastName: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(32) identifier?: string;
}
// Explicit allow-list DTO: no role/password/active here (mass-assignment protection).
class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsEnum(Role) role?: Role;
}

const PUBLIC_SELECT = { id: true, username: true, email: true, role: true, active: true, firstName: true, lastName: true, phone: true, identifier: true, createdAt: true } as const;

// Who may create / modify which roles.
function assertCanManage(actor: AuthUser, target: Role) {
  if (actor.role === 'SUPER_ADMIN') return;
  if (actor.role === 'ADMIN' && (target === 'TEACHER' || target === 'STUDENT' || target === 'DEPUTY')) return;
  throw new ForbiddenException('اجازه مدیریت این نقش را ندارید');
}

@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService, private audit: AuditService, private auth: AuthService) {}

  @Get() @RequirePermission('users.manage')
  async list(@Query('q') q?: string, @Query('role') role?: Role, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    const take = Math.min(Number(pageSize) || 20, 100); const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where = {
      ...(role ? { role } : {}),
      ...(q ? { OR: [
        { username: { contains: q, mode: 'insensitive' as const } },
        { firstName: { contains: q, mode: 'insensitive' as const } },
        { lastName: { contains: q, mode: 'insensitive' as const } },
        { identifier: { contains: q } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: PUBLIC_SELECT, orderBy: { createdAt: 'desc' }, take, skip }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: Number(page), pageSize: take };
  }

  // Minimal people picker for forms (students/teachers only) for staff who manage something that needs it.
  @Get('lookup')
  async lookup(@CurrentUser() actor: AuthUser, @Query('role') role: 'STUDENT' | 'TEACHER' = 'STUDENT', @Query('q') q?: string) {
    if (!(['users.manage', 'finance.manage', 'academic.manage', 'content.manage'] as const).some(p => actor.permissions.has(p))) throw new ForbiddenException();
    if (role !== 'STUDENT' && role !== 'TEACHER') throw new BadRequestException();
    return this.prisma.user.findMany({
      where: { role, active: true, ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }, { identifier: { contains: q } }] } : {}) },
      select: { id: true, firstName: true, lastName: true, username: true, identifier: true }, orderBy: { lastName: 'asc' }, take: 30 });
  }

  @Post() @RequirePermission('users.manage')
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    assertCanManage(actor, dto.role);
    const user = await this.prisma.user.create({
      data: { ...dto, passwordHash: await argon2.hash(dto.password), mustChangePassword: true },
      select: PUBLIC_SELECT,
    });
    await this.audit.log(actor.id, 'user.create', 'User', user.id, { role: dto.role, username: dto.username });
    return user;
  }

  @Patch(':id') @RequirePermission('users.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    assertCanManage(actor, target.role);
    if (dto.role) assertCanManage(actor, dto.role);
    if (id === actor.id && (dto.active === false || (dto.role && dto.role !== target.role)))
      throw new BadRequestException('نمی‌توانید حساب یا نقش خود را تغییر دهید');
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: PUBLIC_SELECT });
    if (dto.active === false || dto.role) await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log(actor.id, 'user.update', 'User', id, dto);
    return user;
  }

  @Post(':id/reset-link') @RequirePermission('users.manage')
  async resetLink(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    assertCanManage(actor, target.role);
    return { token: await this.auth.issueResetToken(actor.id, id), expiresInMinutes: 60 }; // give to the user out-of-band
  }

  @Post(':id/reset-password') @RequirePermission('users.manage')
  async reset(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    assertCanManage(actor, target.role);
    const temp = randomBytes(9).toString('base64url');
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await argon2.hash(temp), mustChangePassword: true } });
    await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log(actor.id, 'user.reset_password', 'User', id);
    return { temporaryPassword: temp }; // shown once to the administrator
  }
}
