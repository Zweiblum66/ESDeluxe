import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';
import { NotFoundError, ValidationError, AppError } from '../../utils/errors.js';
import { getBackend } from './backend-factory.js';
import * as archiveStore from './archive.store.js';
import { getSpaceInfo } from '../filesystem.service.js';
import { resolveSpacePath } from '../../utils/path-security.js';
import type { IArchiveStub, IArchiveCatalogEntry } from '../../../../shared/types/archive.js';

const STUB_MAX_SIZE = 4096; // 4 KB — stubs are always smaller than this

// ──────────────────────────────────────────────
// Stub file helpers
// ──────────────────────────────────────────────

/**
 * Check if a file is an archive stub by reading its contents.
 * Quick check: file must be < 4KB and parse as JSON with esarchive marker.
 */
export async function isStubFile(absPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile() || stat.size > STUB_MAX_SIZE) return false;
    const content = await fs.readFile(absPath, 'utf-8');
    const parsed = JSON.parse(content);
    return parsed?.esarchive === true;
  } catch {
    return false;
  }
}

/**
 * Read and parse an archive stub file.
 */
export async function readStubFile(absPath: string): Promise<IArchiveStub | null> {
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile() || stat.size > STUB_MAX_SIZE) return null;
    const content = await fs.readFile(absPath, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed?.esarchive !== true) return null;
    return parsed as IArchiveStub;
  } catch {
    return null;
  }
}

/**
 * Write a stub file to replace the original file.
 */
async function writeStubFile(absPath: string, stub: IArchiveStub): Promise<void> {
  const content = JSON.stringify(stub, null, 2);
  await fs.writeFile(absPath, content, 'utf-8');
}

// ──────────────────────────────────────────────
// Resolve space paths
// ──────────────────────────────────────────────

async function resolveFileAbsPath(spaceName: string, filePath: string): Promise<string> {
  const space = await getSpaceInfo(spaceName);
  return resolveSpacePath(spaceName, space.type, filePath);
}

// ──────────────────────────────────────────────
// Archive operations
// ──────────────────────────────────────────────

/**
 * Archive a single file: copy to archive location, replace original with stub.
 */
export async function archiveFile(
  spaceName: string,
  filePath: string,
  locationId: number,
  user?: string,
): Promise<IArchiveCatalogEntry> {
  // Get archive location
  const location = archiveStore.getLocation(locationId);
  if (!location) throw new NotFoundError('Archive location', String(locationId));
  if (!location.enabled) throw new ValidationError('Archive location is disabled');

  // Resolve absolute path of the source file
  const absPath = await resolveFileAbsPath(spaceName, filePath);

  // Verify it's a file and not already a stub
  const stat = await fs.stat(absPath).catch(() => null);
  if (!stat) throw new NotFoundError('File', filePath);
  if (!stat.isFile()) throw new ValidationError('Path is not a file');

  const stub = await readStubFile(absPath);
  if (stub) throw new ValidationError('File is already an archive stub');

  // Check if already archived
  const existing = archiveStore.getCatalogEntryByPath(spaceName, filePath);
  if (existing && existing.status === 'archived') {
    throw new ValidationError('File is already archived');
  }

  // Build the archive relative path: <spaceName>/<filePath>
  const archiveRelPath = `${spaceName}/${filePath}`;

  // Get backend
  const backend = getBackend(location);

  // Create catalog entry with 'archiving' status
  const catalogEntry = archiveStore.createCatalogEntry({
    originalSpace: spaceName,
    originalPath: filePath,
    originalSize: stat.size,
    originalMtime: Math.floor(stat.mtimeMs / 1000),
    checksum: '', // Will be updated after store
    archiveLocationId: locationId,
    archivePath: archiveRelPath,
    status: 'archiving',
    archivedBy: user,
  });

  try {
    // Store file to archive backend
    const result = await backend.store(absPath, archiveRelPath);

    // Write stub to replace original
    const stubData: IArchiveStub = {
      esarchive: true,
      version: 1,
      originalName: path.basename(filePath),
      originalSize: stat.size,
      archiveLocationId: locationId,
      archiveLocationName: location.name,
      archivePath: archiveRelPath,
      checksum: result.checksum,
      archivedAt: Math.floor(Date.now() / 1000),
      archivedBy: user,
      catalogEntryId: catalogEntry.id,
    };

    await writeStubFile(absPath, stubData);

    // Update catalog entry to 'archived'
    archiveStore.updateCatalogEntry(catalogEntry.id, {
      status: 'archived',
      checksum: result.checksum,
    });

    // Update location stats
    archiveStore.updateLocationStats(locationId, result.size, 1);

    logger.info(
      { space: spaceName, path: filePath, locationId, size: stat.size, checksum: result.checksum },
      'File archived successfully',
    );

    return archiveStore.getCatalogEntry(catalogEntry.id)!;
  } catch (err) {
    // Mark as failed
    archiveStore.updateCatalogEntry(catalogEntry.id, {
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    logger.error({ err, space: spaceName, path: filePath }, 'Archive operation failed');
    throw new AppError(`Failed to archive file: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Restore a file from archive: retrieve from backend, replace stub with original.
 */
export async function restoreFile(catalogEntryId: number): Promise<IArchiveCatalogEntry> {
  const entry = archiveStore.getCatalogEntry(catalogEntryId);
  if (!entry) throw new NotFoundError('Catalog entry', String(catalogEntryId));
  if (entry.status !== 'archived') {
    throw new ValidationError(`Cannot restore entry with status '${entry.status}'`);
  }

  const location = archiveStore.getLocation(entry.archiveLocationId);
  if (!location) throw new NotFoundError('Archive location', String(entry.archiveLocationId));

  const absPath = await resolveFileAbsPath(entry.originalSpace, entry.originalPath);

  // Verify the stub exists at the original location
  const stubData = await readStubFile(absPath);
  if (!stubData) {
    logger.warn(
      { entryId: catalogEntryId, path: absPath },
      'Expected stub file at original path, but none found. Restoring anyway.',
    );
  }

  const backend = getBackend(location);

  // Mark as restoring
  archiveStore.updateCatalogEntry(catalogEntryId, { status: 'restoring' });

  try {
    // Retrieve to a temporary location first
    const tempPath = `${absPath}.es-restore-tmp`;

    await backend.retrieve(entry.archivePath, tempPath);

    // Remove stub (or whatever is there) and rename temp to original
    try { await fs.unlink(absPath); } catch { /* may not exist */ }
    await fs.rename(tempPath, absPath);

    // Update catalog
    const now = Math.floor(Date.now() / 1000);
    archiveStore.updateCatalogEntry(catalogEntryId, {
      status: 'restored',
      restoredAt: now,
    });

    // Update location stats (subtract)
    archiveStore.updateLocationStats(entry.archiveLocationId, -entry.originalSize, -1);

    logger.info(
      { entryId: catalogEntryId, space: entry.originalSpace, path: entry.originalPath },
      'File restored successfully',
    );

    return archiveStore.getCatalogEntry(catalogEntryId)!;
  } catch (err) {
    archiveStore.updateCatalogEntry(catalogEntryId, {
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    // Clean up temp file if it exists
    try { await fs.unlink(`${absPath}.es-restore-tmp`); } catch { /* ignore */ }

    logger.error({ err, entryId: catalogEntryId }, 'Restore operation failed');
    throw new AppError(`Failed to restore file: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Restore a file using priority-based location selection.
 * Finds all archived copies of the file, sorted by location priority,
 * and attempts restore from each until one succeeds.
 */
export async function restoreFileByPriority(
  spaceName: string,
  filePath: string,
): Promise<IArchiveCatalogEntry> {
  // Get all archived entries for this file, ordered by location priority
  const entries = archiveStore.getCatalogEntriesByPath(spaceName, filePath);
  if (entries.length === 0) {
    throw new NotFoundError('Archived copy', `${spaceName}/${filePath}`);
  }

  const errors: { locationName: string; error: string }[] = [];

  for (const entry of entries) {
    try {
      logger.info(
        { space: spaceName, path: filePath, locationId: entry.archiveLocationId, locationName: entry.archiveLocationName },
        `Attempting restore from location: ${entry.archiveLocationName} (priority entry)`,
      );
      return await restoreFile(entry.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ locationName: entry.archiveLocationName || `location-${entry.archiveLocationId}`, error: message });
      logger.warn(
        { err, space: spaceName, path: filePath, locationName: entry.archiveLocationName },
        'Restore attempt failed, trying next priority location',
      );
    }
  }

  // All attempts failed
  const errorDetail = errors.map(e => `${e.locationName}: ${e.error}`).join('; ');
  throw new AppError(`Failed to restore from all ${entries.length} locations: ${errorDetail}`);
}

/**
 * Bulk archive: archive multiple files to the same location.
 */
export async function bulkArchive(
  spaceName: string,
  filePaths: string[],
  locationId: number,
  user?: string,
): Promise<{ succeeded: IArchiveCatalogEntry[]; failed: { path: string; error: string }[] }> {
  const succeeded: IArchiveCatalogEntry[] = [];
  const failed: { path: string; error: string }[] = [];

  for (const filePath of filePaths) {
    try {
      const entry = await archiveFile(spaceName, filePath, locationId, user);
      succeeded.push(entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ path: filePath, error: message });
      logger.warn({ err, space: spaceName, path: filePath }, 'Bulk archive: file failed');
    }
  }

  logger.info(
    { space: spaceName, total: filePaths.length, succeeded: succeeded.length, failed: failed.length },
    'Bulk archive completed',
  );

  return { succeeded, failed };
}

/**
 * Bulk restore: restore multiple catalog entries.
 */
export async function bulkRestore(
  catalogEntryIds: number[],
): Promise<{ succeeded: IArchiveCatalogEntry[]; failed: { id: number; error: string }[] }> {
  const succeeded: IArchiveCatalogEntry[] = [];
  const failed: { id: number; error: string }[] = [];

  for (const id of catalogEntryIds) {
    try {
      const entry = await restoreFile(id);
      succeeded.push(entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ id, error: message });
      logger.warn({ err, entryId: id }, 'Bulk restore: entry failed');
    }
  }

  logger.info(
    { total: catalogEntryIds.length, succeeded: succeeded.length, failed: failed.length },
    'Bulk restore completed',
  );

  return { succeeded, failed };
}

/**
 * Delete a file from the archive (backend + catalog).
 * Does NOT restore the original — just cleans up.
 */
export async function deleteFromArchive(catalogEntryId: number): Promise<void> {
  const entry = archiveStore.getCatalogEntry(catalogEntryId);
  if (!entry) throw new NotFoundError('Catalog entry', String(catalogEntryId));

  const location = archiveStore.getLocation(entry.archiveLocationId);
  if (location) {
    const backend = getBackend(location);
    try {
      await backend.delete(entry.archivePath);
    } catch (err) {
      logger.warn({ err, entryId: catalogEntryId }, 'Failed to delete file from archive backend');
    }

    // Update location stats
    archiveStore.updateLocationStats(entry.archiveLocationId, -entry.originalSize, -1);
  }

  // Mark as deleted
  archiveStore.updateCatalogEntry(catalogEntryId, { status: 'deleted' });

  logger.info({ entryId: catalogEntryId }, 'Archive catalog entry marked as deleted');
}
