import { getLdapClient } from './client.js';
import { GROUPS_OU, ESG_GROUP_PREFIX, RO_SPACE_PREFIX } from './constants.js';
import { logger } from '../../utils/logger.js';
import { LdapError } from '../../utils/errors.js';

interface LdapGroupInfo {
  name: string;
  members: string[];
}

/**
 * Lists all LDAP groups with their members.
 */
export async function listLdapGroups(): Promise<LdapGroupInfo[]> {
  try {
    const client = getLdapClient();
    const entries = await client.search(GROUPS_OU, {
      scope: 'one',
      filter: '(objectClass=posixGroup)',
      attributes: ['cn', 'memberUid'],
    });

    return entries.map((entry) => {
      const memberUid = entry.memberUid;
      let members: string[];
      if (!memberUid) {
        members = [];
      } else if (Array.isArray(memberUid)) {
        members = memberUid;
      } else {
        members = [memberUid];
      }

      return {
        name: entry.cn as string,
        members,
      };
    });
  } catch (err) {
    logger.error({ err }, 'Failed to list LDAP groups');
    throw new LdapError('Failed to list LDAP groups');
  }
}

/**
 * Gets UI-visible groups (prefixed with _esg_).
 * Returns clean group names with the prefix stripped.
 */
export async function getUiGroups(): Promise<{ name: string; displayName: string; members: string[] }[]> {
  try {
    const allGroups = await listLdapGroups();

    return allGroups
      .filter((g) => g.name.startsWith(ESG_GROUP_PREFIX))
      .map((g) => ({
        name: g.name,
        displayName: g.name.slice(ESG_GROUP_PREFIX.length),
        members: g.members,
      }));
  } catch (err) {
    logger.error({ err }, 'Failed to get UI groups');
    throw new LdapError('Failed to get UI groups');
  }
}

/**
 * Gets the space-access groups for a specific space.
 * Returns both the rw group and the ro group if they exist.
 */
export async function getSpaceGroups(
  spaceName: string,
): Promise<{ rwGroup: LdapGroupInfo | null; roGroup: LdapGroupInfo | null }> {
  try {
    const allGroups = await listLdapGroups();

    // Space names use underscores in LDAP group names
    const normalizedName = spaceName.replace(/ /g, '_');

    const rwGroup = allGroups.find((g) => g.name === normalizedName) || null;
    const roGroup =
      allGroups.find((g) => g.name === `${RO_SPACE_PREFIX}${normalizedName}`) || null;

    return {
      rwGroup: rwGroup ? { name: rwGroup.name, members: rwGroup.members } : null,
      roGroup: roGroup ? { name: roGroup.name, members: roGroup.members } : null,
    };
  } catch (err) {
    logger.error({ err, spaceName }, `Failed to get space groups for: ${spaceName}`);
    throw new LdapError(`Failed to get space groups for '${spaceName}'`);
  }
}

/**
 * Adds a user to an LDAP group.
 * Note: Requires authenticated (non-anonymous) LDAP bind.
 */
export async function addUserToLdapGroup(groupName: string, username: string): Promise<void> {
  try {
    const client = getLdapClient();
    const groupDn = `cn=${groupName},${GROUPS_OU}`;

    await client.modify(groupDn, {
      operation: 'add',
      modification: {
        type: 'memberUid',
        values: [username],
      },
    } as any);

    logger.info({ groupName, username }, `Added ${username} to LDAP group ${groupName}`);
  } catch (err) {
    logger.error({ err, groupName, username }, `Failed to add ${username} to LDAP group ${groupName}`);
    throw new LdapError(`Failed to add user '${username}' to LDAP group '${groupName}'`);
  }
}

/**
 * Removes a user from an LDAP group.
 * Note: Requires authenticated (non-anonymous) LDAP bind.
 */
export async function removeUserFromLdapGroup(groupName: string, username: string): Promise<void> {
  try {
    const client = getLdapClient();
    const groupDn = `cn=${groupName},${GROUPS_OU}`;

    await client.modify(groupDn, {
      operation: 'delete',
      modification: {
        type: 'memberUid',
        values: [username],
      },
    } as any);

    logger.info({ groupName, username }, `Removed ${username} from LDAP group ${groupName}`);
  } catch (err) {
    logger.error({ err, groupName, username }, `Failed to remove ${username} from LDAP group ${groupName}`);
    throw new LdapError(`Failed to remove user '${username}' from LDAP group '${groupName}'`);
  }
}
