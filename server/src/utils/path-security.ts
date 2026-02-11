import path from 'path';
import { config } from '../config/index.js';

/**
 * Path traversal error - thrown when a path resolves outside the EFS mount.
 */
export class PathTraversalError extends Error {
  public readonly statusCode = 403;
  public readonly code = 'PATH_TRAVERSAL';

  constructor(message = 'Path traversal attempt detected') {
    super(message);
    this.name = 'PathTraversalError';
  }
}

/**
 * Maps EditShare API space subtype to the filesystem directory name.
 *
 * On the EFS filesystem, spaces are organized by type:
 *   /efs/efs_1/Unmanaged/footage_1/Content/
 *   /efs/efs_1/Managed/moinsen_1/Content/
 *   /efs/efs_1/ACL/my acl_1/Content/
 *   /efs/efs_1/AvidStyle/avid demo_1/Content/
 */
export function spaceTypeToDir(subtype: string): string {
  switch (subtype.toLowerCase()) {
    case 'unmanaged':
      return 'Unmanaged';
    case 'managed':
      return 'Managed';
    case 'acl':
      return 'ACL';
    case 'avidstyle':
      return 'AvidStyle';
    case 'avidmxf':
      return 'AvidMXF';
    default:
      return 'Unmanaged';
  }
}

/**
 * Validates that an absolute path stays within the EFS mount point.
 * Throws PathTraversalError if the path escapes the mount.
 */
export function validateEfsPath(absPath: string): string {
  const mountPoint = config.EFS_MOUNT_POINT;
  const resolved = path.resolve(absPath);

  if (resolved !== mountPoint && !resolved.startsWith(mountPoint + '/')) {
    throw new PathTraversalError(
      `Path '${absPath}' resolves outside the EFS mount point`,
    );
  }

  return resolved;
}

/**
 * Resolves a space name + type + relative path to an absolute filesystem path,
 * validated to stay within the EFS mount point.
 *
 * Filesystem convention:
 *   EFS_MOUNT_POINT/<TypeDir>/<spacename>_1/Content/<relativePath>
 *
 * @param spaceName - The space name from the ES API (e.g., "footage", "my acl")
 * @param spaceType - The space subtype (e.g., "unmanaged", "acl")
 * @param relativePath - Optional path within the space's Content directory
 * @returns Absolute validated path
 * @throws PathTraversalError if the path escapes the mount
 */
export function resolveSpacePath(
  spaceName: string,
  spaceType: string,
  relativePath?: string,
): string {
  // Reject null bytes
  if (spaceName.includes('\0') || spaceType.includes('\0') || (relativePath && relativePath.includes('\0'))) {
    throw new PathTraversalError('Null bytes in path');
  }

  // Reject .. segments in relative path (defense in depth, before resolve)
  if (relativePath) {
    const segments = relativePath.split('/');
    if (segments.some((s) => s === '..')) {
      throw new PathTraversalError('Path contains ".." segments');
    }
  }

  const typeDir = spaceTypeToDir(spaceType);
  const spaceDir = `${spaceName}_1`;

  const parts = [config.EFS_MOUNT_POINT, typeDir, spaceDir, 'Content'];
  if (relativePath && relativePath !== '' && relativePath !== '/') {
    // Strip leading slash if present
    const clean = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    if (clean) {
      parts.push(clean);
    }
  }

  const joined = path.join(...parts);
  return validateEfsPath(joined);
}

/**
 * Resolves a path to the space root directory (the directory containing Content, uuid, etc.).
 * Useful for reading space metadata files.
 */
export function resolveSpaceRoot(spaceName: string, spaceType: string): string {
  if (spaceName.includes('\0') || spaceType.includes('\0')) {
    throw new PathTraversalError('Null bytes in path');
  }

  const typeDir = spaceTypeToDir(spaceType);
  const spaceDir = `${spaceName}_1`;

  const joined = path.join(config.EFS_MOUNT_POINT, typeDir, spaceDir);
  return validateEfsPath(joined);
}
