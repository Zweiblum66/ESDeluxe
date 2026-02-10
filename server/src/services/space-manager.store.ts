import { getDatabase } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { getUserGroups } from './editshare-api/users.service.js';
import {
  setUserPermissionOverride,
  removeUserPermissionOverride,
} from './user-permission-override.store.js';
import {
  deleteCapabilities,
  deleteSpaceCapabilities,
} from './manager-capabilities.store.js';

// ── Types ──

interface SpaceManagerGroupRow {
  space_name: string;
  group_name: string;
  created_at: number;
  created_by: string | null;
}

interface UserOverrideRow {
  space_name: string;
  username: string;
  created_at: number;
}

// ── Cache ──

const CACHE_TTL_MS = 10_000; // 10 seconds
const _managerCache = new Map<string, { result: boolean; timestamp: number }>();

function cacheKey(username: string, spaceName: string): string {
  return `${username}:${spaceName}`;
}

/** Invalidate all cache entries for a given space */
function invalidateSpaceCache(spaceName: string): void {
  for (const key of _managerCache.keys()) {
    if (key.endsWith(`:${spaceName}`)) {
      _managerCache.delete(key);
    }
  }
}

/** Invalidate all cache entries */
export function invalidateManagerCache(): void {
  _managerCache.clear();
}

// ── Queries ──

/**
 * Check if a user is a space manager for a given space.
 * Checks both direct user overrides (access_type = 'admin') and
 * group-level delegation (space_manager_groups + user's group memberships).
 * Results are cached for 10 seconds.
 */
export async function isUserSpaceManager(
  username: string,
  spaceName: string,
): Promise<boolean> {
  const key = cacheKey(username, spaceName);
  const cached = _managerCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const db = getDatabase();

  // 1. Check direct user assignment via user_permission_overrides
  const directStmt = db.prepare(`
    SELECT 1 FROM user_permission_overrides
    WHERE space_name = ? AND username = ? AND access_type = 'admin'
  `);
  const directResult = directStmt.get(spaceName, username);
  if (directResult) {
    _managerCache.set(key, { result: true, timestamp: Date.now() });
    return true;
  }

  // 2. Check group-level delegation
  const groupStmt = db.prepare(`
    SELECT group_name FROM space_manager_groups
    WHERE space_name = ?
  `);
  const managerGroups = groupStmt.all(spaceName) as { group_name: string }[];

  if (managerGroups.length > 0) {
    try {
      const userGroups = await getUserGroups(username);
      const managerGroupNames = new Set(managerGroups.map((g) => g.group_name));
      const isManager = userGroups.some((g) => managerGroupNames.has(g));
      _managerCache.set(key, { result: isManager, timestamp: Date.now() });
      return isManager;
    } catch (err) {
      logger.warn(
        { err, username, spaceName },
        'Failed to fetch user groups for space manager check',
      );
    }
  }

  _managerCache.set(key, { result: false, timestamp: Date.now() });
  return false;
}

/**
 * Get all space names that a user manages (via direct assignment or group membership).
 */
export async function getUserManagedSpaces(username: string): Promise<string[]> {
  const db = getDatabase();
  const managed = new Set<string>();

  // 1. Direct user assignments
  const directStmt = db.prepare(`
    SELECT space_name FROM user_permission_overrides
    WHERE username = ? AND access_type = 'admin'
  `);
  const directRows = directStmt.all(username) as { space_name: string }[];
  for (const row of directRows) {
    managed.add(row.space_name);
  }

  // 2. Group-level delegation
  try {
    const userGroups = await getUserGroups(username);
    if (userGroups.length > 0) {
      // Build placeholders for IN clause
      const placeholders = userGroups.map(() => '?').join(',');
      const groupStmt = db.prepare(`
        SELECT DISTINCT space_name FROM space_manager_groups
        WHERE group_name IN (${placeholders})
      `);
      const groupRows = groupStmt.all(...userGroups) as { space_name: string }[];
      for (const row of groupRows) {
        managed.add(row.space_name);
      }
    }
  } catch (err) {
    logger.warn(
      { err, username },
      'Failed to fetch user groups for managed spaces lookup',
    );
  }

  return Array.from(managed);
}

/**
 * Get all managers (users and groups) for a specific space.
 */
export function getSpaceManagers(
  spaceName: string,
): { users: UserOverrideRow[]; groups: SpaceManagerGroupRow[] } {
  const db = getDatabase();

  const userStmt = db.prepare(`
    SELECT space_name, username, created_at
    FROM user_permission_overrides
    WHERE space_name = ? AND access_type = 'admin'
  `);
  const users = userStmt.all(spaceName) as UserOverrideRow[];

  const groupStmt = db.prepare(`
    SELECT space_name, group_name, created_at, created_by
    FROM space_manager_groups
    WHERE space_name = ?
  `);
  const groups = groupStmt.all(spaceName) as SpaceManagerGroupRow[];

  return { users, groups };
}

/**
 * Get all space manager assignments across all spaces.
 */
export function getAllSpaceManagerAssignments(): {
  users: (UserOverrideRow & { space_name: string })[];
  groups: SpaceManagerGroupRow[];
} {
  const db = getDatabase();

  const userStmt = db.prepare(`
    SELECT space_name, username, created_at
    FROM user_permission_overrides
    WHERE access_type = 'admin'
    ORDER BY space_name, username
  `);
  const users = userStmt.all() as (UserOverrideRow & { space_name: string })[];

  const groupStmt = db.prepare(`
    SELECT space_name, group_name, created_at, created_by
    FROM space_manager_groups
    ORDER BY space_name, group_name
  `);
  const groups = groupStmt.all() as SpaceManagerGroupRow[];

  return { users, groups };
}

// ── Mutations ──

/**
 * Assign a user as space manager.
 * Uses the existing user_permission_overrides table with access_type = 'admin'.
 */
export function assignUserAsManager(spaceName: string, username: string): void {
  setUserPermissionOverride(spaceName, username, 'admin');
  invalidateSpaceCache(spaceName);
  logger.info({ spaceName, username }, 'User assigned as space manager');
}

/**
 * Remove a user as space manager.
 */
export function removeUserAsManager(spaceName: string, username: string): void {
  removeUserPermissionOverride(spaceName, username);
  deleteCapabilities(spaceName, username);
  invalidateSpaceCache(spaceName);
  logger.info({ spaceName, username }, 'User removed as space manager');
}

/**
 * Assign a group as space manager.
 */
export function assignGroupAsManager(
  spaceName: string,
  groupName: string,
  assignedBy?: string,
): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO space_manager_groups (space_name, group_name, created_by)
    VALUES (?, ?, ?)
    ON CONFLICT(space_name, group_name) DO NOTHING
  `);
  stmt.run(spaceName, groupName, assignedBy ?? null);

  invalidateSpaceCache(spaceName);
  logger.info({ spaceName, groupName, assignedBy }, 'Group assigned as space manager');
}

/**
 * Remove a group as space manager.
 */
export function removeGroupAsManager(spaceName: string, groupName: string): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    DELETE FROM space_manager_groups
    WHERE space_name = ? AND group_name = ?
  `);
  stmt.run(spaceName, groupName);

  invalidateSpaceCache(spaceName);
  logger.info({ spaceName, groupName }, 'Group removed as space manager');
}

/**
 * Remove all manager assignments for a space.
 * Called when a space is deleted.
 */
export function removeAllManagersForSpace(spaceName: string): void {
  const db = getDatabase();

  // Remove group assignments
  const groupStmt = db.prepare(`
    DELETE FROM space_manager_groups WHERE space_name = ?
  `);
  const groupResult = groupStmt.run(spaceName);

  // Remove user admin overrides (admin overrides are manager assignments)
  const userStmt = db.prepare(`
    DELETE FROM user_permission_overrides
    WHERE space_name = ? AND access_type = 'admin'
  `);
  const userResult = userStmt.run(spaceName);

  // Clean up all capability rows for this space
  deleteSpaceCapabilities(spaceName);

  invalidateSpaceCache(spaceName);
  logger.info(
    { spaceName, groupsRemoved: groupResult.changes, usersRemoved: userResult.changes },
    'All space manager assignments removed for space',
  );
}
