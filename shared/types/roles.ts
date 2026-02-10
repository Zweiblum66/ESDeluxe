/** Space manager assignment (user or group) */
export interface ISpaceManagerAssignment {
  spaceName: string;
  assigneeType: 'user' | 'group';
  assigneeName: string;
  assignedAt: number;
  assignedBy?: string;
}

/** Managers for a specific space */
export interface ISpaceManagersResponse {
  spaceName: string;
  users: { username: string; assignedAt: number }[];
  groups: { groupName: string; assignedAt: number; memberCount?: number }[];
}

/** Request to assign or remove a space manager */
export interface IManageSpaceManagerRequest {
  assigneeType: 'user' | 'group';
  assigneeName: string;
}
