import type { SpaceAccessType } from './user';

/** Media space type */
export type SpaceType = 'avidstyle' | 'avidmxf' | 'managed' | 'unmanaged' | 'acl';

/** Media space list item */
export interface ISpace {
  name: string;
  uuid?: string;
  type: SpaceType;
  maintenanceUser?: string;
  goal?: string;
  quota: number;
  used: number;
  usedPercent: number;
  options?: string;
}

/** Media space detail */
export interface ISpaceDetail extends ISpace {
  users: ISpaceUserAccess[];
  groups: ISpaceGroupAccess[];
  isPublic: boolean;
}

/** User access within a space */
export interface ISpaceUserAccess {
  username: string;
  accessType: SpaceAccessType;
  readonly: boolean;
  hasOverride?: boolean; // True if user has explicit override (not just group inheritance)
}

/** Group access within a space */
export interface ISpaceGroupAccess {
  groupName: string;
  accessType: 'readonly' | 'readwrite';
}

/** Create space request */
export interface ICreateSpaceRequest {
  name: string;
  type: SpaceType;
  quota?: number;
  bitbucket?: string;
}

/** Update space request */
export interface IUpdateSpaceRequest {
  name?: string;
  quota?: number;
  isPublic?: boolean;
}

/** Clone space request */
export interface ICloneSpaceRequest {
  newName: string;
  copyUsers?: boolean;
  copyGroups?: boolean;
}

/** Result of a space clone operation */
export interface ICloneSpaceResult {
  sourceName: string;
  newName: string;
  usersCopied: number;
  groupsCopied: number;
  warnings: string[];
}
