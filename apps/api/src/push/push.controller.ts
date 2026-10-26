import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma.service';
import { CurrentUser, Public } from '../common/decorators';
import { AuthUser } from '../common/types';

class SubDto { @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(1000) endpoint: string; @IsString() @MaxLength(200) p256dh: string; @IsString() @MaxLength(100) auth: string; }
class UnsubDto { @IsString() @MaxLength(1000) endpoint: string; }
class PrefsDto { @IsOptional() @IsBoolean() announcements?: boolean; @IsOptional() @IsBoolean() grades?: boolean; @IsOptional() @IsBoolean() sessions?: boolean; @IsOptional() @IsBoolean() tickets?: boolean; }

@Controller('push')
export class PushController {
  constructor(private prisma: PrismaService) {}

  @Public() @Get('public-key')
  key() { return { publicKey: process.env.VAPID_PUBLIC_KEY ?? null }; }

  @HttpCode(204) @Post('subscribe')
  async subscribe(@Body() dto: SubDto, @CurrentUser() u: AuthUser) {
    // Re-subscribing the same endpoint moves it to the current user (shared device after logout/login).
    await this.prisma.pushSubscription.upsert({ where: { endpoint: dto.endpoint }, update: { userId: u.id, p256dh: dto.p256dh, auth: dto.auth }, create: { userId: u.id, ...dto } });
  }

  @HttpCode(204) @Delete('subscribe')
  async unsubscribe(@Body() dto: UnsubDto, @CurrentUser() u: AuthUser) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint: dto.endpoint, userId: u.id } });
  }

  @Get('preferences')
  async prefs(@CurrentUser() u: AuthUser) {
    return (await this.prisma.notificationPreference.findUnique({ where: { userId: u.id } })) ?? { announcements: true, grades: true, sessions: true, tickets: true };
  }

  @Put('preferences')
  async setPrefs(@Body() dto: PrefsDto, @CurrentUser() u: AuthUser) {
    return this.prisma.notificationPreference.upsert({ where: { userId: u.id }, update: dto, create: { userId: u.id, ...dto } });
  }
}
