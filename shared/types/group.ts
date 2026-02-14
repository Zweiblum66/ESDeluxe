import type { IdentitySource } from './auth';

/** Group list item */
export interface IGroup {
  name: string;
  identitySource?: IdentitySource;
  maintenanceSpaces?: string[];
}

/** Group detail with memberships */
export interface IGroupDetail extends IGroup {
  users: string[];
  spaces: IGroupSpaceAccess[];
}

/** Group's access to a specific space */
export interface IGroupSpaceAccess {
  spaceName: string;
  accessType: 'readonly' | 'readwrite';
}

/** Create group request */
export interface ICreateGroupRequest {
  name: string;
  description?: string;
}

/** Update group members request */
export interface IUpdateGroupMembersRequest {
  add?: string[];
  remove?: string[];
}

/** Bulk add users to group request */
export interface IBulkAddUsersToGroupRequest {
  usernames: string[];
}

/** Rename group request */
export interface IRenameGroupRequest {
  newName: string;
}

/** Result of a group rename operation */
export interface IRenameGroupResult {
  oldName: string;
  newName: string;
  membersRestored: number;
  spacesRestored: number;
  warnings: string[];
}
