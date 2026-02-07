import type { SpaceAccessType } from './user';

/** How a user got access to a space */
export type AccessSource =
  | { type: 'direct' }
  | { type: 'group'; groupName: string }
  | { type: 'multiple'; groups: string[]; hasDirect: boolean };

/** A single group's contribution to a user's access on a space */
export interface IGroupAccessContribution {
  groupName: string;
  accessType: 'readonly' | 'readwrite';
}

/** Resolved effective access for a user ↔ space relationship */
export interface IEffectiveAccess {
  effectiveAccess: SpaceAccessType | 'none';
  directAccess: SpaceAccessType | null;
  groupAccesses: IGroupAccessContribution[];
  source: AccessSource;
}

/** "By Space" perspective row — one row per user with effective access */
export interface ISpaceAccessRow extends IEffectiveAccess {
  username: string;
}

/** "By User" perspective row — one row per space */
export interface IUserAccessRow extends IEffectiveAccess {
  spaceName: string;
}

/** "By Group" perspective row — one row per space the group accesses */
export interface IGroupAccessRow {
  spaceName: string;
  accessType: 'readonly' | 'readwrite';
  inheritingUsers: string[];
}

/** Perspective options for the Access Management view */
export type AccessPerspective = 'space' | 'user' | 'group';
