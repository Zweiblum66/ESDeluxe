import { execEfsCommand } from './executor.js';
import type {
  IEfsAclEntry,
  IFileAcl,
  IDirInfo,
  IFileChunkInfo,
  IFileEntry,
  AclEntryType,
} from '../../../../shared/types/filesystem.js';
import type { IStorageGoal } from '../../../../shared/types/goals.js';

// ──────────────────────────────────────────────
// Permissions (efs-getperms / efs-setperms)
// ──────────────────────────────────────────────

/**
 * Parses efs-getperms output into a structured ACL object.
 *
 * Example output:
 *   # file: /efs/efs_1/Unmanaged/footage_1/Content
 *   # type: d
 *   # owner: editshare
 *   # group: footage
 *   user::-rwx
 *   group:groupname:-r-x
 *   flags::---g-
 *   mask::-rwx
 *   default:user::-rwx
 *   default:group:groupname:-rwx
 */
function parsePermsOutput(stdout: string, spaceName: string): IFileAcl {
  const lines = stdout.trim().split('\n');

  let filePath = '';
  let fileType: 'f' | 'd' = 'f';
  let owner = '';
  let group = '';
  let flags = '';
  let mask = '';
  const entries: IEfsAclEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('# file:')) {
      filePath = trimmed.slice(8).trim();
    } else if (trimmed.startsWith('# type:')) {
      fileType = trimmed.slice(8).trim() as 'f' | 'd';
    } else if (trimmed.startsWith('# owner:')) {
      owner = trimmed.slice(9).trim();
    } else if (trimmed.startsWith('# group:')) {
      group = trimmed.slice(9).trim();
    } else if (trimmed !== '' && !trimmed.startsWith('#')) {
      // Parse ACL entry: [default:]type:qualifier:permissions
      const isDefault = trimmed.startsWith('default:');
      const rest = isDefault ? trimmed.slice(8) : trimmed;

      // Split into type:qualifier:perms
      const parts = rest.split(':');
      if (parts.length < 3) continue;

      const entryType = parts[0] as AclEntryType;
      const qualifier = parts[1];
      const perms = parts[2];

      if (entryType === 'flags') {
        flags = isDefault ? flags : perms;
        continue;
      }
      if (entryType === 'mask') {
        mask = isDefault ? mask : perms;
        continue;
      }

      entries.push({
        type: entryType,
        qualifier,
        read: perms.includes('r'),
        write: perms.includes('w'),
        execute: perms.includes('x'),
        admin: perms.includes('a'),
        isDefault,
      });
    }
  }

  return { path: filePath, spaceName, fileType, owner, group, entries, flags, mask };
}

/**
 * Get permissions/ACL for a file or directory.
 * Calls: efs-getperms <path>
 */
export async function getPermissions(absPath: string, spaceName: string): Promise<IFileAcl> {
  const stdout = await execEfsCommand('efs-getperms', [absPath]);
  return parsePermsOutput(stdout, spaceName);
}

/**
 * Set permissions/ACL on a file or directory.
 * Calls: efs-setperms [options] <path>
 */
export async function setPermissions(
  absPath: string,
  options: {
    modify?: string[];
    remove?: string[];
    owner?: string;
    removeAll?: boolean;
    removeDefault?: boolean;
    recursive?: boolean;
  },
): Promise<void> {
  const args: string[] = [];

  if (options.recursive) {
    args.push('-r');
  }
  if (options.owner) {
    args.push('-o', options.owner);
  }
  if (options.removeAll) {
    args.push('-b');
  }
  if (options.removeDefault) {
    args.push('-k');
  }
  if (options.modify) {
    for (const acl of options.modify) {
      args.push('-m', acl);
    }
  }
  if (options.remove) {
    for (const spec of options.remove) {
      args.push('-x', spec);
    }
  }

  args.push(absPath);

  const timeout = options.recursive ? 120_000 : 30_000;
  await execEfsCommand('efs-setperms', args, { timeout });
}

// ──────────────────────────────────────────────
// Directory info (efs-dirinfo)
// ──────────────────────────────────────────────

/**
 * Get directory usage information.
 * Calls: efs-dirinfo <path>
 */
export async function getDirInfo(absPath: string): Promise<IDirInfo> {
  const stdout = await execEfsCommand('efs-dirinfo', [absPath]);
  const lines = stdout.trim().split('\n');

  const result: IDirInfo = {
    inodes: 0,
    directories: 0,
    files: 0,
    objectStorageStubs: 0,
    chunks: 0,
    length: 0,
    size: 0,
    objectStorageLength: 0,
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(.+?):\s+(\d+)/);
    if (!match) continue;

    const key = match[1].trim().toLowerCase();
    const value = parseInt(match[2], 10);

    if (key === 'inodes') result.inodes = value;
    else if (key === 'directories') result.directories = value;
    else if (key === 'files') result.files = value;
    else if (key === 'object storage stubs') result.objectStorageStubs = value;
    else if (key === 'chunks') result.chunks = value;
    else if (key === 'length') result.length = value;
    else if (key === 'size') result.size = value;
    else if (key === 'object storage length') result.objectStorageLength = value;
  }

  return result;
}

// ──────────────────────────────────────────────
// Quota (efs-repquota / efs-setquota)
// ──────────────────────────────────────────────

/**
 * Get quota report. May require elevated permissions.
 * Returns raw output.
 */
export async function getQuota(mountPoint: string): Promise<string> {
  return execEfsCommand('efs-repquota', ['-a', '-n', mountPoint]);
}

/**
 * Set quota for a user/group/project.
 */
export async function setQuota(
  mountPoint: string,
  quotaType: 'user' | 'group' | 'project',
  name: string,
  softLimit: number,
  hardLimit: number,
): Promise<void> {
  const flag = quotaType === 'user' ? '-u' : quotaType === 'group' ? '-g' : '-p';
  await execEfsCommand('efs-setquota', [flag, name, String(softLimit), String(hardLimit), mountPoint]);
}

// ──────────────────────────────────────────────
// Goals (efs-getgoal / efs-setgoal / efs-admin)
// ──────────────────────────────────────────────

/**
 * Get the storage goal for a file or directory.
 * Calls: efs-getgoal <path>
 * Output format: "/efs/.../path: goal_name"
 */
export async function getGoal(absPath: string): Promise<string> {
  const stdout = await execEfsCommand('efs-getgoal', [absPath], { sudo: true });
  const lastColon = stdout.lastIndexOf(':');
  if (lastColon === -1) return stdout.trim();
  return stdout.slice(lastColon + 1).trim();
}

/**
 * Set the storage goal for file(s) or directory(ies).
 * Calls: efs-setgoal [-r] <goalname> <path> [path...]
 * NOTE: goal name comes BEFORE path(s)
 */
export async function setGoal(
  goalName: string,
  paths: string[],
  recursive = false,
): Promise<void> {
  const args: string[] = [];
  if (recursive) {
    args.push('-r');
  }
  args.push(goalName, ...paths);

  const timeout = recursive ? 120_000 : 30_000;
  await execEfsCommand('efs-setgoal', args, { timeout, sudo: true });
}

/**
 * List all available storage goals.
 * Calls: efs-admin list-goals
 */
export async function listGoals(): Promise<IStorageGoal[]> {
  const stdout = await execEfsCommand('efs-admin', ['list-goals']);
  const lines = stdout.trim().split('\n');

  const goals: IStorageGoal[] = [];
  let headersPassed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Goal definitions')) continue;

    if (trimmed.startsWith('Id')) {
      headersPassed = true;
      continue;
    }
    if (!headersPassed) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;

    const id = parseInt(parts[0], 10);
    if (isNaN(id)) continue;

    const name = parts[1];
    const isUsed = trimmed.includes('*');
    const definition = parts[parts.length - 1];

    goals.push({ id, name, isUsed, writeable: true, definition });
  }

  return goals;
}

// ──────────────────────────────────────────────
// File info (efs-fileinfo)
// ──────────────────────────────────────────────

/**
 * Get chunk/storage information for a file.
 * Calls: efs-fileinfo <path>
 */
export async function getFileInfo(absPath: string): Promise<IFileChunkInfo> {
  const stdout = await execEfsCommand('efs-fileinfo', [absPath]);
  const lines = stdout.trim().split('\n');

  const result: IFileChunkInfo = { path: absPath, chunks: [] };
  let currentChunk: IFileChunkInfo['chunks'][0] | null = null;

  for (const line of lines) {
    if (line.endsWith(':') && !line.includes('chunk') && !line.includes('copy')) continue;

    const chunkMatch = line.match(/chunk\s+(\d+):\s+(\S+)/);
    if (chunkMatch) {
      currentChunk = {
        index: parseInt(chunkMatch[1], 10),
        id: chunkMatch[2],
        copies: [],
      };
      result.chunks.push(currentChunk);
      continue;
    }

    const copyMatch = line.match(/copy\s+(\d+):\s+(.+)/);
    if (copyMatch && currentChunk) {
      currentChunk.copies.push({
        copyNumber: parseInt(copyMatch[1], 10),
        location: copyMatch[2].trim(),
      });
    }
  }

  return result;
}

// ──────────────────────────────────────────────
// File listing (efs-find)
// ──────────────────────────────────────────────

/** Raw entry from efs-find --format=ndjson */
interface EfsFindEntry {
  atime: number;
  ctime: number;
  mtime: number;
  gid: string;
  uid: string;
  inode: number;
  mode: number;
  nlink: number;
  path: string;
  size: number;
  type: 'file' | 'dir';
}

/**
 * List files and directories using efs-find.
 * Calls: efs-find --format=ndjson <path>
 * Returns all entries recursively. Caller can filter to direct children.
 *
 * @param absPath - Absolute validated path to search
 * @param contentRootPath - The Content root path, used to compute relative paths
 */
export async function findEntries(
  absPath: string,
  contentRootPath: string,
): Promise<IFileEntry[]> {
  const stdout = await execEfsCommand('efs-find', ['--format=ndjson', absPath], {
    timeout: 60_000,
  });

  const entries: IFileEntry[] = [];

  for (const line of stdout.trim().split('\n')) {
    if (!line.trim()) continue;

    let entry: EfsFindEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    // Compute relative path from Content root
    let relativePath = entry.path;
    if (relativePath.startsWith(contentRootPath)) {
      relativePath = relativePath.slice(contentRootPath.length);
      if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
    }

    const name = entry.path.split('/').pop() || '';

    entries.push({
      name,
      path: relativePath,
      type: entry.type === 'dir' ? 'directory' : 'file',
      size: entry.size,
      mtime: entry.mtime,
      atime: entry.atime,
      ctime: entry.ctime,
      owner: entry.uid,
      group: entry.gid,
      mode: entry.mode,
      inode: entry.inode,
      nlink: entry.nlink,
    });
  }

  return entries;
}

// ──────────────────────────────────────────────
// Other utilities
// ──────────────────────────────────────────────

export async function listMounts(): Promise<string> {
  return execEfsCommand('efs-admin', ['list-mounts']);
}

export async function getQosUsage(): Promise<string> {
  return execEfsCommand('efs-admin', ['qos-usage']);
}
