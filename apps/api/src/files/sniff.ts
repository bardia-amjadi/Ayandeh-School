// Content-based type detection (magic bytes). The client-declared mimetype/extension is never trusted.
export interface Detected { mime: string; ext: string; }

const startsWith = (b: Buffer, sig: number[], off = 0) => sig.every((v, i) => b[off + i] === v);

export function sniff(b: Buffer): Detected | null {
  if (b.length < 12) return null;
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return { mime: 'application/pdf', ext: 'pdf' };
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return { mime: 'image/png', ext: 'png' };
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return { mime: 'image/gif', ext: 'gif' };
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && b.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return { mime: 'application/zip', ext: 'zip' };
  if (b.toString('ascii', 4, 8) === 'ftyp') return { mime: 'video/mp4', ext: 'mp4' };
  if (startsWith(b, [0x49, 0x44, 0x33]) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', ext: 'mp3' };
  return null; // SVG/HTML/executables etc. are intentionally NOT accepted
}
