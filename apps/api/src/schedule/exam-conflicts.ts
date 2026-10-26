export interface ExamSlot { id?: string; classId: string; teacherId?: string | null; startsAt: Date; endsAt: Date; label?: string; }
export interface ExamConflict { kind: 'CLASS' | 'TEACHER'; withId?: string; withLabel?: string; }

/** Warnings only; saving is never blocked. */
export function findExamConflicts(c: ExamSlot, existing: ExamSlot[]): ExamConflict[] {
  const out: ExamConflict[] = [];
  for (const e of existing) {
    if (c.id && e.id === c.id) continue;
    if (!(c.startsAt < e.endsAt && e.startsAt < c.endsAt)) continue;
    if (e.classId === c.classId) out.push({ kind: 'CLASS', withId: e.id, withLabel: e.label });
    if (c.teacherId && e.teacherId === c.teacherId) out.push({ kind: 'TEACHER', withId: e.id, withLabel: e.label });
  }
  return out;
}
