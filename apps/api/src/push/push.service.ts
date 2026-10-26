import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma.service';
import { buildPayload, PushCategory } from './payload';

@Injectable()
export class PushService {
  private log = new Logger('Push');
  readonly enabled: boolean;
  constructor(private prisma: PrismaService) {
    const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: sub } = process.env;
    this.enabled = !!(pub && priv && sub);
    if (this.enabled) webpush.setVapidDetails(sub!, pub!, priv!);
    else this.log.warn('VAPID keys not configured: push disabled');
  }

  /** Fire-and-forget; never throws into the request path. Respects per-user category preferences. */
  async notify(userIds: string[], category: PushCategory) {
    if (!this.enabled || !userIds.length) return;
    try {
      const subs = await this.prisma.pushSubscription.findMany({
        where: { userId: { in: userIds }, user: { active: true, OR: [{ prefs: null }, { prefs: { [category]: true } }] } } });
      const payload = buildPayload(category);
      await Promise.all(subs.map(async s => {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 }); }
        catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined); }
      }));
    } catch (e) { this.log.error(String(e)); }
  }
}
