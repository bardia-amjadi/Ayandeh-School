import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { expect } from 'vitest';

/** Cookie + CSRF aware API client, mirroring what the browser does. */
export class Client {
  cookie = ''; csrf = '';
  constructor(private app: INestApplication) {}
  static anon(app: INestApplication) { return new Client(app); }
  async login(username: string, password: string) {
    const r = await request(this.app.getHttpServer()).post('/api/auth/login').send({ username, password });
    expect(r.status, `login ${username}: ${JSON.stringify(r.body)}`).toBe(200);
    this.cookie = (r.headers['set-cookie'] as unknown as string[]).map(c => c.split(';')[0]).join('; '); this.csrf = r.body.csrfToken; return this;
  }
  private req(m: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, csrf = true) {
    let t = request(this.app.getHttpServer())[m](`/api${path}`);
    if (this.cookie) t = t.set('Cookie', this.cookie);
    if (this.csrf && m !== 'get' && csrf) t = t.set('x-csrf-token', this.csrf);
    return t;
  }
  get = (p: string) => this.req('get', p);
  post = (p: string, body?: object) => this.req('post', p).send(body);
  postNoCsrf = (p: string, body?: object) => this.req('post', p, false).send(body);
  patch = (p: string, body?: object) => this.req('patch', p).send(body);
  put = (p: string, body?: object) => this.req('put', p).send(body);
  del = (p: string, body?: object) => this.req('delete', p).send(body);
  upload = (p: string, fields: Record<string, string>, file: { buf: Buffer; name: string }) => {
    let t = this.req('post', p); for (const [k, v] of Object.entries(fields)) t = t.field(k, v); return t.attach('file', file.buf, file.name);
  };
}
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
export const future = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
