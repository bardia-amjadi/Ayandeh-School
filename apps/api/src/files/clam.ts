import { Socket } from 'net';

/** Parses a clamd reply like "stream: OK" / "stream: Eicar-Test-Signature FOUND" / "... ERROR". */
export function parseClamReply(reply: string): { clean: boolean; signature?: string; error?: string } {
  const r = reply.replace(/\0/g, '').trim();
  if (/\bOK$/.test(r)) return { clean: true };
  const m = /^stream:\s*(.+?)\s+FOUND$/.exec(r);
  if (m) return { clean: false, signature: m[1] };
  return { clean: false, error: r || 'empty reply' };
}

/** clamd INSTREAM protocol over TCP. Resolves with the parsed verdict; rejects on connection problems. */
export function clamScan(buf: Buffer, host: string, port: number, timeoutMs = 20_000): Promise<ReturnType<typeof parseClamReply>> {
  return new Promise((resolve, reject) => {
    const s = new Socket(); let out = '';
    s.setTimeout(timeoutMs, () => { s.destroy(); reject(new Error('clamd timeout')); });
    s.on('error', reject);
    s.on('data', d => { out += d.toString('utf8'); });
    s.on('close', () => resolve(parseClamReply(out)));
    s.connect(port, host, () => {
      s.write('zINSTREAM\0');
      for (let off = 0; off < buf.length; off += 65536) {
        const chunk = buf.subarray(off, Math.min(off + 65536, buf.length)); const len = Buffer.alloc(4); len.writeUInt32BE(chunk.length);
        s.write(len); s.write(chunk);
      }
      s.write(Buffer.alloc(4)); // zero-length terminator
    });
  });
}
