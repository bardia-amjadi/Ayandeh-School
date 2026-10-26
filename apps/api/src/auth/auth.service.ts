import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { hashToken } from './auth.guard';

const SESSION_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);
// Dummy hash so unknown-user and wrong-password take comparable time.
const DUMMY = argon2.hash('dummy-password-for-timing');

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async login(username: string, password: string, ip?: string, ua?: string) {
    const user = await this.prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
    const ok = user ? await argon2.verify(user.passwordHash, password) : (await argon2.verify(await DUMMY, password), false);
    if (!user || !ok || !user.active) {
      await this.audit.log(user?.id ?? null, 'auth.login_failed', 'User', user?.id, { username }, ip);
      throw new UnauthorizedException('نام کاربری یا گذرواژه نادرست است');
    }
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
    await this.prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(token), csrfToken, expiresAt, ip, userAgent: ua?.slice(0, 255) } });
    await this.audit.log(user.id, 'auth.login', 'User', user.id, undefined, ip);
    return { token, csrfToken, expiresAt, user };
  }

  /** Admin issues a one-time reset token (shown once). Only its hash is stored. */
  async issueResetToken(actorId: string, userId: string) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
    await this.prisma.passwordResetToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) } });
    await this.audit.log(actorId, 'auth.reset_token_issued', 'User', userId);
    return token;
  }

  async redeemResetToken(token: string, password: string, ip?: string) {
    const t = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!t || t.usedAt || t.expiresAt < new Date()) throw new BadRequestException('لینک بازیابی نامعتبر یا منقضی است');
    const hash = await argon2.hash(password);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: t.userId }, data: { passwordHash: hash, mustChangePassword: false } }),
      this.prisma.session.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log(t.userId, 'auth.password_reset', 'User', t.userId, undefined, ip);
  }

  async logout(sessionId: string) {
    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }

  async logoutAll(userId: string) {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log(userId, 'auth.logout_all', 'User', userId);
  }

  async changePassword(userId: string, current: string, next: string, keepSessionId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, current))) throw new BadRequestException('گذرواژه فعلی نادرست است');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(next), mustChangePassword: false } });
    // revoke every other session
    await this.prisma.session.updateMany({ where: { userId, id: { not: keepSessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log(userId, 'auth.password_changed', 'User', userId);
  }
}
