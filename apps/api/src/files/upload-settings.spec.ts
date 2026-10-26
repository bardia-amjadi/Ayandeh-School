import { describe, expect, it } from 'vitest';
import { normalizeUploadSettings } from './upload-settings';
describe('normalizeUploadSettings', () => {
  it('defaults', () => { const s = normalizeUploadSettings(undefined); expect(s.allowedExts).toContain('pdf'); expect(s.maxMb).toBeGreaterThan(0); });
  it('clamps size to ceiling and drops unknown/dangerous extensions', () => {
    const s = normalizeUploadSettings({ maxMb: 100000, allowedExts: ['pdf', 'exe', 'html', 'svg'] });
    expect(s.maxMb).toBeLessThanOrEqual(50); expect(s.allowedExts).toEqual(['pdf']);
  });
  it('lowers size', () => expect(normalizeUploadSettings({ maxMb: 5 }).maxMb).toBe(5));
});
