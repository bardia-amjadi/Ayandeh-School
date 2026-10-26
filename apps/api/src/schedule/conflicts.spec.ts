import { describe, expect, it } from 'vitest';
import { findConflicts } from './conflicts';

const base = { classId: 'c1', teacherId: 't1', weekday: 0, startMinute: 480, endMinute: 540 };
describe('findConflicts', () => {
  it('detects same-class overlap', () => {
    expect(findConflicts(base, [{ ...base, id: 'x', teacherId: 't2', startMinute: 500, endMinute: 560 }]).map(c => c.kind)).toEqual(['CLASS']);
  });
  it('detects same-teacher overlap across classes', () => {
    expect(findConflicts(base, [{ ...base, id: 'x', classId: 'c2' }]).map(c => c.kind)).toEqual(['TEACHER']);
  });
  it('both kinds at once', () => {
    expect(findConflicts(base, [{ ...base, id: 'x' }]).map(c => c.kind).sort()).toEqual(['CLASS', 'TEACHER']);
  });
  it('back-to-back slots and other days do not conflict', () => {
    expect(findConflicts(base, [{ ...base, id: 'a', startMinute: 540, endMinute: 600 }, { ...base, id: 'b', weekday: 1 }])).toEqual([]);
  });
  it('ignores itself when editing', () => {
    expect(findConflicts({ ...base, id: 'x' }, [{ ...base, id: 'x' }])).toEqual([]);
  });
});
