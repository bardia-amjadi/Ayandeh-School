export const BACKUP_NAME_RE = /^backup-\d{8}-\d{6}\.tar$/;
const p2 = (n: number) => String(n).padStart(2, '0');
export const backupName = (d: Date) => `backup-${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}-${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}.tar`;

/** Split DATABASE_URL so the password goes via PGPASSWORD (not visible in the process list). */
export function parseDbUrl(url: string) {
  const u = new URL(url);
  return { host: u.hostname, port: u.port || '5432', user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), db: u.pathname.replace(/^\//, '') };
}
