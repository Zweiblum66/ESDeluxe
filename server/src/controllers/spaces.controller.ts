import type { Request, Response } from 'express';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { isSystemUser } from '../services/ldap/constants.js';
import * as esSpaces from '../services/editshare-api/spaces.service.js';
import * as esGroups from '../services/editshare-api/groups.service.js';
import { setGroupAccessType, removeGroupAccessType } from '../services/group-access.store.js';
import {
  setUserPermissionOverride,
  removeUserPermissionOverride,
  hasUserPermissionOverride,
  removeSpacePermissionOverrides,
  getSpacePermissionOverrides,
} from '../services/user-permission-override.store.js';
import type { ISpaceDetail } from '../../../shared/types/space.js';

/** Extract :name param safely (Express v5 params can be string | string[]) */
function getSpaceName(req: Request): string {
  const val = req.params.name;
  return Array.isArray(val) ? val[0] : val;
}

/** Extract :username param safely */
function getUsername(req: Request): string {
  const val = req.params.username;
  return Array.isArray(val) ? val[0] : val;
}

/** Extract :groupName param safely */
function getGroupName(req: Request): string {
  const val = req.params.groupName;
  return Array.isArray(val) ? val[0] : val;
}

/**
 * GET /api/v1/spaces
 * Returns all media spaces with quota/usage info.
 */
export async function listSpaces(_req: Request, res: Response): Promise<void> {
  const spaces = await esSpaces.listSpaces();

  res.json({ data: spaces });
}

/**
 * GET /api/v1/spaces/:name
 * Returns space detail with users and groups.
 */
export async function getSpace(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);

  // Fetch space info, users, and groups in parallel
  const [spaceInfo, users, groups] = await Promise.all([
    esSpaces.getSpace(name),
    esSpaces.getSpaceUsers(name),
    esSpaces.getSpaceGroups(name),
  ]);

  // Filter system users from the access list
  const filteredUsers = users.filter((u) => !isSystemUser(u.username));

  // Enrich users with override information
  const enrichedUsers = filteredUsers.map((user) => ({
    ...user,
    hasOverride: hasUserPermissionOverride(name, user.username),
  }));

  const detail: ISpaceDetail = {
    ...spaceInfo,
    users: enrichedUsers,
    groups,
    isPublic: spaceInfo.isPublic,
  };

  res.json({ data: detail });
}

/**
 * POST /api/v1/spaces
 * Body: { name, type, quota }
 */
export async function createSpace(req: Request, res: Response): Promise<void> {
  const { name, type, quota } = req.body;

  if (!name || typeof name !== 'string') {
    throw new ValidationError('Space name is required');
  }

  const subtype = type || 'unmanaged';
  const validSubtypes = ['avidstyle', 'avidmxf', 'managed', 'unmanaged', 'acl'];
  if (!validSubtypes.includes(subtype)) {
    throw new ValidationError(`Invalid space type. Must be one of: ${validSubtypes.join(', ')}`);
  }

  // Default quota: 100 GB in bytes
  const spaceQuota = quota || 107374182400;

  await esSpaces.createSpace(name.trim(), subtype, spaceQuota);

  res.status(201).json({
    data: { name: name.trim(), message: 'Space created successfully' },
  });
}

/**
 * PUT /api/v1/spaces/:name
 * Placeholder — ES API doesn't support direct space updates easily.
 */
export async function updateSpace(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);

  // Currently the ES Storage API doesn't have a direct PATCH/PUT for space properties.
  // This could be implemented later if the API supports it.
  res.json({ data: { name, message: 'Space update not yet supported by the API' } });
}

/**
 * DELETE /api/v1/spaces/:name
 */
export async function deleteSpace(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);

  await esSpaces.deleteSpace(name);

  // Clean up permission overrides for this space
  removeSpacePermissionOverrides(name);

  res.json({ data: { name, message: 'Space deleted successfully' } });
}

/**
 * GET /api/v1/spaces/:name/users
 * Returns users with access to the space (filtered).
 */
export async function getSpaceUsers(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);

  const users = await esSpaces.getSpaceUsers(name);
  const filteredUsers = users.filter((u) => !isSystemUser(u.username));

  // Enrich with override information
  const enrichedUsers = filteredUsers.map((user) => ({
    ...user,
    hasOverride: hasUserPermissionOverride(name, user.username),
  }));

  res.json({ data: enrichedUsers });
}

/**
 * POST /api/v1/spaces/:name/users
 * Body: { username, readonly? }
 */
export async function addUserToSpace(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);
  const { username, readonly } = req.body;

  if (!username || typeof username !== 'string') {
    throw new ValidationError('Username is required');
  }

  await esSpaces.addUserToSpace(name, username.trim(), readonly === true);

  res.json({
    data: { space: name, username: username.trim(), message: 'User added to space' },
  });
}

/**
 * PUT /api/v1/spaces/:name/users/:username
 * Change user access type (readonly toggle).
 * This creates an explicit user-level permission override.
 */
export async function setUserAccess(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);
  const username = getUsername(req);
  const { readonly } = req.body;

  if (typeof readonly !== 'boolean') {
    throw new ValidationError('readonly must be a boolean');
  }

  const accessType = readonly ? 'readonly' : 'readwrite';

  // Remove and re-add with new access type
  await esSpaces.removeUserFromSpace(name, username);
  await esSpaces.addUserToSpace(name, username, readonly);

  // Mark this as an explicit user override
  setUserPermissionOverride(name, username, accessType);

  res.json({
    data: { space: name, username, readonly, isOverride: true, message: 'User access updated' },
  });
}

/**
 * DELETE /api/v1/spaces/:name/users/:username
 */
export async function removeUserFromSpace(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);
  const username = getUsername(req);

  await esSpaces.removeUserFromSpace(name, username);

  // Clean up override tracking
  removeUserPermissionOverride(name, username);

  res.json({
    data: { space: name, username, message: 'User removed from space' },
  });
}

/**
 * GET /api/v1/spaces/:name/groups
 */
export async function getSpaceGroups(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);

  const groups = await esSpaces.getSpaceGroups(name);

  res.json({ data: groups });
}

/**
 * POST /api/v1/spaces/:name/groups
 * Body: { groupName, readonly? }
 *
 * When a group is assigned to a space:
 * 1. Add the group to the space with the specified access level
 * 2. Add all group members to the space with the same access level (inheritance)
 * 3. Users can later override this with individual access settings
 */
export async function addGroupToSpace(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);
  const { groupName, readonly } = req.body;

  if (!groupName || typeof groupName !== 'string') {
    throw new ValidationError('Group name is required');
  }

  const isReadonly = readonly === true;

  // Add the group to the space
  await esSpaces.addGroupToSpace(name, groupName.trim(), isReadonly);

  // Track access type locally (ES API doesn't expose group access types)
  await setGroupAccessType(name, groupName.trim(), isReadonly ? 'readonly' : 'readwrite');

  // Get all members of the group
  const groupMembers = await esGroups.getGroupMembers(groupName.trim());

  // Filter out system users
  const regularUsers = groupMembers.filter((username) => !isSystemUser(username));

  // Add each group member to the space with the same access level
  // This provides the initial inheritance - users can override this later
  const addUserPromises = regularUsers.map(async (username) => {
    try {
      // Check if user already has explicit access to this space
      const spaceUsers = await esSpaces.getSpaceUsers(name);
      const existingUser = spaceUsers.find((u) => u.username === username);

      // Only add if user doesn't already have explicit access
      // This preserves any existing user-level overrides
      if (!existingUser) {
        await esSpaces.addUserToSpace(name, username, isReadonly);
      }
    } catch (err) {
      // Log but don't fail the entire operation if one user fails
      logger.warn({ username, space: name, err }, 'Failed to add group member to space');
    }
  });

  await Promise.all(addUserPromises);

  res.json({
    data: {
      space: name,
      groupName: groupName.trim(),
      usersAdded: regularUsers.length,
      message: 'Group added to space and members granted access'
    },
  });
}

/**
 * PUT /api/v1/spaces/:name/groups/:groupName
 * Change group access type (readonly toggle).
 * Implemented by removing and re-adding with new access type.
 *
 * When group access changes:
 * 1. Update the group's access level
 * 2. Update all group members who DON'T have explicit user-level overrides
 *    (We detect overrides by checking if the user's current access differs from the old group setting)
 */
export async function setGroupAccess(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);
  const groupName = getGroupName(req);
  const { readonly, updateUsers } = req.body;

  if (typeof readonly !== 'boolean') {
    throw new ValidationError('readonly must be a boolean');
  }

  // Get current group members
  const groupMembers = await esGroups.getGroupMembers(groupName);
  const regularUsers = groupMembers.filter((username) => !isSystemUser(username));

  // Remove and re-add group with new access type
  await esSpaces.removeGroupFromSpace(name, groupName);
  await esSpaces.addGroupToSpace(name, groupName, readonly);

  // Update local tracking
  await setGroupAccessType(name, groupName, readonly ? 'readonly' : 'readwrite');

  // Update user access if requested (default: true)
  if (updateUsers !== false) {
    const spaceUsers = await esSpaces.getSpaceUsers(name);

    const updateUserPromises = regularUsers.map(async (username) => {
      try {
        const existingUser = spaceUsers.find((u) => u.username === username);

        // Only update users who DON'T have an explicit override
        if (existingUser && !hasUserPermissionOverride(name, username)) {
          // Update user to match new group access level
          await esSpaces.removeUserFromSpace(name, username);
          await esSpaces.addUserToSpace(name, username, readonly);
        }
      } catch (err) {
        logger.warn({ username, space: name, err }, 'Failed to update user access for group change');
      }
    });

    await Promise.all(updateUserPromises);
  }

  res.json({
    data: { space: name, groupName, readonly, message: 'Group access updated' },
  });
}

/**
 * DELETE /api/v1/spaces/:name/groups/:groupName
 */
export async function removeGroupFromSpace(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);
  const groupName = getGroupName(req);

  await esSpaces.removeGroupFromSpace(name, groupName);
  // Clean up local tracking
  await removeGroupAccessType(name, groupName);

  res.json({
    data: { space: name, groupName, message: 'Group removed from space' },
  });
}

/**
 * GET /api/v1/spaces/:name/permission-overrides
 * Returns all users with explicit permission overrides for this space
 */
export async function getPermissionOverrides(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);

  const overrides = getSpacePermissionOverrides(name);

  res.json({ data: overrides });
}

/**
 * DELETE /api/v1/spaces/:name/users/:username/override
 * Remove a user's permission override, reverting to group-inherited permissions
 */
export async function removePermissionOverride(req: Request, res: Response): Promise<void> {
  const name = getSpaceName(req);
  const username = getUsername(req);

  removeUserPermissionOverride(name, username);

  res.json({
    data: { space: name, username, message: 'Permission override removed' },
  });
}
