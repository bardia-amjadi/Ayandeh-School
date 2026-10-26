import { Role } from '@prisma/client';
import { Request } from 'express';
import { Permission } from './permissions';

export interface AuthUser { id: string; role: Role; username: string; permissions: Set<Permission>; sessionId: string; }
export type AuthedRequest = Request & { user?: AuthUser };
