import { createServer } from 'net';
import { describe, expect, it } from 'vitest';
import { clamScan, parseClamReply } from './clam';

describe('clam', () => {
  it('parses replies', () => {
    expect(parseClamReply('stream: OK\0')).toEqual({ clean: true });
    expect(parseClamReply('stream: Eicar-Test-Signature FOUND\0')).toEqual({ clean: false, signature: 'Eicar-Test-Signature' });
    expect(parseClamReply('INSTREAM size limit exceeded. ERROR').clean).toBe(false);
  });
  it('speaks INSTREAM to a fake clamd', async () => {
    let received = Buffer.alloc(0);
    const srv = createServer(sock => { sock.on('data', d => { received = Buffer.concat([received, d]); if (received.subarray(-4).equals(Buffer.alloc(4))) sock.end('stream: Eicar-Test-Signature FOUND\0'); }); });
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as { port: number }).port;
    const verdict = await clamScan(Buffer.from('X5O!P%@AP-fake'), '127.0.0.1', port);
    srv.close();
    expect(received.subarray(0, 10).toString()).toBe('zINSTREAM\0');
    expect(verdict).toEqual({ clean: false, signature: 'Eicar-Test-Signature' });
  });
});
