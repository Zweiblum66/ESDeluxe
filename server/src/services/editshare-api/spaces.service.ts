import { getEsApiClient } from './client.js';
import { logger } from '../../utils/logger.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { getSpaceGroupAccessTypes } from '../group-access.store.js';
import type { SpaceType, ISpace, ISpaceUserAccess, ISpaceGroupAccess } from '../../../../shared/types/space.js';

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
