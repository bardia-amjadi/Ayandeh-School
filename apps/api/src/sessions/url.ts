import { isIP } from 'net';

/** Returns a normalized https URL or null. Blocks credentials, non-https, localhost/private/link-local hosts. */
export function safeExternalUrl(input: string): string | null {
  let u: URL;
  try { u = new URL(input.trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  if (!host.includes('.') && !isIP(host)) return null;
  if (isIP(host)) return null; // meeting providers use hostnames; raw IPs are refused
  if (u.href.length > 2000) return null;
  return u.href;
}
