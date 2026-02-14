import { getEsApiClient } from './client.js';
import { logger } from '../../utils/logger.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import type { IUser, IUserSpaceAccess, SpaceAccessType, IRenameUserResult } from '../../../../shared/types/user.js';
import * as esGroups from './groups.service.js';
import * as esSpaces from './spaces.service.js';
import {
  getUserPermissionOverrides,
  removeUserPermissionOverrides,
  setUserPermissionOverride,
} from '../user-permission-override.store.js';

/**
 * Raw user detail from Storage API v1
 * GET /api/v1/storage/users/:username
 */
interface ESUserDetail {
  username: string;
  identity_source: string;
  uid: number;
  maintenance_spaces: string[];
}

/**
 * Raw space access entry from Storage API v1
 * GET /api/v1/storage/users/:username/spaces
 */
interface ESUserSpaceEntry {
  username: string;
  space_name: string;
  readonly: boolean;
  access_type: string;
}

/**
 * Maps the ES API identity_source to our normalized format.
 */
function mapIdentitySource(source: string): IUser['identitySource'] {
  switch (source?.toLowerCase()) {
    case 'local':
    case 'editshare':
      return 'LOCAL';
    case 'active_directory':
    case 'ad':
      return 'active_directory';
    case 'sso_saml':
      return 'SSO_SAML';
    case 'multisite':
      return 'MULTISITE';
    default:
      return 'LOCAL';
  }
}

/**
 * Maps the ES API access_type string to our SpaceAccessType.
 */
function mapAccessType(accessType: string, readonly: boolean): SpaceAccessType {
  if (readonly) return 'readonly';
  switch (accessType?.toLowerCase()) {
    case 'readwrite':
    case 'rw':
      return 'readwrite';
    case 'readonly':
    case 'ro':
      return 'readonly';
    case 'admin':
      return 'admin';
    default:
      return 'readwrite';
  }
}

// --- User list cache ---
const CACHE_TTL_MS = 30_000; // 30 seconds
const BATCH_CONCURRENCY = 50; // max parallel detail requests
let _userListCache: { data: IUser[]; timestamp: number } | null = null;
let _userListPending: Promise<IUser[]> | null = null;

/**
 * Fetch user details in batches with concurrency control.
 */
async function fetchUserDetailsBatched(
  client: ReturnType<typeof getEsApiClient>,
  usernames: string[],
): Promise<IUser[]> {
  const results: IUser[] = [];

  for (let i = 0; i < usernames.length; i += BATCH_CONCURRENCY) {
    const batch = usernames.slice(i, i + BATCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (username): Promise<IUser> => {
        try {
          const detailResponse = await client.get<ESUserDetail>(
            `/api/v1/storage/users/${encodeURIComponent(username)}`,
          );
          const d = detailResponse.data;
          return {
            username: d.username,
            identitySource: mapIdentitySource(d.identity_source),
            isMaintenance: (d.maintenance_spaces?.length ?? 0) > 0,
            uid: d.uid,
          };
        } catch (err) {
          logger.warn({ err, username }, `Failed to fetch detail for user: ${username}`);
          return {
            username,
            identitySource: 'LOCAL',
            isMaintenance: false,
          };
        }
      }),
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Lists all users from the EditShare Storage API.
 * Uses a 30s TTL cache to avoid refetching on every request.
 */
export async function listUsers(): Promise<IUser[]> {
  // Return cached data if still fresh
  if (_userListCache && Date.now() - _userListCache.timestamp < CACHE_TTL_MS) {
    return _userListCache.data;
  }

  // Deduplicate concurrent requests — if a fetch is already in progress, wait for it
  if (_userListPending) {
    return _userListPending;
  }

  _userListPending = (async () => {
    try {
      const client = getEsApiClient();

      // GET /api/v1/storage/users returns a flat array of usernames
      const listResponse = await client.get<string[]>('/api/v1/storage/users');
      const usernames: string[] = listResponse.data;

      // Fetch detail in batches with concurrency control
      const users = await fetchUserDetailsBatched(client, usernames);

      // Update cache
      _userListCache = { data: users, timestamp: Date.now() };
      return users;
    } catch (err) {
      logger.error({ err }, 'Failed to list users from ES API');
      throw new ApiError('Failed to list users from EditShare API');
    } finally {
      _userListPending = null;
    }
  })();

  return _userListPending;
}

/** Invalidate the user list cache (call after create/delete) */
export function invalidateUserListCache(): void {
  _userListCache = null;
}

/**
 * Gets detailed user information from the EditShare Storage API.
 */
export async function getUser(username: string): Promise<IUser> {
  try {
    const client = getEsApiClient();
    const response = await client.get<ESUserDetail>(
      `/api/v1/storage/users/${encodeURIComponent(username)}`,
    );
    const d = response.data;
    return {
      username: d.username,
      identitySource: mapIdentitySource(d.identity_source),
      isMaintenance: (d.maintenance_spaces?.length ?? 0) > 0,
      uid: d.uid,
    };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('User', username);
      }
    }
    logger.error({ err, username }, `Failed to get user: ${username}`);
    throw new ApiError(`Failed to get user '${username}' from EditShare API`);
  }
}

/**
 * Creates a new user via the EditShare Storage API.
 * POST /api/v1/storage/users with username and password in body.
 */
export async function createUser(username: string, password: string): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.post('/api/v1/storage/users', {
      username,
      password,
    });
    invalidateUserListCache();
    logger.info({ username }, `User created: ${username}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number; data?: unknown } };
      if (axiosErr.response?.status === 409) {
        throw new ApiError(`User '${username}' already exists`, 409);
      }
    }
    logger.error({ err, username }, `Failed to create user: ${username}`);
    throw new ApiError(`Failed to create user '${username}'`);
  }
}

/**
 * Deletes a user via the EditShare Storage API.
 * DELETE /api/v1/storage/users/:username
 */
export async function deleteUser(username: string): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.delete(`/api/v1/storage/users/${encodeURIComponent(username)}`);
    invalidateUserListCache();
    logger.info({ username }, `User deleted: ${username}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('User', username);
      }
    }
    logger.error({ err, username }, `Failed to delete user: ${username}`);
    throw new ApiError(`Failed to delete user '${username}'`);
  }
}

/**
 * Changes a user's password via the EditShare Storage API.
 * PUT /api/v1/storage/users/:username/password
 */
export async function changePassword(username: string, password: string): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.put(`/api/v1/storage/users/${encodeURIComponent(username)}/password`, {
      password,
    });
    logger.info({ username }, `Password changed for user: ${username}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('User', username);
      }
    }
    logger.error({ err, username }, `Failed to change password for user: ${username}`);
    throw new ApiError(`Failed to change password for user '${username}'`);
  }
}

/**
 * Gets a user's space memberships from the EditShare Storage API.
 * GET /api/v1/storage/users/:username/spaces
 */
export async function getUserSpaces(username: string): Promise<IUserSpaceAccess[]> {
  try {
    const client = getEsApiClient();
    const response = await client.get<ESUserSpaceEntry[]>(
      `/api/v1/storage/users/${encodeURIComponent(username)}/spaces`,
    );

    return response.data.map((entry) => ({
      spaceName: entry.space_name,
      accessType: mapAccessType(entry.access_type, entry.readonly),
    }));
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('User', username);
      }
    }
    logger.error({ err, username }, `Failed to get spaces for user: ${username}`);
    throw new ApiError(`Failed to get spaces for user '${username}'`);
  }
}

/**
 * Gets a user's group memberships from the EditShare Storage API.
 * GET /api/v1/storage/users/:username/groups
 */
export async function getUserGroups(username: string): Promise<string[]> {
  try {
    const client = getEsApiClient();
    const response = await client.get<string[]>(
      `/api/v1/storage/users/${encodeURIComponent(username)}/groups`,
    );
    return response.data;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('User', username);
      }
    }
    logger.error({ err, username }, `Failed to get groups for user: ${username}`);
    throw new ApiError(`Failed to get groups for user '${username}'`);
  }
}

/**
 * Adds a user to one or more groups via the EditShare Storage API.
 * POST /api/v1/storage/users/:username/groups
 */
export async function addUserToGroups(username: string, groups: string[]): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.post(
      `/api/v1/storage/users/${encodeURIComponent(username)}/groups`,
      groups,
    );
    logger.info({ username, groups }, `User ${username} added to groups`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        throw new NotFoundError('User', username);
      }
    }
    logger.error({ err, username, groups }, `Failed to add user ${username} to groups`);
    throw new ApiError(`Failed to add user '${username}' to groups`);
  }
}

/**
 * Renames a user by creating a new user and restoring all memberships.
 * EditShare has no native rename — this is a delete + recreate orchestration.
 *
 * Steps:
 *  1. Verify old user exists
 *  2. Collect groups, spaces (with access types), and permission overrides
 *  3. Create new user with provided password
 *  4. Restore group memberships
 *  5. Restore space access (with correct readonly flag)
 *  6. Migrate local permission overrides from old → new username
 *  7. Delete old user
 *  8. Invalidate cache
 */
export async function renameUser(
  oldUsername: string,
  newUsername: string,
  password: string,
): Promise<IRenameUserResult> {
  const warnings: string[] = [];

  // 1. Verify old user exists
  await getUser(oldUsername);

  // 2. Collect current state
  const [groups, spaces] = await Promise.all([
    getUserGroups(oldUsername),
    getUserSpaces(oldUsername),
  ]);

  // Also collect local permission overrides
  const overrides = getUserPermissionOverrides(oldUsername);

  logger.info(
    { oldUsername, newUsername, groups: groups.length, spaces: spaces.length, overrides: overrides.length },
    'Rename user: collected current state',
  );

  // 3. Create new user
  await createUser(newUsername, password);

  // 4. Restore group memberships
  const groupsRestored: string[] = [];
  for (const group of groups) {
    try {
      await esGroups.addUserToGroup(group, newUsername);
      groupsRestored.push(group);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      warnings.push(`Failed to restore group '${group}': ${msg}`);
      logger.warn({ err, group, newUsername }, `Rename: failed to restore group membership`);
    }
  }

  // 5. Restore space access
  let spacesRestored = 0;
  for (const space of spaces) {
    try {
      const isReadonly = space.accessType === 'readonly';
      await esSpaces.addUserToSpace(space.spaceName, newUsername, isReadonly);
      spacesRestored++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      warnings.push(`Failed to restore space '${space.spaceName}': ${msg}`);
      logger.warn({ err, spaceName: space.spaceName, newUsername }, `Rename: failed to restore space access`);
    }
  }

  // 6. Migrate local permission overrides
  if (overrides.length > 0) {
    for (const override of overrides) {
      try {
        setUserPermissionOverride(override.spaceName, newUsername, override.accessType);
      } catch (err: unknown) {
        warnings.push(`Failed to migrate permission override for space '${override.spaceName}'`);
        logger.warn({ err, spaceName: override.spaceName }, 'Rename: failed to migrate permission override');
      }
    }
    // Remove old user's overrides
    try {
      removeUserPermissionOverrides(oldUsername);
    } catch (err: unknown) {
      warnings.push('Failed to clean up old permission overrides');
      logger.warn({ err, oldUsername }, 'Rename: failed to remove old permission overrides');
    }
  }

  // 7. Delete old user
  try {
    await deleteUser(oldUsername);
  } catch (err: unknown) {
    // Critical — new user already exists but old wasn't deleted
    const msg = err instanceof Error ? err.message : 'Unknown error';
    warnings.push(`CRITICAL: Failed to delete old user '${oldUsername}': ${msg}. Both users may now exist.`);
    logger.error({ err, oldUsername }, 'Rename: CRITICAL - failed to delete old user');
  }

  // 8. Invalidate cache
  invalidateUserListCache();

  const result: IRenameUserResult = {
    oldUsername,
    newUsername,
    groupsRestored,
    spacesRestored,
    warnings,
  };

  logger.info(result, 'User rename completed');
  return result;
}
