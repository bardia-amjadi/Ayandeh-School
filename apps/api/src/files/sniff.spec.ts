import { describe, expect, it } from 'vitest';
import { sniff } from './sniff';
const pad = (b: number[]) => Buffer.from([...b, ...new Array(16).fill(0)]);
describe('sniff', () => {
  it('detects pdf/png/jpeg/zip', () => {
    expect(sniff(pad([0x25, 0x50, 0x44, 0x46]))?.ext).toBe('pdf');
    expect(sniff(pad([0x89, 0x50, 0x4e, 0x47]))?.ext).toBe('png');
    expect(sniff(pad([0xff, 0xd8, 0xff]))?.ext).toBe('jpg');
    expect(sniff(pad([0x50, 0x4b, 0x03, 0x04]))?.ext).toBe('zip');
  });
  it('rejects html/svg/scripts and tiny buffers', () => {
    expect(sniff(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniff(Buffer.from('abc'))).toBeNull();
  });
});
