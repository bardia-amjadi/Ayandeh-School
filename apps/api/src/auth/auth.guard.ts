import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma.service';
import { IS_PUBLIC } from '../common/decorators';
import { AuthedRequest } from '../common/types';
import { DEPUTY_GRANTABLE, Permission, ROLE_PERMISSIONS } from '../common/permissions';

export const SESSION_COOKIE = 'ayandeh_sid';
export const CSRF_COOKIE = 'ayandeh_csrf';
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const handler = ctx.getHandler(); const cls = ctx.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [handler, cls]);
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const raw = req.cookies?.[SESSION_COOKIE] as string | undefined;

    if (!raw) { if (isPublic) return true; throw new UnauthorizedException('ورود لازم است'); }
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(raw) }, include: { user: true } });
    const valid = session && !session.revokedAt && session.expiresAt > new Date() && session.user.active;
    if (!valid) { if (isPublic) return true; throw new UnauthorizedException('نشست نامعتبر یا منقضی است'); }

    // CSRF: double-submit token for every state-changing request on an authenticated session
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const header = String(req.headers['x-csrf-token'] ?? '');
      const a = Buffer.from(header); const b = Buffer.from(session!.csrfToken);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('توکن CSRF نامعتبر است');
    }

    const user = session!.user;
    let perms = new Set<Permission>(ROLE_PERMISSIONS[user.role]);
    if (user.role === 'DEPUTY') {
      const rows = await this.prisma.deputyPermission.findMany({ where: { enabled: true } });
      perms = new Set(rows.map(r => r.permission as Permission).filter(p => DEPUTY_GRANTABLE.includes(p)));
    }
    req.user = { id: user.id, role: user.role, username: user.username, permissions: perms, sessionId: session!.id };
    return true;
  }
}
