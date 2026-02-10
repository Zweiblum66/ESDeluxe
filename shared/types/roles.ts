/** Space manager assignment (user or group) */
export interface ISpaceManagerAssignment {
  spaceName: string;
  assigneeType: 'user' | 'group';
  assigneeName: string;
  assignedAt: number;
  assignedBy?: string;
}

/** Per-space capability flags for a limited admin (space manager) */
export interface ISpaceManagerCapabilities {
  canManageUsers: boolean;
  canManageGroups: boolean;
  canManageQuota: boolean;
  maxQuotaBytes?: number; // null/undefined = unlimited
}

/** Extended manager info with capabilities */
export interface ISpaceManagerDetail {
  username: string;
  assignedAt: number;
  capabilities: ISpaceManagerCapabilities;
}

/** Managers for a specific space */
export interface ISpaceManagersResponse {
  spaceName: string;
  users: ISpaceManagerDetail[];
  groups: { groupName: string; assignedAt: number; memberCount?: number }[];
}

/** Request to assign or remove a space manager */
export interface IManageSpaceManagerRequest {
  assigneeType: 'user' | 'group';
  assigneeName: string;
}

/** Request to update capabilities for a specific user on a space */
export interface IUpdateCapabilitiesRequest {
  canManageUsers?: boolean;
  canManageGroups?: boolean;
  canManageQuota?: boolean;
  maxQuotaBytes?: number | null;
}
