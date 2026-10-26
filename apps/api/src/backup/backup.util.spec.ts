import { describe, expect, it } from 'vitest';
import { BACKUP_NAME_RE, backupName, parseDbUrl } from './backup.util';
describe('backup util', () => {
  it('names are valid and traversal is rejected', () => {
    expect(BACKUP_NAME_RE.test(backupName(new Date('2026-10-24T12:03:09Z')))).toBe(true);
    expect(backupName(new Date('2026-10-24T12:03:09Z'))).toBe('backup-20261024-120309.tar');
    for (const n of ['../etc/passwd', 'backup-1.tar', 'backup-20261024-120309.tar/../x', 'x.tar']) expect(BACKUP_NAME_RE.test(n)).toBe(false);
  });
  it('parses database url incl. encoded password', () => {
    expect(parseDbUrl('postgresql://u:p%40ss@db:5432/app')).toEqual({ host: 'db', port: '5432', user: 'u', password: 'p@ss', db: 'app' });
  });
});
