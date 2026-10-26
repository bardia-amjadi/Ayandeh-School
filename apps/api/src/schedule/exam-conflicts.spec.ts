import { describe, expect, it } from 'vitest';
import { findExamConflicts } from './exam-conflicts';
const d = (h: number) => new Date(Date.UTC(2026, 11, 1, h));
const base = { classId: 'c1', teacherId: 't1', startsAt: d(8), endsAt: d(10) };
describe('findExamConflicts', () => {
  it('class + teacher overlap', () => expect(findExamConflicts(base, [{ ...base, id: 'x', startsAt: d(9), endsAt: d(11) }]).map(c => c.kind).sort()).toEqual(['CLASS', 'TEACHER']));
  it('adjacent exams do not conflict', () => expect(findExamConflicts(base, [{ ...base, id: 'x', startsAt: d(10), endsAt: d(12) }])).toEqual([]));
  it('different class and teacher is fine', () => expect(findExamConflicts(base, [{ ...base, id: 'x', classId: 'c2', teacherId: 't2' }])).toEqual([]));
});
