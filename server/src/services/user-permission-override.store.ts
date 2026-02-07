import { getDatabase } from '../db/index.js';
import { logger } from '../utils/logger.js';

export type AccessType = 'readonly' | 'readwrite' | 'admin';

interface UserPermissionOverride {
  spaceName: string;
  username: string;
  accessType: AccessType;
  createdAt: number;
  updatedAt: number;
}

/**
 * Mark a user as having an explicit permission override for a space.
 * This distinguishes user-level permissions from group-inherited permissions.
 */
export function setUserPermissionOverride(
  spaceName: string,
  username: string,
  accessType: AccessType,
): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO user_permission_overrides (space_name, username, access_type, updated_at)
    VALUES (?, ?, ?, unixepoch())
    ON CONFLICT(space_name, username)
    DO UPDATE SET access_type = excluded.access_type, updated_at = unixepoch()
  `);

  stmt.run(spaceName, username, accessType);

  logger.debug(
    { spaceName, username, accessType },
    'User permission override set',
  );
}

/**
 * Remove a user's permission override.
 * Called when reverting to group-inherited permissions.
 */
export function removeUserPermissionOverride(
  spaceName: string,
  username: string,
): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    DELETE FROM user_permission_overrides
    WHERE space_name = ? AND username = ?
  `);

  const result = stmt.run(spaceName, username);

  logger.debug(
    { spaceName, username, changed: result.changes },
    'User permission override removed',
  );
}

/**
 * Check if a user has an explicit permission override for a space.
 */
export function hasUserPermissionOverride(
  spaceName: string,
  username: string,
): boolean {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT 1 FROM user_permission_overrides
    WHERE space_name = ? AND username = ?
  `);

  const result = stmt.get(spaceName, username);
  return !!result;
}

/**
 * Get a user's permission override for a space (if it exists).
 */
export function getUserPermissionOverride(
  spaceName: string,
  username: string,
): AccessType | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT access_type FROM user_permission_overrides
    WHERE space_name = ? AND username = ?
  `);

  const result = stmt.get(spaceName, username) as { access_type: AccessType } | undefined;
  return result?.access_type ?? null;
}

/**
 * Get all users with permission overrides for a space.
 */
export function getSpacePermissionOverrides(spaceName: string): UserPermissionOverride[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT space_name as spaceName, username, access_type as accessType, created_at as createdAt, updated_at as updatedAt
    FROM user_permission_overrides
    WHERE space_name = ?
  `);

  return stmt.all(spaceName) as UserPermissionOverride[];
}

/**
 * Get all spaces where a user has permission overrides.
 */
export function getUserPermissionOverrides(username: string): UserPermissionOverride[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT space_name as spaceName, username, access_type as accessType, created_at as createdAt, updated_at as updatedAt
    FROM user_permission_overrides
    WHERE username = ?
  `);

  return stmt.all(username) as UserPermissionOverride[];
}

/**
 * Remove all permission overrides for a space.
 * Called when a space is deleted.
 */
export function removeSpacePermissionOverrides(spaceName: string): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    DELETE FROM user_permission_overrides
    WHERE space_name = ?
  `);

  const result = stmt.run(spaceName);

  logger.debug(
    { spaceName, removed: result.changes },
    'All user permission overrides removed for space',
  );
}

/**
 * Remove all permission overrides for a user.
 * Called when a user is deleted.
 */
export function removeUserPermissionOverrides(username: string): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    DELETE FROM user_permission_overrides
    WHERE username = ?
  `);

  const result = stmt.run(username);

  logger.debug(
    { username, removed: result.changes },
    'All user permission overrides removed for user',
  );
}
