import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const SECRET_KEYS = /pass|token|secret|hash|authorization|cookie/i;
function scrub(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => [k, SECRET_KEYS.test(k) ? '[redacted]' : scrub(val)]));
  }
  return v;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  async log(actorId: string | null, action: string, entity: string, entityId?: string, meta?: unknown, ip?: string) {
    await this.prisma.auditLog.create({
      data: { actorId, action, entity, entityId, meta: meta === undefined ? undefined : (scrub(meta) as object), ip },
    });
  }
}
