export interface AnnouncementLike { published: boolean; publishAt?: Date | null; expiresAt?: Date | null; audience: 'ALL' | 'CLASSES'; classIds: string[]; }
/** Student-facing visibility; also used to build DB filters conceptually. */
export function visibleToStudent(a: AnnouncementLike, studentClassId: string | null | undefined, now = new Date()): boolean {
  if (!a.published) return false;
  if (a.publishAt && a.publishAt > now) return false;
  if (a.expiresAt && a.expiresAt <= now) return false;
  if (a.audience === 'ALL') return true;
  return !!studentClassId && a.classIds.includes(studentClassId);
}
