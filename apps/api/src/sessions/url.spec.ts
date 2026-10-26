import { describe, expect, it } from 'vitest';
import { safeExternalUrl } from './url';
describe('safeExternalUrl', () => {
  it('accepts normal https meeting links', () => expect(safeExternalUrl('https://meet.example.com/abc-def')).toBe('https://meet.example.com/abc-def'));
  it.each(['http://meet.example.com/x', 'javascript:alert(1)', 'data:text/html,hi', 'https://user:pw@meet.example.com/', 'https://localhost/x',
    'https://127.0.0.1/x', 'https://[::1]/x', 'https://intranet/x', 'https://a.local/x', 'not a url', 'ftp://x.com/f'])('rejects %s', u => expect(safeExternalUrl(u)).toBeNull());
});
