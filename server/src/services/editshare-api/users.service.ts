import { getEsApiClient } from './client.js';
import { logger } from '../../utils/logger.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import type { IUser, IUserSpaceAccess, SpaceAccessType } from '../../../../shared/types/user.js';

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

/**
 * Lists all users from the EditShare Storage API.
 * The storage API returns usernames as a flat array;
 * we fetch detail for each to build the full user objects.
 */
export async function listUsers(): Promise<IUser[]> {
  try {
    const client = getEsApiClient();

    // GET /api/v1/storage/users returns a flat array of usernames
    const listResponse = await client.get<string[]>('/api/v1/storage/users');
    const usernames: string[] = listResponse.data;

    // Fetch detail for each user in parallel
    const userPromises = usernames.map(async (username): Promise<IUser | null> => {
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
        // Return a minimal user object if detail fetch fails
        return {
          username,
          identitySource: 'LOCAL',
          isMaintenance: false,
        };
      }
    });

    const users = await Promise.all(userPromises);
    return users.filter((u): u is IUser => u !== null);
  } catch (err) {
    logger.error({ err }, 'Failed to list users from ES API');
    throw new ApiError('Failed to list users from EditShare API');
  }
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
 * POST /api/v1/storage/users/:username with password in body.
 */
export async function createUser(username: string, password: string): Promise<void> {
  try {
    const client = getEsApiClient();
    await client.post(`/api/v1/storage/users/${encodeURIComponent(username)}`, {
      password,
    });
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
