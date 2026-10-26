import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { CSRF_COOKIE, SESSION_COOKIE } from './auth.guard';
import { CurrentUser, Public } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/types';

class LoginDto { @IsString() @MaxLength(64) username: string; @IsString() @MaxLength(200) password: string; }
class ResetDto { @IsString() @MaxLength(200) token: string; @IsString() @MinLength(10) @MaxLength(200) password: string; }
class ChangePasswordDto { @IsString() current: string; @IsString() @MinLength(10) @MaxLength(200) next: string; }

const secure = process.env.COOKIE_SECURE !== 'false';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @HttpCode(200) @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.username, dto.password, req.ip, req.headers['user-agent']);
    res.cookie(SESSION_COOKIE, r.token, { httpOnly: true, secure, sameSite: 'strict', path: '/', expires: r.expiresAt });
    res.cookie(CSRF_COOKIE, r.csrfToken, { httpOnly: false, secure, sameSite: 'strict', path: '/', expires: r.expiresAt });
    const { passwordHash, ...safe } = r.user;
    return { user: safe, csrfToken: r.csrfToken };
  }

  @HttpCode(204) @Post('logout')
  async logout(@CurrentUser() u: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(u.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' }); res.clearCookie(CSRF_COOKIE, { path: '/' });
  }

  @HttpCode(204) @Post('logout-all')
  async logoutAll(@CurrentUser() u: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(u.id);
    res.clearCookie(SESSION_COOKIE, { path: '/' }); res.clearCookie(CSRF_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() u: AuthUser) { return { id: u.id, username: u.username, role: u.role, permissions: [...u.permissions] }; }

  // Public but needs a valid one-time token; throttled. Responses never reveal whether a user exists.
  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @HttpCode(204) @Post('reset-password')
  async reset(@Body() dto: ResetDto, @Req() req: AuthedRequest) { await this.auth.redeemResetToken(dto.token, dto.password, req.ip); }

  @HttpCode(204) @Post('change-password')
  async change(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(u.id, dto.current, dto.next, u.sessionId);
  }
}
