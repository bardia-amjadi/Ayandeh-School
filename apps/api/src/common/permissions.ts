import { Role } from '@prisma/client';

// Central permission model. DEPUTY permissions are additionally gated by DB rows (DeputyPermission).
export const PERMISSIONS = [
  'users.manage', 'academic.manage', 'grades.manage.all', 'grades.enter',
  'finance.view', 'finance.manage', 'content.manage', 'tickets.manage',
  'sessions.manage.all', 'settings.manage', 'audit.view', 'backup.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ADMIN: Permission[] = [
  'users.manage', 'academic.manage', 'grades.manage.all', 'grades.enter', 'finance.view',
  'finance.manage', 'content.manage', 'tickets.manage', 'sessions.manage.all',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [...PERMISSIONS],
  ADMIN: ADMIN,
  DEPUTY: [], // resolved from DB toggles, limited to the set below
  TEACHER: ['grades.enter'],
  STUDENT: [],
};

// Permissions a deputy can ever be granted (never settings/backup/audit/users).
export const DEPUTY_GRANTABLE: Permission[] = [
  'academic.manage', 'grades.manage.all', 'finance.view', 'content.manage', 'tickets.manage', 'sessions.manage.all',
];
