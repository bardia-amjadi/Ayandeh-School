import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Permission } from '../common/permissions';
import { AuthedRequest } from '../common/types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>('roles', [ctx.getHandler(), ctx.getClass()]);
    const perms = this.reflector.getAllAndOverride<Permission[] | undefined>('permissions', [ctx.getHandler(), ctx.getClass()]);
    if (!roles && !perms) return true;
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw new ForbiddenException();
    if (roles && !roles.includes(user.role)) throw new ForbiddenException('دسترسی مجاز نیست');
    if (perms && !perms.every(p => user.permissions.has(p))) throw new ForbiddenException('دسترسی مجاز نیست');
    return true;
  }
}
