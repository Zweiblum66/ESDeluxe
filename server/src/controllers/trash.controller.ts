import type { Request, Response } from 'express';
import * as trashService from '../services/trash/trash.service.js';
import * as trashStore from '../services/trash/trash.store.js';
import { getSchedulerStatus, restartTrashScheduler } from '../services/trash/trash-scheduler.service.js';
import { getUserSpaces } from '../services/editshare-api/users.service.js';
import { isUserSpaceManager, getUserManagedSpaces } from '../services/space-manager.store.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// ──────────────────────────────────────────────
// List & Stats
// ──────────────────────────────────────────────

/**
 * Returns the set of space names the current user can access.
 * Includes both ES API space memberships and managed spaces.
 * Returns null for admins (meaning all spaces).
 */
async function getUserAccessibleSpaces(req: Request): Promise<Set<string> | null> {
  if (req.user?.isAdmin) return null; // admin sees all
  if (!req.user) return new Set();

  const spaces = new Set<string>();

  // 1. ES API space memberships
  try {
    const userSpaces = await getUserSpaces(req.user.username);
    for (const s of userSpaces) spaces.add(s.spaceName);
  } catch (err) {
    logger.warn({ err, username: req.user.username }, 'Failed to get user spaces for trash filtering');
  }

  // 2. Managed spaces (space manager role)
  try {
    const managed = await getUserManagedSpaces(req.user.username);
    for (const name of managed) spaces.add(name);
  } catch (err) {
    logger.warn({ err, username: req.user.username }, 'Failed to get managed spaces for trash filtering');
  }

  return spaces;
}

/**
 * GET /api/v1/trash
 * List trash entries. Admins see all; regular users only see entries from their spaces.
 */
export async function listEntries(req: Request, res: Response): Promise<void> {
  const spaceName = req.query.space as string | undefined;
  const status = (req.query.status as string) || 'active';
  const limit = parseInt(req.query.limit as string, 10) || 500;
  const offset = parseInt(req.query.offset as string, 10) || 0;

  const accessibleSpaces = await getUserAccessibleSpaces(req);
  let entries = trashStore.listEntries({ spaceName, status, limit, offset });

  // Filter by user's accessible spaces
  if (accessibleSpaces !== null) {
    entries = entries.filter((e) => accessibleSpaces.has(e.spaceName));
  }

  res.json({ data: entries });
}

/**
 * GET /api/v1/trash/stats
 * Get trash statistics. Admins see all; regular users see filtered stats.
 */
export async function getStats(req: Request, res: Response): Promise<void> {
  const stats = trashStore.getStats();

  const accessibleSpaces = await getUserAccessibleSpaces(req);

  // Filter stats for non-admin users
  if (accessibleSpaces !== null && stats) {
    stats.perSpace = stats.perSpace.filter((s) => accessibleSpaces.has(s.spaceName));
    stats.totalItems = stats.perSpace.reduce((sum, s) => sum + s.itemCount, 0);
    stats.totalSizeBytes = stats.perSpace.reduce((sum, s) => sum + s.sizeBytes, 0);
  }

  res.json({ data: stats });
}

// ──────────────────────────────────────────────
// Restore
// ──────────────────────────────────────────────

/**
 * POST /api/v1/trash/:id/restore
 * Restore a trashed item.
 */
export async function restoreEntry(req: Request, res: Response): Promise<void> {
  const idParam = req.params.id;
  const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
  if (isNaN(id)) {
    throw new ValidationError('Invalid trash entry ID');
  }

  // Check user has access to the entry's space
  if (!req.user?.isAdmin) {
    const entry = trashStore.getEntry(id);
    if (entry) {
      const accessibleSpaces = await getUserAccessibleSpaces(req);
      if (accessibleSpaces !== null && !accessibleSpaces.has(entry.spaceName)) {
        throw new ForbiddenError(`No access to space '${entry.spaceName}'`);
      }
    }
  }

  const { restoreToOriginal, targetSpaceName, targetPath } = req.body;

  const options = restoreToOriginal === false
    ? { targetSpaceName, targetPath }
    : undefined;

  const result = await trashService.restoreFromTrash(id, options);
  res.json({ data: result });
}

// ──────────────────────────────────────────────
// Purge
// ──────────────────────────────────────────────

/**
 * DELETE /api/v1/trash/:id
 * Permanently delete a single trash entry.
 * Allowed for admins and space managers of the entry's space.
 */
export async function purgeEntry(req: Request, res: Response): Promise<void> {
  const idParam = req.params.id;
  const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
  if (isNaN(id)) {
    throw new ValidationError('Invalid trash entry ID');
  }

  // Check authorization: admin or space manager
  if (!req.user?.isAdmin) {
    const entry = trashStore.getEntry(id);
    if (entry) {
      const isManager = req.user
        ? await isUserSpaceManager(req.user.username, entry.spaceName)
        : false;
      if (!isManager) {
        throw new ForbiddenError(`Not authorized to purge entries from space '${entry.spaceName}'`);
      }
    }
  }

  const result = await trashService.purgeEntry(id);
  res.json({ data: result });
}

/**
 * DELETE /api/v1/trash
 * Purge all trash, or all trash for a specific space.
 * Global purge (no space param) requires admin.
 * Space-specific purge allowed for space managers.
 */
export async function purgeAll(req: Request, res: Response): Promise<void> {
  const spaceName = req.query.space as string | undefined;

  // Authorization check
  if (!req.user?.isAdmin) {
    if (!spaceName) {
      // Global purge requires admin
      throw new ForbiddenError('Admin access required to purge all spaces');
    }
    // Space-specific purge: check space manager
    const isManager = req.user
      ? await isUserSpaceManager(req.user.username, spaceName)
      : false;
    if (!isManager) {
      throw new ForbiddenError(`Not authorized to purge trash for space '${spaceName}'`);
    }
  }

  let result;
  if (spaceName) {
    result = await trashService.purgeSpace(spaceName);
  } else {
    result = await trashService.purgeAll();
  }
  res.json({ data: result });
}

// ──────────────────────────────────────────────
// Configuration & Scheduler
// ──────────────────────────────────────────────

/**
 * GET /api/v1/trash/config
 * Get trash configuration and scheduler status.
 */
export async function getConfig(_req: Request, res: Response): Promise<void> {
  const config = trashStore.getConfig();
  const scheduler = getSchedulerStatus();
  res.json({ data: { config, scheduler } });
}

/**
 * PUT /api/v1/trash/config
 * Update trash configuration.
 */
export async function updateConfig(req: Request, res: Response): Promise<void> {
  const { enabled, retentionDays, purgeIntervalMinutes, maxTrashSizeBytes } = req.body;

  const updates: Record<string, unknown> = {};
  if (enabled !== undefined) updates.enabled = enabled;
  if (retentionDays !== undefined) {
    if (typeof retentionDays !== 'number' || retentionDays < 1) {
      throw new ValidationError('retentionDays must be a positive number');
    }
    updates.retentionDays = retentionDays;
  }
  if (purgeIntervalMinutes !== undefined) {
    if (typeof purgeIntervalMinutes !== 'number' || purgeIntervalMinutes < 1) {
      throw new ValidationError('purgeIntervalMinutes must be a positive number');
    }
    updates.purgeIntervalMinutes = purgeIntervalMinutes;
  }
  if (maxTrashSizeBytes !== undefined) {
    if (typeof maxTrashSizeBytes !== 'number' || maxTrashSizeBytes < 0) {
      throw new ValidationError('maxTrashSizeBytes must be a non-negative number');
    }
    updates.maxTrashSizeBytes = maxTrashSizeBytes;
  }

  trashStore.updateConfig(updates);

  // Restart scheduler if interval changed
  if (purgeIntervalMinutes !== undefined) {
    restartTrashScheduler();
  }

  const config = trashStore.getConfig();
  const scheduler = getSchedulerStatus();
  res.json({ data: { config, scheduler } });
}
