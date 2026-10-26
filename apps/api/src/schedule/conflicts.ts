export interface Slot { id?: string; classId: string; teacherId?: string | null; weekday: number; startMinute: number; endMinute: number; label?: string; }
export interface Conflict { kind: 'CLASS' | 'TEACHER'; withId?: string; withLabel?: string; }

const overlaps = (a: Slot, b: Slot) => a.weekday === b.weekday && a.startMinute < b.endMinute && b.startMinute < a.endMinute;

/** Returns warnings only; callers must still save (conflicts never block). */
export function findConflicts(candidate: Slot, existing: Slot[]): Conflict[] {
  const out: Conflict[] = [];
  for (const e of existing) {
    if (candidate.id && e.id === candidate.id) continue;
    if (!overlaps(candidate, e)) continue;
    if (e.classId === candidate.classId) out.push({ kind: 'CLASS', withId: e.id, withLabel: e.label });
    if (candidate.teacherId && e.teacherId === candidate.teacherId) out.push({ kind: 'TEACHER', withId: e.id, withLabel: e.label });
  }
  return out;
}
