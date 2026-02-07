import { config } from '../../config/index.js';

/** Base DN for LDAP operations */
export const BASE_DN = config.LDAP_BASE_DN;

/** OU for user entries */
export const PEOPLE_OU = `ou=People,${BASE_DN}`;

/** OU for group entries */
export const GROUPS_OU = `ou=Groups,${BASE_DN}`;

/** Prefix for EditShare-generated groups (space access groups) */
export const ESG_GROUP_PREFIX = '_esg_';

/** Prefix for read-only space groups */
export const RO_SPACE_PREFIX = '_ro_';

/** Minimum UID for real (non-system) users */
export const MIN_USER_UID = 131075;

/** System accounts that should be hidden from the UI */
export const SYSTEM_USERS: ReadonlySet<string> = new Set([
  '_flow',
  '_flow_proxy',
  '_ark',
  'geevs',
  'editshare',
  'flow',
]);

/**
 * Checks if a username belongs to a system account that should be hidden.
 */
export function isSystemUser(username: string): boolean {
  return SYSTEM_USERS.has(username.toLowerCase());
}

/**
 * Checks if a group name is an auto-generated system group (space access group).
 * These groups have the prefix '_esg_' or '_ro_' and are managed internally.
 */
export function isSystemGroup(groupName: string): boolean {
  const lower = groupName.toLowerCase();
  return lower.startsWith(ESG_GROUP_PREFIX) || lower.startsWith(RO_SPACE_PREFIX);
}
