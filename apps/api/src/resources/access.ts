export interface ResourceInfo { scope: 'GENERAL' | 'CLASS'; classId?: string | null; gradeLevelId?: string | null; subjectId?: string | null; creatorId: string; }
export interface Viewer {
  id: string; role: 'SUPER_ADMIN' | 'ADMIN' | 'DEPUTY' | 'TEACHER' | 'STUDENT'; canManageContent: boolean;
  teachesClassIds: string[];            // teacher: classes they are assigned to
  studentClassId?: string | null; studentGradeLevelId?: string | null; studentSubjectIds?: string[];
}

export function canAccessResource(r: ResourceInfo, v: Viewer): boolean {
  if (v.canManageContent) return true;
  if (v.role === 'TEACHER') return r.creatorId === v.id || (!!r.classId && v.teachesClassIds.includes(r.classId)) || r.scope === 'GENERAL';
  if (v.role !== 'STUDENT') return false;
  if (r.scope === 'CLASS') return !!r.classId && r.classId === v.studentClassId;      // members of that class only
  if (r.gradeLevelId && r.gradeLevelId !== v.studentGradeLevelId) return false;
  if (r.subjectId && !(v.studentSubjectIds ?? []).includes(r.subjectId)) return false;
  if (r.classId && r.classId !== v.studentClassId) return false;
  return true;
}
