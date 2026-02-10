/**
 * Trash Service — EFS snapshot-based soft delete with restore and purge.
 *
 * Flow:
 *   1. DELETE request → snapshot to .trash/ → delete original → record in DB
 *   2. RESTORE request → snapshot from .trash/ back to original → delete trash copy → remove from DB
 *   3. PURGE (auto or manual) → delete trash copy → remove from DB
 *
 * efs-makesnapshot creates lazy copies (COW) that share chunks with the original,
 * so the snapshot costs zero additional storage until the trash copy is the only
 * reference to the data (i.e., after the original is deleted, the chunks remain
 * referenced by the trash copy alone).
 */
import fs from 'fs/promises';
import path from 'path';
import { execEfsCommand } from '../efs-cli/executor.js';
import { resolveSpacePath } from '../../utils/path-security.js';
import { getSpaceInfo } from '../filesystem.service.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import * as trashStore from './trash.store.js';
import type { ITrashEntry, ITrashOperationResult } from '../../../../shared/types/trash.js';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const TRASH_DIR_NAME = '.trash';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Resolves the absolute path of the .trash directory for a space.
 * Creates it if it doesn't exist.
 */
async function resolveTrashDir(spaceName: string): Promise<string> {
  const space = await getSpaceInfo(spaceName);
  const contentRoot = resolveSpacePath(spaceName, space.type);
  const trashDir = path.join(contentRoot, TRASH_DIR_NAME);

  try {
    await fs.mkdir(trashDir, { recursive: true });
  } catch {
    // May already exist
  }

  return trashDir;
}

/**
 * Generates a unique trash path for an entry.
 * Format: .trash/<timestamp>_<originalName>
 * Ensures uniqueness by appending a counter if needed.
 */
function generateTrashName(originalName: string): string {
  const ts = Date.now();
  return `${ts}_${originalName}`;
}

/**
 * Gets file/directory size. For directories, uses efs-dirinfo for accurate size.
 */
async function getEntrySize(absPath: string): Promise<number> {
  try {
    const stat = await fs.stat(absPath);
    if (stat.isFile()) {
      return stat.size;
    }
    // For directories, try efs-dirinfo for accurate size
    try {
      const stdout = await execEfsCommand('efs-dirinfo', [absPath], { timeout: 30_000 });
      const sizeMatch = stdout.match(/^size:\s+(\d+)/m);
      if (sizeMatch) return parseInt(sizeMatch[1], 10);
      const lengthMatch = stdout.match(/^length:\s+(\d+)/m);
      if (lengthMatch) return parseInt(lengthMatch[1], 10);
    } catch {
      // Fall back to stat size
    }
    return stat.size;
  } catch {
    return 0;
  }
}

// ──────────────────────────────────────────────
// Core operations
// ──────────────────────────────────────────────

/**
 * Move a file/directory to trash using EFS snapshot.
 *
 * 1. Create .trash/ dir if needed
 * 2. efs-makesnapshot <source> <trash_dest>
 * 3. Delete the original with fs.rm/unlink
 * 4. Record metadata in DB
 */
export async function moveToTrash(
  spaceName: string,
  relativePath: string,
  deletedBy = 'system',
): Promise<ITrashEntry> {
  if (!relativePath) {
    throw new ValidationError('Cannot trash the space root directory');
  }

  const config = trashStore.getConfig();
  if (!config.enabled) {
    throw new ValidationError('Trash is disabled. Items will be permanently deleted.');
  }

  const space = await getSpaceInfo(spaceName);
  const absPath = resolveSpacePath(spaceName, space.type, relativePath);

  // Verify source exists
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      throw new NotFoundError('File or directory', relativePath);
    }
    throw err;
  }

  const entryType: 'file' | 'directory' = stat.isDirectory() ? 'directory' : 'file';
  const originalName = path.basename(absPath);
  const sizeBytes = await getEntrySize(absPath);

  // Create .trash directory
  const trashDir = await resolveTrashDir(spaceName);

  // Generate unique trash destination
  const trashName = generateTrashName(originalName);
  const trashAbsPath = path.join(trashDir, trashName);
  const trashRelPath = `${TRASH_DIR_NAME}/${trashName}`;

  // Step 1: Create EFS snapshot (lazy copy)
  try {
    await execEfsCommand('efs-makesnapshot', [absPath, trashAbsPath], { timeout: 120_000 });
  } catch (err) {
    logger.error(
      { err, spaceName, path: relativePath },
      'Failed to create EFS snapshot for trash',
    );
    throw new Error(`Failed to create trash snapshot: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 2: Delete the original
  try {
    if (stat.isDirectory()) {
      await fs.rm(absPath, { recursive: true });
    } else {
      await fs.unlink(absPath);
    }
  } catch (err) {
    // If delete fails, clean up the snapshot and re-throw
    logger.error({ err, spaceName, path: relativePath }, 'Failed to delete original after snapshot');
    try {
      await fs.rm(trashAbsPath, { recursive: true });
    } catch {
      // Ignore cleanup error
    }
    throw err;
  }

  // Step 3: Record in database
  const entry = trashStore.createEntry({
    spaceName,
    originalPath: relativePath,
    originalName,
    entryType,
    sizeBytes,
    trashPath: trashRelPath,
    deletedBy,
    retentionDays: config.retentionDays,
  });

  logger.info(
    { trashId: entry.id, spaceName, originalPath: relativePath, trashPath: trashRelPath, sizeBytes },
    'Entry moved to trash',
  );

  return entry;
}

/**
 * Restore a trashed item back to its original location (or a custom target).
 *
 * 1. efs-makesnapshot <trash_copy> <original_path>
 * 2. Delete the trash copy
 * 3. Remove from DB
 */
export async function restoreFromTrash(
  trashId: number,
  options?: { targetSpaceName?: string; targetPath?: string },
): Promise<ITrashOperationResult> {
  const entry = trashStore.getEntry(trashId);
  if (!entry) {
    throw new NotFoundError('Trash entry', String(trashId));
  }
  if (entry.status !== 'active') {
    throw new ValidationError(`Trash entry is ${entry.status}, cannot restore`);
  }

  // Mark as restoring
  trashStore.updateStatus(trashId, 'restoring');

  try {
    const space = await getSpaceInfo(entry.spaceName);
    const contentRoot = resolveSpacePath(entry.spaceName, space.type);
    const trashAbsPath = path.join(contentRoot, entry.trashPath);

    // Verify trash copy exists
    try {
      await fs.stat(trashAbsPath);
    } catch {
      // Trash file missing — remove DB entry
      trashStore.deleteEntry(trashId);
      throw new NotFoundError('Trash file on disk', entry.trashPath);
    }

    // Determine restore destination
    let destAbsPath: string;
    if (options?.targetSpaceName && options.targetPath !== undefined) {
      const destSpace = await getSpaceInfo(options.targetSpaceName);
      const destBase = resolveSpacePath(options.targetSpaceName, destSpace.type, options.targetPath || undefined);
      destAbsPath = path.join(destBase, entry.originalName);
    } else {
      destAbsPath = resolveSpacePath(entry.spaceName, space.type, entry.originalPath);
    }

    // Check destination doesn't already exist
    try {
      await fs.stat(destAbsPath);
      throw new ValidationError(`Destination already exists: ${path.basename(destAbsPath)}`);
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      // ENOENT is expected (doesn't exist = good)
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(destAbsPath);
    try {
      await fs.stat(parentDir);
    } catch {
      throw new ValidationError(`Parent directory no longer exists: ${path.dirname(entry.originalPath)}`);
    }

    // Snapshot from trash back to original location
    await execEfsCommand('efs-makesnapshot', [trashAbsPath, destAbsPath], { timeout: 120_000 });

    // Delete trash copy
    try {
      await fs.rm(trashAbsPath, { recursive: true });
    } catch (err) {
      logger.warn({ err, trashId, trashPath: entry.trashPath }, 'Failed to remove trash copy after restore');
    }

    // Remove from DB
    trashStore.deleteEntry(trashId);

    logger.info(
      { trashId, spaceName: entry.spaceName, originalPath: entry.originalPath, destPath: destAbsPath },
      'Entry restored from trash',
    );

    return {
      success: true,
      message: `Restored: ${entry.originalName}`,
      itemCount: 1,
      bytesAffected: entry.sizeBytes,
    };
  } catch (err) {
    // Reset status back to active on failure
    trashStore.updateStatus(trashId, 'active');
    throw err;
  }
}

/**
 * Permanently delete a single trash entry.
 */
export async function purgeEntry(trashId: number): Promise<ITrashOperationResult> {
  const entry = trashStore.getEntry(trashId);
  if (!entry) {
    throw new NotFoundError('Trash entry', String(trashId));
  }
  if (entry.status !== 'active') {
    throw new ValidationError(`Trash entry is ${entry.status}, cannot purge`);
  }

  trashStore.updateStatus(trashId, 'purging');

  try {
    const space = await getSpaceInfo(entry.spaceName);
    const contentRoot = resolveSpacePath(entry.spaceName, space.type);
    const trashAbsPath = path.join(contentRoot, entry.trashPath);

    // Delete the trash copy from disk
    try {
      await fs.rm(trashAbsPath, { recursive: true });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code !== 'ENOENT') {
        throw err;
      }
      // ENOENT is fine — file already gone
    }

    // Remove from DB
    trashStore.deleteEntry(trashId);

    logger.info(
      { trashId, spaceName: entry.spaceName, originalPath: entry.originalPath },
      'Trash entry permanently purged',
    );

    return {
      success: true,
      message: `Purged: ${entry.originalName}`,
      itemCount: 1,
      bytesAffected: entry.sizeBytes,
    };
  } catch (err) {
    trashStore.updateStatus(trashId, 'active');
    throw err;
  }
}

/**
 * Purge all expired entries (called by scheduler).
 */
export async function purgeExpired(): Promise<ITrashOperationResult> {
  const expired = trashStore.getExpiredEntries();
  if (expired.length === 0) {
    return { success: true, message: 'No expired items', itemCount: 0, bytesAffected: 0 };
  }

  let totalPurged = 0;
  let totalBytes = 0;
  const errors: string[] = [];

  for (const entry of expired) {
    try {
      const result = await purgeEntry(entry.id);
      totalPurged += result.itemCount;
      totalBytes += result.bytesAffected;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${entry.spaceName}] ${entry.originalPath}: ${msg}`);
      logger.warn({ err, trashId: entry.id }, 'Failed to purge expired trash entry');
    }
  }

  if (errors.length > 0) {
    logger.warn({ errorCount: errors.length, purgedCount: totalPurged }, 'Some trash purge operations failed');
  }

  return {
    success: errors.length === 0,
    message: `Purged ${totalPurged} expired item(s)${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
    itemCount: totalPurged,
    bytesAffected: totalBytes,
  };
}

/**
 * Purge all trash entries for a specific space.
 */
export async function purgeSpace(spaceName: string): Promise<ITrashOperationResult> {
  const entries = trashStore.listEntries({ spaceName, status: 'active' });
  if (entries.length === 0) {
    return { success: true, message: 'No items in trash for this space', itemCount: 0, bytesAffected: 0 };
  }

  let totalPurged = 0;
  let totalBytes = 0;

  for (const entry of entries) {
    try {
      const result = await purgeEntry(entry.id);
      totalPurged += result.itemCount;
      totalBytes += result.bytesAffected;
    } catch (err) {
      logger.warn({ err, trashId: entry.id }, 'Failed to purge trash entry');
    }
  }

  return {
    success: true,
    message: `Purged ${totalPurged} item(s) from ${spaceName}`,
    itemCount: totalPurged,
    bytesAffected: totalBytes,
  };
}

/**
 * Purge ALL trash entries across all spaces.
 */
export async function purgeAll(): Promise<ITrashOperationResult> {
  const entries = trashStore.listEntries({ status: 'active' });
  if (entries.length === 0) {
    return { success: true, message: 'Trash is empty', itemCount: 0, bytesAffected: 0 };
  }

  let totalPurged = 0;
  let totalBytes = 0;

  for (const entry of entries) {
    try {
      const result = await purgeEntry(entry.id);
      totalPurged += result.itemCount;
      totalBytes += result.bytesAffected;
    } catch (err) {
      logger.warn({ err, trashId: entry.id }, 'Failed to purge trash entry');
    }
  }

  return {
    success: true,
    message: `Purged ${totalPurged} item(s) from all spaces`,
    itemCount: totalPurged,
    bytesAffected: totalBytes,
  };
}
