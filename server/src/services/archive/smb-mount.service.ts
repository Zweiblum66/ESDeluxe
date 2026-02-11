import { execFile } from 'child_process';
import { writeFile, unlink, mkdir, rmdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { tmpdir, homedir } from 'os';
import { logger } from '../../utils/logger.js';
import * as archiveStore from './archive.store.js';
import type { ISmbArchiveConfig } from '../../../../shared/types/archive.js';

/**
 * Base directory for auto-managed SMB mount points.
 * Uses the service user's home directory for easy access.
 * mount/umount run via sudo (editshare already has NOPASSWD
 * for /bin/mount and /bin/umount in sudoers).
 */
const MOUNT_BASE = join(homedir(), 'es-archive-mounts');

/**
 * Compute a deterministic mount point path for a given location name.
 */
export function getMountPoint(locationName: string): string {
  const sanitized = locationName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return join(MOUNT_BASE, sanitized || 'smb');
}

/**
 * Execute a command and return stdout.
 */
function execCommand(command: string, args: string[], timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    logger.debug({ command, args }, `Executing: ${command} ${args.join(' ')}`);

    execFile(command, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr?.trim() || error.message;
        logger.error({ command, args, stderr: message }, `Command failed: ${command}`);
        reject(new Error(message));
        return;
      }
      if (stderr?.trim()) {
        logger.warn({ command, stderr: stderr.trim() }, 'Command produced stderr');
      }
      resolve(stdout);
    });
  });
}

/**
 * Check whether a path is currently a mount point.
 */
export async function isMounted(mountPoint: string): Promise<boolean> {
  try {
    await execCommand('mountpoint', ['-q', mountPoint], 5_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mount an SMB/CIFS share via sudo mount -t cifs.
 * The editshare user has NOPASSWD sudo for /bin/mount in sudoers.
 * Credentials are passed via a temporary file (not on the command line).
 */
export async function mountSmb(config: ISmbArchiveConfig, mountPoint: string): Promise<void> {
  // Create mount point directory
  await mkdir(mountPoint, { recursive: true });

  // Write temporary credentials file
  const credFileName = `es-smb-${randomBytes(8).toString('hex')}`;
  const credFilePath = join(tmpdir(), credFileName);

  let credContent = `username=${config.username}\npassword=${config.password}\n`;
  if (config.domain) {
    credContent += `domain=${config.domain}\n`;
  }

  try {
    await writeFile(credFilePath, credContent, { mode: 0o600 });

    // Build mount options — include uid/gid so the mounted files
    // are owned by the current (editshare) user, ensuring read/write access
    const uid = process.getuid?.() ?? 501;
    const gid = process.getgid?.() ?? 501;
    const opts = [`credentials=${credFilePath}`, `uid=${uid}`, `gid=${gid}`, 'file_mode=0664', 'dir_mode=0775'];
    if (config.mountOptions) {
      opts.push(config.mountOptions);
    }

    // Use sudo mount (editshare has NOPASSWD for /bin/mount)
    await execCommand('sudo', [
      'mount', '-t', 'cifs',
      config.sharePath,
      mountPoint,
      '-o', opts.join(','),
    ], 30_000);

    logger.info({ sharePath: config.sharePath, mountPoint }, 'SMB share mounted successfully');
  } catch (err) {
    // Clean up empty mount point on failure
    try { await rmdir(mountPoint); } catch { /* ignore */ }
    throw new Error(`Failed to mount SMB share: ${(err as Error).message}`);
  } finally {
    // Always clean up the credentials file
    try {
      await unlink(credFilePath);
    } catch {
      logger.warn({ credFilePath }, 'Failed to clean up temporary credentials file');
    }
  }
}

/**
 * Unmount an SMB share.
 */
export async function unmountSmb(mountPoint: string): Promise<void> {
  if (!await isMounted(mountPoint)) {
    logger.debug({ mountPoint }, 'Mount point is not mounted, skipping unmount');
    return;
  }

  try {
    await execCommand('sudo', ['umount', mountPoint], 15_000);
    logger.info({ mountPoint }, 'SMB share unmounted');
  } catch (err) {
    logger.warn({ mountPoint, err }, 'Failed to unmount SMB share');
    throw err;
  }
}

/**
 * Ensure an SMB share is mounted. If already mounted, does nothing.
 */
export async function ensureMounted(config: ISmbArchiveConfig, mountPoint: string): Promise<void> {
  if (await isMounted(mountPoint)) {
    return;
  }
  await mountSmb(config, mountPoint);
}

/**
 * Remount all enabled SMB archive locations.
 * Called on server startup. Non-fatal — logs warnings on failure.
 */
export async function remountAllSmbLocations(): Promise<void> {
  const locations = archiveStore.listLocations();
  const smbLocations = locations.filter((l) => l.type === 'smb' && l.enabled);

  if (smbLocations.length === 0) {
    logger.debug('No SMB archive locations to remount');
    return;
  }

  // Ensure base directory exists
  await mkdir(MOUNT_BASE, { recursive: true });

  logger.info({ count: smbLocations.length }, 'Remounting SMB archive locations...');

  for (const location of smbLocations) {
    const smbConfig = location.config as ISmbArchiveConfig;
    const mountPoint = smbConfig.mountPoint || getMountPoint(location.name);

    try {
      await ensureMounted(smbConfig, mountPoint);
      logger.info({ name: location.name, mountPoint }, 'SMB location remounted');
    } catch (err) {
      logger.warn(
        { name: location.name, mountPoint, err },
        `Failed to remount SMB location "${location.name}" — it will be unavailable until manually re-tested`,
      );
    }
  }
}

/**
 * Unmount all SMB archive locations.
 * Called on graceful shutdown.
 */
export async function unmountAllSmbLocations(): Promise<void> {
  const locations = archiveStore.listLocations();
  const smbLocations = locations.filter((l) => l.type === 'smb');

  for (const location of smbLocations) {
    const smbConfig = location.config as ISmbArchiveConfig;
    const mountPoint = smbConfig.mountPoint || getMountPoint(location.name);

    try {
      await unmountSmb(mountPoint);
    } catch (err) {
      logger.warn({ name: location.name, mountPoint, err }, 'Failed to unmount SMB share during shutdown');
    }
  }
}
