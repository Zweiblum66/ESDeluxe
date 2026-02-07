import type { IdentitySource } from './auth';

/** Access type for space membership */
export type SpaceAccessType = 'readonly' | 'readwrite' | 'admin';

/** User list item */
export interface IUser {
  username: string;
  displayName?: string;
  email?: string;
  identitySource: IdentitySource;
  isMaintenance: boolean;
  uid?: number;
}

/** User detail with memberships */
export interface IUserDetail extends IUser {
  spaces: IUserSpaceAccess[];
  groups: string[];
}

/** User's access to a specific space */
export interface IUserSpaceAccess {
  spaceName: string;
  accessType: SpaceAccessType;
  hasOverride?: boolean; // True if user has explicit override (not just group inheritance)
}

/** Create user request */
export interface ICreateUserRequest {
  username: string;
  password: string;
}

/** Update user password request */
export interface IUpdatePasswordRequest {
  password: string;
}

/** Update user groups request */
export interface IUpdateUserGroupsRequest {
  groups: string[];
}
