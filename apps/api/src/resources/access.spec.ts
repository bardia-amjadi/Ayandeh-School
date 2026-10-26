import { describe, expect, it } from 'vitest';
import { canAccessResource, Viewer } from './access';
const student: Viewer = { id: 's1', role: 'STUDENT', canManageContent: false, teachesClassIds: [], studentClassId: 'c1', studentGradeLevelId: 'g10', studentSubjectIds: ['math'] };
const gen = { scope: 'GENERAL' as const, creatorId: 't1' };
describe('canAccessResource', () => {
  it('general without restrictions is open to students', () => expect(canAccessResource(gen, student)).toBe(true));
  it('grade mismatch denied', () => expect(canAccessResource({ ...gen, gradeLevelId: 'g11' }, student)).toBe(false));
  it('subject mismatch denied', () => expect(canAccessResource({ ...gen, subjectId: 'phys' }, student)).toBe(false));
  it('class attachment only for that class', () => {
    const r = { scope: 'CLASS' as const, classId: 'c1', creatorId: 't1' };
    expect(canAccessResource(r, student)).toBe(true);
    expect(canAccessResource({ ...r, classId: 'c2' }, student)).toBe(false);
  });
  it('teacher: own or taught class only for class files', () => {
    const t: Viewer = { id: 't2', role: 'TEACHER', canManageContent: false, teachesClassIds: ['c1'] };
    expect(canAccessResource({ scope: 'CLASS', classId: 'c1', creatorId: 'x' }, t)).toBe(true);
    expect(canAccessResource({ scope: 'CLASS', classId: 'c9', creatorId: 'x' }, t)).toBe(false);
  });
});
