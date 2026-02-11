import { logger } from '../../utils/logger.js';
import type { IArchiveBackend } from './archive-backend.interface.js';
import { LocalArchiveBackend } from './local-backend.js';
import { S3ArchiveBackend } from './s3-backend.js';
import { getMountPoint } from './smb-mount.service.js';
import type { IArchiveLocation, ILocalArchiveConfig, ISmbArchiveConfig, IS3ArchiveConfig } from '../../../../shared/types/archive.js';

/**
 * Cache of backend instances keyed by location ID.
 * Backends are stateless, so caching saves re-construction.
 */
const backendCache = new Map<number, IArchiveBackend>();

/**
 * Create or retrieve a backend instance for an archive location.
 */
export function getBackend(location: IArchiveLocation): IArchiveBackend {
  const cached = backendCache.get(location.id);
  if (cached) return cached;

  let backend: IArchiveBackend;

  switch (location.type) {
    case 'local':
      backend = new LocalArchiveBackend(location.config as ILocalArchiveConfig);
      break;

    case 'smb': {
      // SMB uses LocalArchiveBackend with the mount point as basePath.
      // The share must already be mounted (at creation or startup remount).
      const smbConfig = location.config as ISmbArchiveConfig;
      const mountPoint = smbConfig.mountPoint || getMountPoint(location.name);
      backend = new LocalArchiveBackend({ basePath: mountPoint });
      break;
    }

    case 's3':
      backend = new S3ArchiveBackend(location.config as IS3ArchiveConfig);
      break;

    case 'tape':
      // Future: TapeArchiveBackend
      throw new Error(`Tape archive backend is not yet implemented`);

    default:
      throw new Error(`Unknown archive location type: ${location.type}`);
  }

  backendCache.set(location.id, backend);
  logger.debug({ locationId: location.id, type: location.type }, 'Archive backend created');

  return backend;
}

/**
 * Clear cached backend instance(s).
 * Call when a location's config changes or is deleted.
 */
export function clearBackendCache(locationId?: number): void {
  if (locationId !== undefined) {
    backendCache.delete(locationId);
  } else {
    backendCache.clear();
  }
}
