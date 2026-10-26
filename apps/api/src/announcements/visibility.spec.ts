import { describe, expect, it } from 'vitest';
import { visibleToStudent } from './visibility';
const now = new Date('2026-10-24T10:00:00Z');
const base = { published: true, audience: 'ALL' as const, classIds: [] };
describe('visibleToStudent', () => {
  it('drafts hidden', () => expect(visibleToStudent({ ...base, published: false }, 'c1', now)).toBe(false));
  it('future publishAt hidden', () => expect(visibleToStudent({ ...base, publishAt: new Date('2026-10-25') }, 'c1', now)).toBe(false));
  it('expired hidden', () => expect(visibleToStudent({ ...base, expiresAt: new Date('2026-10-24T09:00:00Z') }, 'c1', now)).toBe(false));
  it('class-targeted only for that class', () => {
    const a = { ...base, audience: 'CLASSES' as const, classIds: ['c1'] };
    expect(visibleToStudent(a, 'c1', now)).toBe(true); expect(visibleToStudent(a, 'c2', now)).toBe(false); expect(visibleToStudent(a, null, now)).toBe(false);
  });
});
