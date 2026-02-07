import type { Request, Response } from 'express';
import { ValidationError } from '../utils/errors.js';
import { isSystemUser } from '../services/ldap/constants.js';
import * as esGroups from '../services/editshare-api/groups.service.js';
import { getUiGroups } from '../services/ldap/groups.service.js';
import { getGroupSpaceAccessTypes } from '../services/group-access.store.js';
import type { IGroup, IGroupDetail, IGroupSpaceAccess } from '../../../shared/types/group.js';

/** Extract :name param safely (Express v5 params can be string | string[]) */
function getGroupName(req: Request): string {
  const val = req.params.name;
  return Array.isArray(val) ? val[0] : val;
}

/** Extract :username param safely */
function getUsername(req: Request): string {
  const val = req.params.username;
  return Array.isArray(val) ? val[0] : val;
}

/**
 * GET /api/v1/groups
 * Returns all groups with member counts.
 * Merges ES API groups with LDAP _esg_ group membership data.
 */
export async function listGroups(_req: Request, res: Response): Promise<void> {
  // Fetch from both sources in parallel
  const [apiGroupNames, ldapUiGroups] = await Promise.all([
    esGroups.listGroups(),
    getUiGroups().catch(() => []),
  ]);

  // Build a lookup of LDAP _esg_ group members by displayName
  const ldapMemberMap = new Map<string, string[]>();
  for (const g of ldapUiGroups) {
    ldapMemberMap.set(g.displayName, g.members.filter((m) => !isSystemUser(m)));
  }

  // For each API group, fetch members in parallel for the member count
  const groupPromises = apiGroupNames.map(async (name): Promise<IGroup & { memberCount: number }> => {
    try {
      const members = await esGroups.getGroupMembers(name);
      const filteredMembers = members.filter((m) => !isSystemUser(m));
      return {
        name,
        memberCount: filteredMembers.length,
      };
    } catch {
      // If fetching members fails, still include the group
      return {
        name,
        memberCount: 0,
      };
    }
  });

  const groups = await Promise.all(groupPromises);

  res.json({ data: groups });
}

/**
 * GET /api/v1/groups/:name
 * Returns group detail: members (filtered) + spaces with actual access types.
 */
export async function getGroup(req: Request, res: Response): Promise<void> {
  const name = getGroupName(req);

  // Fetch members and spaces in parallel
  const [members, spaceNames] = await Promise.all([
    esGroups.getGroupMembers(name),
    esGroups.getGroupSpaces(name),
  ]);

  // Filter out system users from the member list
  const filteredMembers = members.filter((m) => !isSystemUser(m));

  // Look up locally stored access types for each space
  const accessTypes = await getGroupSpaceAccessTypes(name, spaceNames);

  const spaces: IGroupSpaceAccess[] = spaceNames.map((spaceName) => ({
    spaceName,
    accessType: accessTypes[spaceName] ?? 'readwrite' as const,
  }));

  const detail: IGroupDetail = {
    name,
    users: filteredMembers,
    spaces,
  };

  res.json({ data: detail });
}

/**
 * POST /api/v1/groups
 * Body: { name }
 */
export async function createGroup(req: Request, res: Response): Promise<void> {
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    throw new ValidationError('Group name is required');
  }

  const cleanName = name.trim().toLowerCase();
  if (cleanName.length < 1) {
    throw new ValidationError('Group name cannot be empty');
  }

  await esGroups.createGroup(cleanName);

  res.status(201).json({
    data: { name: cleanName, message: 'Group created successfully' },
  });
}

/**
 * DELETE /api/v1/groups/:name
 */
export async function deleteGroup(req: Request, res: Response): Promise<void> {
  const name = getGroupName(req);

  await esGroups.deleteGroup(name);

  res.json({ data: { name, message: 'Group deleted successfully' } });
}

/**
 * GET /api/v1/groups/:name/users
 * Returns members of a group, filtered to exclude system users.
 */
export async function getGroupUsers(req: Request, res: Response): Promise<void> {
  const name = getGroupName(req);

  const members = await esGroups.getGroupMembers(name);
  const filteredMembers = members.filter((m) => !isSystemUser(m));

  res.json({ data: filteredMembers });
}

/**
 * POST /api/v1/groups/:name/users
 * Body: { username }
 */
export async function addUserToGroup(req: Request, res: Response): Promise<void> {
  const name = getGroupName(req);
  const { username } = req.body;

  if (!username || typeof username !== 'string') {
    throw new ValidationError('Username is required');
  }

  await esGroups.addUserToGroup(name, username.trim());

  res.json({
    data: { group: name, username: username.trim(), message: 'User added to group' },
  });
}

/**
 * DELETE /api/v1/groups/:name/users/:username
 */
export async function removeUserFromGroup(req: Request, res: Response): Promise<void> {
  const name = getGroupName(req);
  const username = getUsername(req);

  await esGroups.removeUserFromGroup(name, username);

  res.json({
    data: { group: name, username, message: 'User removed from group' },
  });
}

/**
 * GET /api/v1/groups/:name/spaces
 * Returns spaces assigned to a group with actual access types.
 */
export async function getGroupSpaces(req: Request, res: Response): Promise<void> {
  const name = getGroupName(req);

  const spaceNames = await esGroups.getGroupSpaces(name);

  // Look up locally stored access types for each space
  const accessTypes = await getGroupSpaceAccessTypes(name, spaceNames);

  const spaces: IGroupSpaceAccess[] = spaceNames.map((spaceName) => ({
    spaceName,
    accessType: accessTypes[spaceName] ?? 'readwrite' as const,
  }));

  res.json({ data: spaces });
}
