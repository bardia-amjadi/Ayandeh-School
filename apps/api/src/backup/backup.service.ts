import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma.service';
import { BACKUP_NAME_RE, backupName, parseDbUrl } from './backup.util';

// In-process write lock: uploads are refused while a backup runs so DB dump and files stay consistent.
// (Single API instance assumed, as deployed by the provided compose file.)
export const backupState = { running: false };

const run = (cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env) => new Promise<void>((resolve, reject) => {
  const c = spawn(cmd, args, { env, stdio: ['ignore', 'ignore', 'pipe'] }); let err = '';
  c.stderr.on('data', d => { err += d; });
  c.on('error', reject);
  c.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(0, 300)}`)));
});

@Injectable()
export class BackupService {
  private dir = path.resolve(process.env.BACKUP_DIR ?? './backups');
  private uploads = path.resolve(process.env.UPLOAD_DIR ?? './uploads');
  constructor(private prisma: PrismaService) {}

  async create() {
    if (backupState.running) throw new BadRequestException('پشتیبان‌گیری در حال انجام است');
    backupState.running = true;
    const name = backupName(new Date());
    const work = path.join(this.dir, `.tmp-${name}`);
    try {
      await fs.mkdir(work, { recursive: true, mode: 0o700 });
      const db = parseDbUrl(process.env.DATABASE_URL!);
      await run('pg_dump', ['-Fc', '-h', db.host, '-p', db.port, '-U', db.user, '-d', db.db, '-f', path.join(work, 'db.dump')], { ...process.env, PGPASSWORD: db.password });
      await fs.mkdir(this.uploads, { recursive: true });
      await run('tar', ['-cf', path.join(work, 'uploads.tar'), '-C', this.uploads, '.']);
      const [files, migrations] = await Promise.all([
        this.prisma.fileAsset.count(),
        this.prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY started_at`.catch(() => []),
      ]);
      const sha = async (f: string) => { const h = createHash('sha256'); for await (const c of createReadStream(path.join(work, f))) h.update(c); return h.digest('hex'); };
      const manifest = { createdAt: new Date().toISOString(), format: 1, fileAssetCount: files, migrations: migrations.map(m => m.migration_name), sha256: { 'db.dump': await sha('db.dump'), 'uploads.tar': await sha('uploads.tar') } };
      await fs.writeFile(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));
      const out = path.join(this.dir, name);
      await run('tar', ['-cf', out + '.part', '-C', work, 'manifest.json', 'db.dump', 'uploads.tar']);
      await fs.rename(out + '.part', out); await fs.chmod(out, 0o600);
      return { name, size: (await fs.stat(out)).size, manifest };
    } finally {
      await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
      backupState.running = false;
    }
  }

  async list() {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const names = (await fs.readdir(this.dir)).filter(n => BACKUP_NAME_RE.test(n)).sort().reverse();
    return Promise.all(names.map(async name => ({ name, size: (await fs.stat(path.join(this.dir, name))).size })));
  }

  stream(name: string) {
    if (!BACKUP_NAME_RE.test(name)) throw new BadRequestException('نام نامعتبر');
    return createReadStream(path.join(this.dir, name));
  }

  assertNotRunning() { if (backupState.running) throw new ServiceUnavailableException('سیستم در حال پشتیبان‌گیری است؛ چند دقیقه بعد تلاش کنید'); }
}
