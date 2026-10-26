/* One-time bootstrap. Reads credentials from env (never from source control):
 *   SUPERADMIN_USERNAME, SUPERADMIN_PASSWORD (>=12 chars), optional SUPERADMIN_FIRST_NAME/LAST_NAME
 * Refuses to run if a super admin already exists. There is no public registration endpoint. */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

export class BootstrapError extends Error { constructor(msg: string, public code: number) { super(msg); } }

export async function createSuperAdmin(prisma: PrismaClient, o: { username?: string; password?: string; firstName?: string; lastName?: string }) {
  const username = o.username?.trim().toLowerCase();
  if (!username || !/^[a-z0-9._-]{3,32}$/.test(username) || !o.password || o.password.length < 12) throw new BootstrapError('A valid username and a password of at least 12 characters are required.', 1);
  if (await prisma.user.count({ where: { role: 'SUPER_ADMIN' } })) throw new BootstrapError('A super admin already exists. Aborting.', 2);
  const u = await prisma.user.create({ data: { username, passwordHash: await argon2.hash(o.password), role: 'SUPER_ADMIN', firstName: o.firstName ?? 'ادمین', lastName: o.lastName ?? 'کل' } });
  await prisma.auditLog.create({ data: { actorId: u.id, action: 'bootstrap.super_admin', entity: 'User', entityId: u.id } });
  return u;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  createSuperAdmin(prisma, { username: process.env.SUPERADMIN_USERNAME, password: process.env.SUPERADMIN_PASSWORD, firstName: process.env.SUPERADMIN_FIRST_NAME, lastName: process.env.SUPERADMIN_LAST_NAME })
    .then(u => { console.log(`Super admin "${u.username}" created.`); })
    .catch(e => { console.error(e instanceof BootstrapError ? e.message : e); process.exitCode = e instanceof BootstrapError ? e.code : 1; })
    .finally(() => prisma.$disconnect());
}
