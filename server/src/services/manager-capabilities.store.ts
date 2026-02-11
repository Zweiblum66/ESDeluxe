import { getDatabase } from '../db/index.js';
import { logger } from '../utils/logger.js';
import type { ISpaceManagerCapabilities, IUpdateCapabilitiesRequest } from '../../../shared/types/roles.js';

// ── Types ──

interface CapabilitiesRow {
  space_name: string;
  username: string;
  can_manage_users: number;
  can_manage_groups: number;
  can_manage_quota: number;
  max_quota_bytes: number | null;
}

/** Default capabilities — all enabled, no limits */
const DEFAULTS: ISpaceManagerCapabilities = {
  canManageUsers: true,
  canManageGroups: true,
  canManageQuota: true,
};

// ── Queries ──

/**
 * Get capabilities for a specific user on a specific space.
 * Returns default (all enabled) if no row exists.
 */
export function getCapabilities(spaceName: string, username: string): ISpaceManagerCapabilities {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT can_manage_users, can_manage_groups, can_manage_quota, max_quota_bytes
    FROM manager_capabilities
    WHERE space_name = ? AND username = ?
  `);
  const row = stmt.get(spaceName, username) as CapabilitiesRow | undefined;

  if (!row) {
    return { ...DEFAULTS };
  }

  return {
    canManageUsers: row.can_manage_users === 1,
    canManageGroups: row.can_manage_groups === 1,
    canManageQuota: row.can_manage_quota === 1,
    ...(row.max_quota_bytes != null ? { maxQuotaBytes: row.max_quota_bytes } : {}),
  };
}

/**
 * Get capabilities for all users on a specific space.
 * Returns a map of username → capabilities.
 */
export function getAllCapabilitiesForSpace(
  spaceName: string,
): Map<string, ISpaceManagerCapabilities> {
  const db = getDatabase();
  const result = new Map<string, ISpaceManagerCapabilities>();

  const stmt = db.prepare(`
    SELECT username, can_manage_users, can_manage_groups, can_manage_quota, max_quota_bytes
    FROM manager_capabilities
    WHERE space_name = ?
  `);
  const rows = stmt.all(spaceName) as CapabilitiesRow[];

  for (const row of rows) {
    result.set(row.username, {
      canManageUsers: row.can_manage_users === 1,
      canManageGroups: row.can_manage_groups === 1,
      canManageQuota: row.can_manage_quota === 1,
      ...(row.max_quota_bytes != null ? { maxQuotaBytes: row.max_quota_bytes } : {}),
    });
  }

  return result;
}

// ── Mutations ──

/**
 * Upsert capabilities for a user on a space.
 */
export function setCapabilities(
  spaceName: string,
  username: string,
  caps: IUpdateCapabilitiesRequest,
): void {
  const db = getDatabase();

  // Get current values (or defaults) to merge partial updates
  const current = getCapabilities(spaceName, username);

  const canManageUsers = caps.canManageUsers ?? current.canManageUsers;
  const canManageGroups = caps.canManageGroups ?? current.canManageGroups;
  const canManageQuota = caps.canManageQuota ?? current.canManageQuota;
  const maxQuotaBytes = caps.maxQuotaBytes === null
    ? null
    : (caps.maxQuotaBytes ?? current.maxQuotaBytes ?? null);

  const stmt = db.prepare(`
    INSERT INTO manager_capabilities (space_name, username, can_manage_users, can_manage_groups, can_manage_quota, max_quota_bytes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(space_name, username) DO UPDATE SET
      can_manage_users = excluded.can_manage_users,
      can_manage_groups = excluded.can_manage_groups,
      can_manage_quota = excluded.can_manage_quota,
      max_quota_bytes = excluded.max_quota_bytes,
      updated_at = unixepoch()
  `);

  stmt.run(
    spaceName,
    username,
    canManageUsers ? 1 : 0,
    canManageGroups ? 1 : 0,
    canManageQuota ? 1 : 0,
    maxQuotaBytes,
  );

  logger.info(
    { spaceName, username, canManageUsers, canManageGroups, canManageQuota, maxQuotaBytes },
    'Manager capabilities updated',
  );
}

/**
 * Delete capabilities for a user on a space.
 * Called when a user is removed as manager.
 */
export function deleteCapabilities(spaceName: string, username: string): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    DELETE FROM manager_capabilities
    WHERE space_name = ? AND username = ?
  `);
  const result = stmt.run(spaceName, username);

  if (result.changes > 0) {
    logger.debug({ spaceName, username }, 'Manager capabilities deleted');
  }
}

/**
 * Delete all capabilities for a space.
 * Called when a space is deleted or all managers are removed.
 */
export function deleteSpaceCapabilities(spaceName: string): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    DELETE FROM manager_capabilities
    WHERE space_name = ?
  `);
  const result = stmt.run(spaceName);

  if (result.changes > 0) {
    logger.debug({ spaceName, removed: result.changes }, 'All manager capabilities deleted for space');
  }
}
