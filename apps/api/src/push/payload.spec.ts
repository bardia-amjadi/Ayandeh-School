import { describe, expect, it } from 'vitest';
import { buildPayload } from './payload';
describe('buildPayload', () => {
  it('is generic and carries no dynamic content', () => {
    for (const c of ['announcements', 'grades', 'sessions', 'tickets'] as const) {
      const p = JSON.parse(buildPayload(c));
      expect(Object.keys(p).sort()).toEqual(['body', 'tag', 'title', 'url']);
      expect(p.url).toBe('/');
      expect(p.body).not.toMatch(/\d/); // no scores/amounts/ids
    }
  });
});
