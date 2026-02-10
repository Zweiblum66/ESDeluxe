import type { Request, Response } from 'express';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import * as archiveStore from '../services/archive/archive.store.js';
import * as archiveService from '../services/archive/archive.service.js';
import { getBackend, clearBackendCache } from '../services/archive/backend-factory.js';
import { getMountPoint, mountSmb, unmountSmb, ensureMounted } from '../services/archive/smb-mount.service.js';
import type { ArchiveCatalogStatus, IArchiveLocation, ISmbArchiveConfig, IS3ArchiveConfig } from '../../../shared/types/archive.js';

function getParamId(req: Request, param = 'id'): number {
  const val = req.params[param];
  const str = Array.isArray(val) ? val[0] : val;
  const id = parseInt(str, 10);
  if (isNaN(id)) throw new ValidationError(`Invalid ${param}`);
  return id;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Mask sensitive fields (passwords, secret keys) in location configs before sending to clients. */
function maskSecrets(location: IArchiveLocation): IArchiveLocation {
  if (location.type === 'smb') {
    const config = { ...(location.config as ISmbArchiveConfig) };
    config.password = '********';
    return { ...location, config };
  }
  if (location.type === 's3') {
    const config = { ...(location.config as IS3ArchiveConfig) };
    config.secretAccessKey = '********';
    return { ...location, config };
  }
  return location;
}

// ──────────────────────────────────────────────
// Archive Locations
// ──────────────────────────────────────────────

export async function listLocations(_req: Request, res: Response): Promise<void> {
  const locations = archiveStore.listLocations();
  res.json({ data: locations.map(maskSecrets) });
}

export async function getLocation(req: Request, res: Response): Promise<void> {
  const id = getParamId(req);
  const location = archiveStore.getLocation(id);
  if (!location) throw new NotFoundError('Archive location', String(id));
  res.json({ data: maskSecrets(location) });
}

export async function createLocation(req: Request, res: Response): Promise<void> {
  const { name, type, config, description } = req.body;

  if (!name) throw new ValidationError('name is required');
  if (!type) throw new ValidationError('type is required');
  if (!config) throw new ValidationError('config is required');

  if (type === 'local' && !config.basePath) {
    throw new ValidationError('basePath is required for local archive locations');
  }

  if (type === 'smb') {
    if (!config.sharePath) throw new ValidationError('sharePath is required for SMB locations');
    if (!config.username) throw new ValidationError('username is required for SMB locations');
    if (!config.password) throw new ValidationError('password is required for SMB locations');

    // Compute and store the managed mount point
    const mountPoint = getMountPoint(name);
    config.mountPoint = mountPoint;

    // Attempt to mount — validates credentials & connectivity
    try {
      await mountSmb(config as ISmbArchiveConfig, mountPoint);
    } catch (err) {
      throw new ValidationError(`Failed to mount SMB share: ${(err as Error).message}`);
    }
  }

  if (type === 's3') {
    if (!config.bucket) throw new ValidationError('bucket is required for S3 locations');
    if (!config.region) throw new ValidationError('region is required for S3 locations');
    if (!config.accessKeyId) throw new ValidationError('accessKeyId is required for S3 locations');
    if (!config.secretAccessKey) throw new ValidationError('secretAccessKey is required for S3 locations');
  }

  const location = archiveStore.createLocation({ name, type, config, description });
  res.status(201).json({ data: maskSecrets(location) });
}

export async function updateLocation(req: Request, res: Response): Promise<void> {
  const id = getParamId(req);

  // If updating an SMB location's config, handle remount
  const existingLocation = archiveStore.getLocation(id);
  if (!existingLocation) throw new NotFoundError('Archive location', String(id));

  if (existingLocation.type === 's3' && req.body.config) {
    const oldConfig = existingLocation.config as IS3ArchiveConfig;
    const newConfig = req.body.config as IS3ArchiveConfig;

    // If secretAccessKey is masked (not changed by user), preserve the old one
    if (!newConfig.secretAccessKey || newConfig.secretAccessKey === '********') {
      newConfig.secretAccessKey = oldConfig.secretAccessKey;
    }
  }

  if (existingLocation.type === 'smb' && req.body.config) {
    const oldConfig = existingLocation.config as ISmbArchiveConfig;
    const newConfig = req.body.config as ISmbArchiveConfig;

    // Preserve the mount point
    newConfig.mountPoint = oldConfig.mountPoint || getMountPoint(existingLocation.name);

    // If SMB connection details changed, unmount old and mount new
    const connectionChanged =
      newConfig.sharePath !== oldConfig.sharePath ||
      newConfig.username !== oldConfig.username ||
      (newConfig.password && newConfig.password !== '********' && newConfig.password !== oldConfig.password) ||
      newConfig.domain !== oldConfig.domain;

    if (connectionChanged) {
      // If password is masked, keep the old one
      if (!newConfig.password || newConfig.password === '********') {
        newConfig.password = oldConfig.password;
      }

      try {
        await unmountSmb(newConfig.mountPoint);
      } catch {
        // Ignore unmount errors — share may already be disconnected
      }

      try {
        await mountSmb(newConfig, newConfig.mountPoint);
      } catch (err) {
        // Remount old config on failure
        try { await mountSmb(oldConfig, newConfig.mountPoint); } catch { /* best effort */ }
        throw new ValidationError(`Failed to mount updated SMB share: ${(err as Error).message}`);
      }
    } else if (!newConfig.password || newConfig.password === '********') {
      // No connection change and password is masked — preserve old password
      newConfig.password = oldConfig.password;
    }
  }

  const location = archiveStore.updateLocation(id, req.body);
  if (!location) throw new NotFoundError('Archive location', String(id));

  // Clear backend cache if config changed
  if (req.body.config) {
    clearBackendCache(id);
  }

  res.json({ data: maskSecrets(location) });
}

export async function deleteLocation(req: Request, res: Response): Promise<void> {
  const id = getParamId(req);

  // Check if it's an SMB location — unmount before deleting
  const location = archiveStore.getLocation(id);
  if (location?.type === 'smb') {
    const smbConfig = location.config as ISmbArchiveConfig;
    const mountPoint = smbConfig.mountPoint || getMountPoint(location.name);
    try {
      await unmountSmb(mountPoint);
    } catch {
      // Ignore unmount errors on deletion
    }
  }

  const deleted = archiveStore.deleteLocation(id);
  if (!deleted) throw new NotFoundError('Archive location', String(id));

  clearBackendCache(id);
  res.json({ message: 'Archive location deleted' });
}

export async function testLocation(req: Request, res: Response): Promise<void> {
  const id = getParamId(req);

  const location = archiveStore.getLocation(id);
  if (!location) throw new NotFoundError('Archive location', String(id));

  // For SMB locations, ensure the share is mounted before testing
  if (location.type === 'smb') {
    const smbConfig = location.config as ISmbArchiveConfig;
    const mountPoint = smbConfig.mountPoint || getMountPoint(location.name);
    try {
      await ensureMounted(smbConfig, mountPoint);
    } catch (err) {
      res.json({ data: { ok: false, message: `SMB mount failed: ${(err as Error).message}` } });
      return;
    }
  }

  const backend = getBackend(location);
  const result = await backend.validate();

  res.json({ data: result });
}

// ──────────────────────────────────────────────
// Archive File Operations
// ──────────────────────────────────────────────

export async function archiveFile(req: Request, res: Response): Promise<void> {
  const { spaceName, filePath, archiveLocationId } = req.body;

  if (!spaceName) throw new ValidationError('spaceName is required');
  if (!filePath) throw new ValidationError('filePath is required');
  if (!archiveLocationId) throw new ValidationError('archiveLocationId is required');

  // Get username from auth context if available
  const user = (req as unknown as { user?: { username?: string } }).user?.username;

  const entry = await archiveService.archiveFile(spaceName, filePath, archiveLocationId, user);
  res.status(201).json({ data: entry });
}

export async function bulkArchive(req: Request, res: Response): Promise<void> {
  const { spaceName, filePaths, archiveLocationId } = req.body;

  if (!spaceName) throw new ValidationError('spaceName is required');
  if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
    throw new ValidationError('filePaths must be a non-empty array');
  }
  if (!archiveLocationId) throw new ValidationError('archiveLocationId is required');

  const user = (req as unknown as { user?: { username?: string } }).user?.username;

  const result = await archiveService.bulkArchive(spaceName, filePaths, archiveLocationId, user);
  res.json({ data: result });
}

export async function restoreFile(req: Request, res: Response): Promise<void> {
  const { catalogEntryId } = req.body;

  if (!catalogEntryId) throw new ValidationError('catalogEntryId is required');

  const entry = await archiveService.restoreFile(catalogEntryId);
  res.json({ data: entry });
}

export async function bulkRestore(req: Request, res: Response): Promise<void> {
  const { catalogEntryIds } = req.body;

  if (!catalogEntryIds || !Array.isArray(catalogEntryIds) || catalogEntryIds.length === 0) {
    throw new ValidationError('catalogEntryIds must be a non-empty array');
  }

  const result = await archiveService.bulkRestore(catalogEntryIds);
  res.json({ data: result });
}

// ──────────────────────────────────────────────
// Archive Catalog
// ──────────────────────────────────────────────

export async function queryCatalog(req: Request, res: Response): Promise<void> {
  const query = {
    spaceName: req.query.spaceName as string | undefined,
    locationId: req.query.locationId ? parseInt(req.query.locationId as string, 10) : undefined,
    status: req.query.status as ArchiveCatalogStatus | undefined,
    searchTerm: req.query.search as string | undefined,
    dateFrom: req.query.dateFrom ? parseInt(req.query.dateFrom as string, 10) : undefined,
    dateTo: req.query.dateTo ? parseInt(req.query.dateTo as string, 10) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
  };

  const result = archiveStore.queryCatalog(query);
  res.json({ data: result });
}

export async function getCatalogEntry(req: Request, res: Response): Promise<void> {
  const id = getParamId(req);
  const entry = archiveStore.getCatalogEntry(id);
  if (!entry) throw new NotFoundError('Catalog entry', String(id));
  res.json({ data: entry });
}

export async function deleteCatalogEntry(req: Request, res: Response): Promise<void> {
  const id = getParamId(req);

  await archiveService.deleteFromArchive(id);
  res.json({ message: 'Archive entry deleted' });
}

// ──────────────────────────────────────────────
// Archive Stats
// ──────────────────────────────────────────────

export async function getStats(_req: Request, res: Response): Promise<void> {
  const stats = archiveStore.getArchiveStats();
  res.json({ data: stats });
}
