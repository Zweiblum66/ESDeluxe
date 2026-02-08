import fs from 'fs/promises';
import { createReadStream, createWriteStream, type ReadStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import { resolveSpacePath } from '../utils/path-security.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { PathTraversalError } from '../utils/path-security.js';
import { logger } from '../utils/logger.js';
import * as efsCli from './efs-cli/commands.js';
import * as esSpaces from './editshare-api/spaces.service.js';
import type {
  IDirectoryListing,
  IFileAcl,
  ISetAclRequest,
  IDirInfo,
  IFileChunkInfo,
} from '../../../shared/types/filesystem.js';
import type { ISpace } from '../../../shared/types/space.js';

// ──────────────────────────────────────────────
// Space info cache
// ──────────────────────────────────────────────

const spaceInfoCache = new Map<string, { space: ISpace; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Fetches space detail from ES API, with caching.
 * Needed to determine the space type for filesystem path resolution.
 */
export async function getSpaceInfo(spaceName: string): Promise<ISpace> {
  const cached = spaceInfoCache.get(spaceName);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.space;
  }

  const space = await esSpaces.getSpace(spaceName);
  spaceInfoCache.set(spaceName, { space, fetchedAt: Date.now() });
  return space;
}

/**
 * Resolves a space-relative path to an absolute filesystem path.
 * Looks up space type from ES API (cached) and builds the correct path.
 */
async function resolveSpace(spaceName: string, relativePath?: string): Promise<{
  absPath: string;
  contentRoot: string;
  spaceType: string;
}> {
  const space = await getSpaceInfo(spaceName);
  const spaceType = space.type;
  const absPath = resolveSpacePath(spaceName, spaceType, relativePath);
  const contentRoot = resolveSpacePath(spaceName, spaceType);
  return { absPath, contentRoot, spaceType };
}

// ──────────────────────────────────────────────
// Directory listing
// ──────────────────────────────────────────────

/**
 * Lists the contents of a directory within a space.
 * Uses efs-find for efficient directory enumeration.
 * Filters to direct children only (one level deep).
 */
export async function listDirectory(
  spaceName: string,
  relativePath = '',
): Promise<IDirectoryListing> {
  const { absPath, contentRoot } = await resolveSpace(spaceName, relativePath);

  // Verify the path exists and is a directory
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isDirectory()) {
      throw new ValidationError(`Path is not a directory: ${relativePath}`);
    }
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof PathTraversalError) throw err;
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      throw new NotFoundError('Directory', relativePath || '/');
    }
    throw err;
  }

  // Use efs-find to get all entries, then filter to direct children
  const allEntries = await efsCli.findEntries(absPath, contentRoot);

  // Compute the relative path of the directory we're listing
  // to filter only direct children
  let dirRelPath = '';
  if (absPath.startsWith(contentRoot)) {
    dirRelPath = absPath.slice(contentRoot.length);
    if (dirRelPath.startsWith('/')) dirRelPath = dirRelPath.slice(1);
  }

  // Filter to direct children: entries whose relative path has exactly one more segment
  const directChildren = allEntries.filter((entry) => {
    // Skip the directory itself (empty relative path for root, or same as dirRelPath)
    if (entry.path === dirRelPath || entry.path === '') return false;

    // For root listing (dirRelPath is empty), direct children have no slashes
    if (!dirRelPath) {
      return !entry.path.includes('/');
    }

    // For subdirectory listing, check it starts with dirRelPath/ and has no further slashes
    if (!entry.path.startsWith(dirRelPath + '/')) return false;
    const remainder = entry.path.slice(dirRelPath.length + 1);
    return remainder !== '' && !remainder.includes('/');
  });

  // Filter out hidden .DS_Store and ._ files by default
  const visibleEntries = directChildren.filter(
    (e) => !e.name.startsWith('._') && e.name !== '.DS_Store',
  );

  // Sort: directories first, then alphabetically
  visibleEntries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Compute totals
  let totalSize = 0;
  let totalFiles = 0;
  let totalDirs = 0;
  for (const entry of visibleEntries) {
    totalSize += entry.size;
    if (entry.type === 'file') totalFiles++;
    else totalDirs++;
  }

  return {
    path: relativePath || '/',
    spaceName,
    entries: visibleEntries,
    totalSize,
    totalFiles,
    totalDirs,
  };
}

// ──────────────────────────────────────────────
// Subdirectory listing (for tree sidebar)
// ──────────────────────────────────────────────

/**
 * Lists only subdirectories for a given path within a space.
 * Lightweight alternative to listDirectory() — used for tree lazy-loading.
 * Returns directory names and relative paths (no files, no metadata aggregation).
 */
export async function listSubdirectories(
  spaceName: string,
  relativePath = '',
): Promise<{ name: string; path: string }[]> {
  const { absPath } = await resolveSpace(spaceName, relativePath);

  let dirents;
  try {
    dirents = await fs.readdir(absPath, { withFileTypes: true });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      throw new NotFoundError('Directory', relativePath || '/');
    }
    throw err;
  }

  const dirs = dirents
    .filter((d) => d.isDirectory() && !d.name.startsWith('._') && d.name !== '.DS_Store')
    .map((d) => {
      const relPath = relativePath ? `${relativePath}/${d.name}` : d.name;
      return { name: d.name, path: relPath };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return dirs;
}

// ──────────────────────────────────────────────
// Move operations
// ──────────────────────────────────────────────

/**
 * Move a file or directory from one space/path to another.
 * Supports both same-space and cross-space moves.
 *
 * Uses fs.rename() for same-filesystem moves (atomic).
 * Falls back to fs.cp() + fs.rm() for cross-device (EXDEV) or cross-space-type (EPERM) moves.
 */
export async function moveEntry(
  srcSpaceName: string,
  srcRelativePath: string,
  dstSpaceName: string,
  dstRelativePath: string,
): Promise<{ sourceDeleted: boolean }> {
  if (!srcRelativePath) {
    throw new ValidationError('Cannot move the space root directory');
  }

  const { absPath: srcAbsPath } = await resolveSpace(srcSpaceName, srcRelativePath);
  const { absPath: dstDirAbsPath } = await resolveSpace(dstSpaceName, dstRelativePath || undefined);

  // Verify source exists
  try {
    await fs.stat(srcAbsPath);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      throw new NotFoundError('Source file or directory', srcRelativePath);
    }
    throw err;
  }

  // Verify destination is a directory
  try {
    const dstStat = await fs.stat(dstDirAbsPath);
    if (!dstStat.isDirectory()) {
      throw new ValidationError('Destination path is not a directory');
    }
  } catch (err: unknown) {
    if (err instanceof ValidationError) throw err;
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      throw new NotFoundError('Destination directory', dstRelativePath || '/');
    }
    throw err;
  }

  // Build final destination path: dstDir / srcFileName
  const srcFileName = path.basename(srcAbsPath);
  const dstAbsPath = path.join(dstDirAbsPath, srcFileName);

  // Prevent moving to same location
  if (srcAbsPath === dstAbsPath) {
    throw new ValidationError('Source and destination are the same');
  }

  // Check destination doesn't already exist
  try {
    await fs.stat(dstAbsPath);
    // If we get here, it exists — conflict
    throw new ValidationError(`Destination already exists: ${srcFileName}`);
  } catch (err: unknown) {
    if (err instanceof ValidationError) throw err;
    // ENOENT is expected — file doesn't exist, which is what we want
  }

  // Try atomic rename first
  let sourceDeleted = true;
  try {
    await fs.rename(srcAbsPath, dstAbsPath);
  } catch (err: unknown) {
    const errCode = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (errCode === 'EXDEV' || errCode === 'EPERM') {
      // Cross-device or cross-space-type: copy then delete
      logger.info(
        { srcSpaceName, srcRelativePath, dstSpaceName, dstRelativePath, errCode },
        'Rename failed, falling back to copy+delete',
      );
      const srcStat = await fs.stat(srcAbsPath);
      if (srcStat.isDirectory()) {
        await fs.cp(srcAbsPath, dstAbsPath, { recursive: true });
      } else {
        await fs.copyFile(srcAbsPath, dstAbsPath);
      }
      // Try to remove source — may fail if file is owned by another user
      try {
        await fs.rm(srcAbsPath, { recursive: true });
      } catch (rmErr: unknown) {
        const rmCode = rmErr && typeof rmErr === 'object' && 'code' in rmErr
          ? (rmErr as { code: string }).code : '';
        if (rmCode === 'EPERM' || rmCode === 'EACCES') {
          logger.warn(
            { srcSpaceName, srcRelativePath, rmCode },
            'File copied to destination but source could not be deleted (permission denied)',
          );
          sourceDeleted = false;
        } else {
          // Unexpected error — clean up destination and rethrow
          try { await fs.rm(dstAbsPath, { recursive: true }); } catch { /* ignore cleanup error */ }
          throw rmErr;
        }
      }
    } else {
      throw err;
    }
  }

  logger.info(
    { srcSpaceName, srcPath: srcRelativePath, dstSpaceName, dstPath: dstRelativePath, sourceDeleted },
    'Entry moved',
  );

  return { sourceDeleted };
}

// ──────────────────────────────────────────────
// ACL operations
// ──────────────────────────────────────────────

/**
 * Get ACL for a file or directory.
 */
export async function getFileAcl(
  spaceName: string,
  relativePath: string,
): Promise<IFileAcl> {
  const { absPath } = await resolveSpace(spaceName, relativePath);
  return efsCli.getPermissions(absPath, spaceName);
}

/**
 * Set ACL on a file or directory.
 */
export async function setFileAcl(
  spaceName: string,
  relativePath: string,
  acl: ISetAclRequest,
): Promise<void> {
  const { absPath } = await resolveSpace(spaceName, relativePath);

  // Convert ISetAclRequest to efs-setperms options
  const modify: string[] = [];
  if (acl.entries) {
    for (const entry of acl.entries) {
      const perms = [
        entry.admin ? 'a' : '',
        entry.read ? 'r' : '-',
        entry.write ? 'w' : '-',
        entry.execute ? 'x' : '-',
      ].join('');

      const prefix = entry.isDefault ? 'default:' : '';
      modify.push(`${prefix}${entry.type}:${entry.qualifier}:${perms}`);
    }
  }

  const ownerStr = acl.owner && acl.group ? `${acl.owner}:${acl.group}` :
    acl.owner ? `${acl.owner}:` :
    acl.group ? `:${acl.group}` :
    undefined;

  await efsCli.setPermissions(absPath, {
    modify: modify.length > 0 ? modify : undefined,
    owner: ownerStr,
    removeAll: acl.removeAll,
    removeDefault: acl.removeDefault,
    recursive: acl.recursive,
  });
}

// ──────────────────────────────────────────────
// Goal operations
// ──────────────────────────────────────────────

/**
 * Get the storage goal for a file or directory within a space.
 */
export async function getFileGoal(
  spaceName: string,
  relativePath: string,
): Promise<string> {
  const { absPath } = await resolveSpace(spaceName, relativePath);
  return efsCli.getGoal(absPath);
}

/**
 * Set the storage goal for a file or directory within a space.
 */
export async function setFileGoal(
  spaceName: string,
  relativePath: string,
  goalName: string,
  recursive = false,
): Promise<void> {
  const { absPath } = await resolveSpace(spaceName, relativePath);
  await efsCli.setGoal(goalName, [absPath], recursive);
}

// ──────────────────────────────────────────────
// CRUD operations
// ──────────────────────────────────────────────

/**
 * Create a directory within a space.
 */
export async function createDirectory(
  spaceName: string,
  relativePath: string,
  dirName: string,
): Promise<void> {
  // Validate dir name
  if (!dirName || dirName.includes('/') || dirName === '.' || dirName === '..') {
    throw new ValidationError('Invalid directory name');
  }

  const targetRelPath = relativePath ? `${relativePath}/${dirName}` : dirName;
  const { absPath } = await resolveSpace(spaceName, targetRelPath);

  try {
    await fs.mkdir(absPath, { recursive: false });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code: string }).code;
      if (code === 'EEXIST') {
        throw new ValidationError(`Directory already exists: ${dirName}`);
      }
      if (code === 'ENOENT') {
        throw new NotFoundError('Parent directory', relativePath);
      }
    }
    throw err;
  }

  logger.info({ spaceName, path: targetRelPath }, 'Directory created');
}

/**
 * Delete a file or directory within a space.
 */
export async function deleteEntry(
  spaceName: string,
  relativePath: string,
): Promise<void> {
  if (!relativePath) {
    throw new ValidationError('Cannot delete the space root directory');
  }

  const { absPath } = await resolveSpace(spaceName, relativePath);

  try {
    const stat = await fs.stat(absPath);
    if (stat.isDirectory()) {
      await fs.rm(absPath, { recursive: true });
    } else {
      await fs.unlink(absPath);
    }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      throw new NotFoundError('File or directory', relativePath);
    }
    throw err;
  }

  logger.info({ spaceName, path: relativePath }, 'Entry deleted');
}

/**
 * Rename a file or directory within a space.
 */
export async function renameEntry(
  spaceName: string,
  relativePath: string,
  newName: string,
): Promise<void> {
  if (!relativePath) {
    throw new ValidationError('Cannot rename the space root directory');
  }
  if (!newName || newName.includes('/') || newName === '.' || newName === '..') {
    throw new ValidationError('Invalid new name');
  }

  const { absPath } = await resolveSpace(spaceName, relativePath);

  // Build new path: same parent, different name
  const parentDir = path.dirname(absPath);
  const newAbsPath = path.join(parentDir, newName);

  // Validate the new path stays within mount
  const { contentRoot } = await resolveSpace(spaceName);
  if (!newAbsPath.startsWith(contentRoot)) {
    throw new PathTraversalError('New path escapes the space');
  }

  try {
    await fs.rename(absPath, newAbsPath);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code: string }).code;
      if (code === 'ENOENT') {
        throw new NotFoundError('File or directory', relativePath);
      }
      if (code === 'EEXIST' || code === 'ENOTEMPTY') {
        throw new ValidationError(`Target already exists: ${newName}`);
      }
    }
    throw err;
  }

  logger.info({ spaceName, oldPath: relativePath, newName }, 'Entry renamed');
}

/**
 * Upload a file to a space.
 */
export async function uploadFile(
  spaceName: string,
  relativePath: string,
  fileName: string,
  stream: Readable,
): Promise<void> {
  if (!fileName || fileName.includes('/') || fileName === '.' || fileName === '..') {
    throw new ValidationError('Invalid file name');
  }

  const targetRelPath = relativePath ? `${relativePath}/${fileName}` : fileName;
  const { absPath } = await resolveSpace(spaceName, targetRelPath);

  // Ensure parent exists
  const parentDir = path.dirname(absPath);
  try {
    await fs.access(parentDir);
  } catch {
    throw new NotFoundError('Upload directory', relativePath || '/');
  }

  const writeStream = createWriteStream(absPath);
  await pipeline(stream, writeStream);

  logger.info({ spaceName, path: targetRelPath }, 'File uploaded');
}

/**
 * Download a file from a space.
 * Returns a read stream and file metadata for streaming to the client.
 */
export async function downloadFile(
  spaceName: string,
  relativePath: string,
): Promise<{ stream: ReadStream; size: number; name: string }> {
  if (!relativePath) {
    throw new ValidationError('Cannot download a directory');
  }

  const { absPath } = await resolveSpace(spaceName, relativePath);

  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      throw new NotFoundError('File', relativePath);
    }
    throw err;
  }

  if (stat.isDirectory()) {
    throw new ValidationError('Cannot download a directory');
  }

  const name = path.basename(absPath);
  const stream = createReadStream(absPath);

  return { stream, size: stat.size, name };
}

// ──────────────────────────────────────────────
// Directory info
// ──────────────────────────────────────────────

/**
 * Get directory usage info for a path within a space.
 */
export async function getDirInfo(
  spaceName: string,
  relativePath = '',
): Promise<IDirInfo> {
  const { absPath } = await resolveSpace(spaceName, relativePath);
  return efsCli.getDirInfo(absPath);
}

/**
 * Get file chunk info for a file within a space.
 */
export async function getFileChunkInfo(
  spaceName: string,
  relativePath: string,
): Promise<IFileChunkInfo> {
  const { absPath } = await resolveSpace(spaceName, relativePath);
  return efsCli.getFileInfo(absPath);
}
