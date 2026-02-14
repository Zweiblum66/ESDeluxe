import { getEsApiClient } from './client.js';
import { logger } from '../../utils/logger.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import type { IRenameGroupResult } from '../../../../shared/types/group.js';
import * as esSpaces from './spaces.service.js';
import {
  getGroupSpaceAccessTypes,
  setGroupAccessType,
  removeGroupAccessType,
} from '../group-access.store.js';

/**
 * Lists all group names from the EditShare Storage API.
 * GET /api/v1/storage/groups → flat array of group names.
 */
export async function listGroups(): Promise<string[]> {
  try {
    const client = getEsApiClient();
    const response = await client.get<string[]>('/api/v1/storage/groups');
    return response.data;
  } catch (err) {
    logger.error({ err }, 'Failed to list groups from ES API');
    throw new ApiError('Failed to list groups from EditShare API');
  }
}

/**
 * Gets the members (usernames) of a group.
 * GET /api/v1/storage/groups/:name/users → flat array of usernames.
 */
export async function getGroupMembers(name: string): Promise<string[]> {
  try {
    const client = getEsApiClient();
    const response = await client.get<string[]>(
      `/api/v1/storage/groups/${encodeURIComponent(name)}/users`,
    );
    return response.data;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Group', name);
      }
    }
    logger.error({ err, name }, `Failed to get members for group: ${name}`);
    throw new ApiError(`Failed to get members for group '${name}'`);
  }
}

/**
 * Gets the spaces assigned to a group.
 * GET /api/v1/storage/groups/:name/spaces → flat array of space names.
 */
export async function getGroupSpaces(name: string): Promise<string[]> {
  try {
    const client = getEsApiClient();
    const response = await client.get<string[]>(
      `/api/v1/storage/groups/${encodeURIComponent(name)}/spaces`,
    );
    return response.data;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Group', name);
      }
    }
    logger.error({ err, name }, `Failed to get spaces for group: ${name}`);
    throw new ApiError(`Failed to get spaces for group '${name}'`);
  }
}

/**
 * Creates a new group via the EditShare Storage API.
 * POST /api/v1/storage/groups  body: { group_name }
 */
export async function createGroup(name: string): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.post('/api/v1/storage/groups', { group_name: name });
    logger.info({ name }, `Group created: ${name}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 409) {
        throw new ApiError(`Group '${name}' already exists`, 409);
      }
    }
    logger.error({ err, name }, `Failed to create group: ${name}`);
    throw new ApiError(`Failed to create group '${name}'`);
  }
}

/**
 * Deletes a group via the EditShare Storage API.
 * DELETE /api/v1/storage/groups/:name?save_media_to_trash=true
 */
export async function deleteGroup(name: string): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.delete(
      `/api/v1/storage/groups/${encodeURIComponent(name)}?save_media_to_trash=true`,
    );
    logger.info({ name }, `Group deleted: ${name}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Group', name);
      }
    }
    logger.error({ err, name }, `Failed to delete group: ${name}`);
    throw new ApiError(`Failed to delete group '${name}'`);
  }
}

/**
 * Adds a user to a group via the EditShare Storage API.
 * POST /api/v1/storage/groups/:name/users  body: { username }
 */
export async function addUserToGroup(groupName: string, username: string): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.post(
      `/api/v1/storage/groups/${encodeURIComponent(groupName)}/users`,
      { username },
    );
    logger.info({ groupName, username }, `Added ${username} to group ${groupName}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Group', groupName);
      }
    }
    logger.error({ err, groupName, username }, `Failed to add ${username} to group ${groupName}`);
    throw new ApiError(`Failed to add user '${username}' to group '${groupName}'`);
  }
}

/**
 * Removes a user from a group via the EditShare Storage API.
 * DELETE /api/v1/storage/groups/:name/users/:username?save_media_to_trash=true
 */
export async function removeUserFromGroup(groupName: string, username: string): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.delete(
      `/api/v1/storage/groups/${encodeURIComponent(groupName)}/users/${encodeURIComponent(username)}?save_media_to_trash=true`,
    );
    logger.info({ groupName, username }, `Removed ${username} from group ${groupName}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Group or user', `${groupName}/${username}`);
      }
    }
    logger.error(
      { err, groupName, username },
      `Failed to remove ${username} from group ${groupName}`,
    );
    throw new ApiError(`Failed to remove user '${username}' from group '${groupName}'`);
  }
}

/**
 * Renames a group by creating a new group and restoring all memberships + space access.
 * EditShare has no native rename — this is a delete + recreate orchestration.
 *
 * Steps:
 *  1. Verify old group exists by fetching members
 *  2. Collect members, spaces (with access types from local store)
 *  3. Create new group
 *  4. Restore members
 *  5. Restore space access (with correct readonly flag) and migrate local store entries
 *  6. Delete old group
 */
export async function renameGroup(
  oldName: string,
  newName: string,
): Promise<IRenameGroupResult> {
  const warnings: string[] = [];

  // 1. Verify old group exists + collect members
  const members = await getGroupMembers(oldName);

  // 2. Collect spaces and their local access types
  const spaceNames = await getGroupSpaces(oldName);
  const accessTypes = await getGroupSpaceAccessTypes(oldName, spaceNames);

  logger.info(
    { oldName, newName, members: members.length, spaces: spaceNames.length },
    'Rename group: collected current state',
  );

  // 3. Create new group
  await createGroup(newName);

  // 4. Restore members
  let membersRestored = 0;
  for (const username of members) {
    try {
      await addUserToGroup(newName, username);
      membersRestored++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      warnings.push(`Failed to restore member '${username}': ${msg}`);
      logger.warn({ err, username, newName }, 'Rename group: failed to restore member');
    }
  }

  // 5. Restore space access + migrate local store
  let spacesRestored = 0;
  for (const spaceName of spaceNames) {
    try {
      const storedAccessType = accessTypes[spaceName] ?? 'readwrite';
      const isReadonly = storedAccessType === 'readonly';
      await esSpaces.addGroupToSpace(spaceName, newName, isReadonly);

      // Migrate local group-access store entry
      await setGroupAccessType(spaceName, newName, storedAccessType);
      await removeGroupAccessType(spaceName, oldName);

      spacesRestored++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      warnings.push(`Failed to restore space '${spaceName}': ${msg}`);
      logger.warn({ err, spaceName, newName }, 'Rename group: failed to restore space access');
    }
  }

  // 6. Delete old group
  try {
    await deleteGroup(oldName);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    warnings.push(`CRITICAL: Failed to delete old group '${oldName}': ${msg}. Both groups may now exist.`);
    logger.error({ err, oldName }, 'Rename group: CRITICAL - failed to delete old group');
  }

  const result: IRenameGroupResult = {
    oldName,
    newName,
    membersRestored,
    spacesRestored,
    warnings,
  };

  logger.info(result, 'Group rename completed');
  return result;
}
