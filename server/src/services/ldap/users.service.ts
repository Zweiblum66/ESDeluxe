import { getLdapClient } from './client.js';
import { PEOPLE_OU, GROUPS_OU, MIN_USER_UID, RO_SPACE_PREFIX, isSystemUser } from './constants.js';
import { logger } from '../../utils/logger.js';
import { LdapError } from '../../utils/errors.js';
import type { IUserSpaceAccess, SpaceAccessType } from '../../../../shared/types/user.js';

/**
 * Lists all non-system user UIDs from LDAP.
 * Filters out system accounts (UID < MIN_USER_UID and known system users).
 */
export async function listLdapUsers(): Promise<{ username: string; uid: number }[]> {
  try {
    const client = getLdapClient();
    const entries = await client.search(PEOPLE_OU, {
      scope: 'one',
      filter: '(objectClass=posixAccount)',
      attributes: ['uid', 'cn', 'uidNumber'],
    });

    return entries
      .map((entry) => ({
        username: (entry.uid as string) || (entry.cn as string) || '',
        uid: parseInt(entry.uidNumber as string, 10) || 0,
      }))
      .filter((u) => u.uid >= MIN_USER_UID && !isSystemUser(u.username));
  } catch (err) {
    logger.error({ err }, 'Failed to list users from LDAP');
    throw new LdapError('Failed to list users from LDAP');
  }
}

/**
 * Gets a single user's LDAP entry.
 */
export async function getLdapUser(
  username: string,
): Promise<{ username: string; uid: number } | null> {
  try {
    const client = getLdapClient();
    const entries = await client.search(PEOPLE_OU, {
      scope: 'one',
      filter: `(uid=${username})`,
      attributes: ['uid', 'cn', 'uidNumber'],
    });

    if (entries.length === 0) return null;

    const entry = entries[0];
    return {
      username: (entry.uid as string) || (entry.cn as string) || username,
      uid: parseInt(entry.uidNumber as string, 10) || 0,
    };
  } catch (err) {
    logger.error({ err, username }, `Failed to get LDAP user: ${username}`);
    throw new LdapError(`Failed to get LDAP user '${username}'`);
  }
}

/**
 * Gets all LDAP groups a user belongs to.
 * Returns an array of group names (cn).
 */
export async function getUserLdapGroups(username: string): Promise<string[]> {
  try {
    const client = getLdapClient();
    const entries = await client.search(GROUPS_OU, {
      scope: 'one',
      filter: `(memberUid=${username})`,
      attributes: ['cn'],
    });

    return entries.map((entry) => entry.cn as string).filter(Boolean);
  } catch (err) {
    logger.error({ err, username }, `Failed to get LDAP groups for user: ${username}`);
    throw new LdapError(`Failed to get LDAP groups for user '${username}'`);
  }
}

/**
 * Derives a user's space access from their LDAP group memberships.
 *
 * Convention:
 *   - Group name matches a space name → readwrite access
 *   - Group name starts with '_ro_' + space name → readonly access
 *
 * This provides the group-level access info that complements the
 * ES API user-level space access.
 */
export async function getUserSpaceAccess(username: string): Promise<IUserSpaceAccess[]> {
  try {
    const groups = await getUserLdapGroups(username);

    // Separate readonly groups from readwrite groups
    const spaces: Map<string, SpaceAccessType> = new Map();

    for (const group of groups) {
      if (group.startsWith(RO_SPACE_PREFIX)) {
        // _ro_<space_name> → readonly access
        const spaceName = group.slice(RO_SPACE_PREFIX.length);
        if (spaceName && !spaces.has(spaceName)) {
          spaces.set(spaceName, 'readonly');
        }
      } else if (!group.startsWith('_esg_') && !group.startsWith('_')) {
        // Regular group name that matches a space → readwrite
        // (skip _esg_ groups which are UI groups, not space groups)
        spaces.set(group, 'readwrite');
      }
    }

    return Array.from(spaces.entries()).map(([spaceName, accessType]) => ({
      spaceName: spaceName.replace(/_/g, ' '),
      accessType,
    }));
  } catch (err) {
    logger.error({ err, username }, `Failed to get space access for user: ${username}`);
    throw new LdapError(`Failed to get space access for user '${username}'`);
  }
}
