import { getEsApiClient } from './client.js';
import { logger } from '../../utils/logger.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { getSpaceGroupAccessTypes, setGroupAccessType } from '../group-access.store.js';
import {
  getSpacePermissionOverrides,
  setUserPermissionOverride,
} from '../user-permission-override.store.js';
import type { SpaceType, ISpace, ISpaceUserAccess, ISpaceGroupAccess, ICloneSpaceResult } from '../../../../shared/types/space.js';

/**
 * Raw space detail from Storage API v1
 * GET /api/v1/storage/spaces/:name
 */
interface ESSpaceDetail {
  space_name: string;
  type: string;
  subtype: string;
  bitbucket: {
    hostname: string;
    type: string;
    location: string;
  };
  created: string;
  dpx: boolean;
  ewc: boolean;
  goal: string;
  is_in_maintenance_mode: boolean;
  maintenance_users: string[];
  media_proxies: unknown;
  public: boolean;
  quota: number;
  space_used: number;
  uuid: string;
}

/**
 * Raw user access from Storage API v1
 * GET /api/v1/storage/spaces/:name/users
 */
interface ESSpaceUser {
  username: string;
  readonly: boolean;
  access_type: string;
}

/**
 * Maps ES API subtype to our SpaceType.
 */
function mapSpaceType(subtype: string): SpaceType {
  switch (subtype?.toLowerCase()) {
    case 'avidstyle':
      return 'avidstyle';
    case 'avidmxf':
      return 'avidmxf';
    case 'managed':
      return 'managed';
    case 'unmanaged':
      return 'unmanaged';
    case 'acl':
      return 'acl';
    default:
      return 'unmanaged';
  }
}

/**
 * Lists all spaces from the EditShare Storage API.
 * GET /api/v1/storage/spaces → flat array of space names.
 * Fetches detail for each to build full space objects.
 */
export async function listSpaces(): Promise<ISpace[]> {
  try {
    const client = getEsApiClient();
    const listResponse = await client.get<string[]>('/api/v1/storage/spaces');
    const spaceNames: string[] = listResponse.data;

    // Fetch detail for each space in parallel
    const spacePromises = spaceNames.map(async (name): Promise<ISpace | null> => {
      try {
        const detailResponse = await client.get<ESSpaceDetail>(
          `/api/v1/storage/spaces/${encodeURIComponent(name)}`,
        );
        const d = detailResponse.data;
        const quota = d.quota || 0;
        const used = d.space_used || 0;

        return {
          name: d.space_name,
          uuid: d.uuid,
          type: mapSpaceType(d.subtype),
          maintenanceUser: d.maintenance_users?.length > 0 ? d.maintenance_users.join(', ') : undefined,
          goal: d.goal || undefined,
          quota,
          used,
          usedPercent: quota > 0 ? Math.round((used / quota) * 100) : 0,
        };
      } catch (err) {
        logger.warn({ err, name }, `Failed to fetch detail for space: ${name}`);
        return {
          name,
          type: 'unmanaged',
          quota: 0,
          used: 0,
          usedPercent: 0,
        };
      }
    });

    const spaces = await Promise.all(spacePromises);
    return spaces.filter((s): s is ISpace => s !== null);
  } catch (err) {
    logger.error({ err }, 'Failed to list spaces from ES API');
    throw new ApiError('Failed to list spaces from EditShare API');
  }
}

/**
 * Gets detailed space information from the EditShare Storage API.
 */
export async function getSpace(name: string): Promise<ISpace & { isPublic: boolean; isMaintenanceMode: boolean }> {
  try {
    const client = getEsApiClient();
    const response = await client.get<ESSpaceDetail>(
      `/api/v1/storage/spaces/${encodeURIComponent(name)}`,
    );
    const d = response.data;
    const quota = d.quota || 0;
    const used = d.space_used || 0;

    return {
      name: d.space_name,
      uuid: d.uuid,
      type: mapSpaceType(d.subtype),
      maintenanceUser: d.maintenance_users?.length > 0 ? d.maintenance_users.join(', ') : undefined,
      goal: d.goal || undefined,
      quota,
      used,
      usedPercent: quota > 0 ? Math.round((used / quota) * 100) : 0,
      isPublic: d.public || false,
      isMaintenanceMode: d.is_in_maintenance_mode || false,
    };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Space', name);
      }
    }
    logger.error({ err, name }, `Failed to get space: ${name}`);
    throw new ApiError(`Failed to get space '${name}' from EditShare API`);
  }
}

/**
 * Creates a new media space.
 * POST /api/v1/storage/spaces  body: { space_name, quota, subtype }
 */
export async function createSpace(name: string, subtype: string, quota: number): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.post('/api/v1/storage/spaces', {
      space_name: name,
      subtype,
      quota,
    });
    logger.info({ name, subtype, quota }, `Space created: ${name}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 409) {
        throw new ApiError(`Space '${name}' already exists`, 409);
      }
    }
    logger.error({ err, name }, `Failed to create space: ${name}`);
    throw new ApiError(`Failed to create space '${name}'`);
  }
}

/**
 * Deletes a media space.
 * DELETE /api/v1/storage/spaces/:name?save_media_to_trash=true
 */
export async function deleteSpace(name: string): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.delete(
      `/api/v1/storage/spaces/${encodeURIComponent(name)}?save_media_to_trash=true`,
    );
    logger.info({ name }, `Space deleted: ${name}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Space', name);
      }
    }
    logger.error({ err, name }, `Failed to delete space: ${name}`);
    throw new ApiError(`Failed to delete space '${name}'`);
  }
}

/**
 * Gets users with access to a space.
 * GET /api/v1/storage/spaces/:name/users
 */
export async function getSpaceUsers(spaceName: string): Promise<ISpaceUserAccess[]> {
  try {
    const client = getEsApiClient();
    const response = await client.get<ESSpaceUser[]>(
      `/api/v1/storage/spaces/${encodeURIComponent(spaceName)}/users`,
    );

    return response.data.map((entry) => ({
      username: entry.username,
      accessType: entry.readonly ? 'readonly' as const : 'readwrite' as const,
      readonly: entry.readonly,
    }));
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Space', spaceName);
      }
    }
    logger.error({ err, spaceName }, `Failed to get users for space: ${spaceName}`);
    throw new ApiError(`Failed to get users for space '${spaceName}'`);
  }
}

/**
 * Adds a user to a space.
 * POST /api/v1/storage/spaces/:name/users  body: { username, readonly? }
 */
export async function addUserToSpace(
  spaceName: string,
  username: string,
  readonly: boolean = false,
): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.post(
      `/api/v1/storage/spaces/${encodeURIComponent(spaceName)}/users`,
      { username, readonly },
    );
    logger.info({ spaceName, username, readonly }, `Added ${username} to space ${spaceName}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Space', spaceName);
      }
    }
    logger.error({ err, spaceName, username }, `Failed to add ${username} to space ${spaceName}`);
    throw new ApiError(`Failed to add user '${username}' to space '${spaceName}'`);
  }
}

/**
 * Removes a user from a space.
 * DELETE /api/v1/storage/spaces/:name/users/:username?save_media_to_trash=true
 */
export async function removeUserFromSpace(spaceName: string, username: string): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.delete(
      `/api/v1/storage/spaces/${encodeURIComponent(spaceName)}/users/${encodeURIComponent(username)}?save_media_to_trash=true`,
    );
    logger.info({ spaceName, username }, `Removed ${username} from space ${spaceName}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Space or user', `${spaceName}/${username}`);
      }
    }
    logger.error(
      { err, spaceName, username },
      `Failed to remove ${username} from space ${spaceName}`,
    );
    throw new ApiError(`Failed to remove user '${username}' from space '${spaceName}'`);
  }
}

/**
 * Gets groups with access to a space.
 * GET /api/v1/storage/spaces/:name/groups → flat array of group names.
 * Uses local store to determine access type (readonly vs readwrite).
 */
export async function getSpaceGroups(spaceName: string): Promise<ISpaceGroupAccess[]> {
  try {
    const client = getEsApiClient();
    const response = await client.get<string[]>(
      `/api/v1/storage/spaces/${encodeURIComponent(spaceName)}/groups`,
    );

    // Look up locally stored access types for each group
    const accessTypes = await getSpaceGroupAccessTypes(spaceName, response.data);

    return response.data.map((groupName) => ({
      groupName,
      accessType: accessTypes[groupName] ?? 'readwrite' as const,
    }));
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Space', spaceName);
      }
    }
    logger.error({ err, spaceName }, `Failed to get groups for space: ${spaceName}`);
    throw new ApiError(`Failed to get groups for space '${spaceName}'`);
  }
}

/**
 * Adds a group to a space.
 * POST /api/v1/storage/spaces/:name/groups  body: { group_name, readonly? }
 */
export async function addGroupToSpace(
  spaceName: string,
  groupName: string,
  readonly: boolean = false,
): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.post(
      `/api/v1/storage/spaces/${encodeURIComponent(spaceName)}/groups`,
      { group_name: groupName, readonly },
    );
    logger.info({ spaceName, groupName, readonly }, `Added group ${groupName} to space ${spaceName}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Space', spaceName);
      }
    }
    logger.error(
      { err, spaceName, groupName },
      `Failed to add group ${groupName} to space ${spaceName}`,
    );
    throw new ApiError(`Failed to add group '${groupName}' to space '${spaceName}'`);
  }
}

/**
 * Removes a group from a space.
 * DELETE /api/v1/storage/spaces/:name/groups/:groupName?save_media_to_trash=true
 */
export async function removeGroupFromSpace(spaceName: string, groupName: string): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.delete(
      `/api/v1/storage/spaces/${encodeURIComponent(spaceName)}/groups/${encodeURIComponent(groupName)}?save_media_to_trash=true`,
    );
    logger.info({ spaceName, groupName }, `Removed group ${groupName} from space ${spaceName}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('Space or group', `${spaceName}/${groupName}`);
      }
    }
    logger.error(
      { err, spaceName, groupName },
      `Failed to remove group ${groupName} from space ${spaceName}`,
    );
    throw new ApiError(`Failed to remove group '${groupName}' from space '${spaceName}'`);
  }
}

/**
 * Clones a space by creating a new space with the same type/quota
 * and optionally copying user and group access.
 *
 * Steps:
 *  1. Get source space detail (type, quota)
 *  2. Create new space with same subtype and quota
 *  3. If copyUsers: copy user access (with same readonly flags)
 *  4. If copyGroups: copy group access (with same readonly flags + local store entries)
 *  5. Copy local permission overrides if users were copied
 */
export async function cloneSpace(
  sourceName: string,
  newName: string,
  copyUsers: boolean,
  copyGroups: boolean,
): Promise<ICloneSpaceResult> {
  const warnings: string[] = [];

  // 1. Get source space detail
  const sourceSpace = await getSpace(sourceName);

  logger.info(
    { sourceName, newName, type: sourceSpace.type, quota: sourceSpace.quota, copyUsers, copyGroups },
    'Clone space: starting',
  );

  // 2. Create new space with same type and quota
  // Map our SpaceType back to the ES API subtype string
  await createSpace(newName, sourceSpace.type, sourceSpace.quota);

  // 3. Copy user access
  let usersCopied = 0;
  if (copyUsers) {
    try {
      const users = await getSpaceUsers(sourceName);
      for (const user of users) {
        try {
          await addUserToSpace(newName, user.username, user.readonly);
          usersCopied++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          warnings.push(`Failed to copy user '${user.username}': ${msg}`);
          logger.warn({ err, username: user.username, newName }, 'Clone space: failed to copy user');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      warnings.push(`Failed to fetch source space users: ${msg}`);
      logger.warn({ err, sourceName }, 'Clone space: failed to fetch users');
    }

    // Copy permission overrides
    try {
      const overrides = getSpacePermissionOverrides(sourceName);
      for (const override of overrides) {
        try {
          setUserPermissionOverride(newName, override.username, override.accessType);
        } catch (err: unknown) {
          warnings.push(`Failed to copy permission override for '${override.username}'`);
          logger.warn({ err, username: override.username }, 'Clone space: failed to copy override');
        }
      }
    } catch (err: unknown) {
      warnings.push('Failed to copy permission overrides');
      logger.warn({ err }, 'Clone space: failed to copy overrides');
    }
  }

  // 4. Copy group access
  let groupsCopied = 0;
  if (copyGroups) {
    try {
      const groups = await getSpaceGroups(sourceName);
      for (const group of groups) {
        try {
          const isReadonly = group.accessType === 'readonly';
          await addGroupToSpace(newName, group.groupName, isReadonly);
          // Also copy the local group-access store entry
          await setGroupAccessType(newName, group.groupName, group.accessType);
          groupsCopied++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          warnings.push(`Failed to copy group '${group.groupName}': ${msg}`);
          logger.warn({ err, groupName: group.groupName, newName }, 'Clone space: failed to copy group');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      warnings.push(`Failed to fetch source space groups: ${msg}`);
      logger.warn({ err, sourceName }, 'Clone space: failed to fetch groups');
    }
  }

  const result: ICloneSpaceResult = {
    sourceName,
    newName,
    usersCopied,
    groupsCopied,
    warnings,
  };

  logger.info(result, 'Space clone completed');
  return result;
}
