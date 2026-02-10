import { createReadStream, createWriteStream } from 'fs';
import { stat, mkdir, unlink, readdir, rmdir, copyFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { logger } from '../../utils/logger.js';
import type { IArchiveBackend, IStoreResult, IValidateResult } from './archive-backend.interface.js';
import type { ILocalArchiveConfig } from '../../../../shared/types/archive.js';

/**
 * Local/NAS filesystem archive backend.
 * Stores archived files in a directory tree mirroring the original space/path structure.
 */
export class LocalArchiveBackend implements IArchiveBackend {
  private readonly basePath: string;

  constructor(config: ILocalArchiveConfig) {
    this.basePath = config.basePath;
  }

  async store(srcAbsPath: string, archiveRelPath: string): Promise<IStoreResult> {
    const destPath = join(this.basePath, archiveRelPath);

    // Ensure destination directory exists
    await mkdir(dirname(destPath), { recursive: true });

    // Compute SHA-256 checksum while copying
    const checksum = await this.copyWithChecksum(srcAbsPath, destPath);

    // Get file size from the written file
    const destStat = await stat(destPath);

    logger.debug({ src: srcAbsPath, dest: destPath, size: destStat.size }, 'File stored in local archive');

    return {
      size: destStat.size,
      checksum,
    };
  }

  async retrieve(archiveRelPath: string, destAbsPath: string): Promise<void> {
    const srcPath = join(this.basePath, archiveRelPath);

    // Ensure destination directory exists
    await mkdir(dirname(destAbsPath), { recursive: true });

    // Copy from archive to destination
    await copyFile(srcPath, destAbsPath);

    logger.debug({ src: srcPath, dest: destAbsPath }, 'File retrieved from local archive');
  }

  async delete(archiveRelPath: string): Promise<void> {
    const filePath = join(this.basePath, archiveRelPath);

    try {
      await unlink(filePath);
      logger.debug({ path: filePath }, 'File deleted from local archive');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn({ path: filePath }, 'File not found in archive during delete (already gone)');
        return;
      }
      throw err;
    }

    // Clean up empty parent directories up to basePath
    await this.cleanEmptyParents(dirname(filePath));
  }

  async exists(archiveRelPath: string): Promise<boolean> {
    const filePath = join(this.basePath, archiveRelPath);
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getStats(): Promise<{ totalSize: number; fileCount: number }> {
    try {
      return await this.walkDir(this.basePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { totalSize: 0, fileCount: 0 };
      }
      throw err;
    }
  }

  async validate(): Promise<IValidateResult> {
    try {
      // Check base path exists or can be created
      await mkdir(this.basePath, { recursive: true });

      // Write a test file to verify write access
      const testFile = join(this.basePath, '.es-archive-test');
      await writeFile(testFile, 'archive-validation-test');
      await unlink(testFile);

      return { ok: true, message: `Local archive path is accessible and writable: ${this.basePath}` };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EACCES') {
        return { ok: false, message: `Permission denied writing to ${this.basePath}. If this is an SMB share, check that the SMB user has read/write permissions on the share.` };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Archive path validation failed: ${msg}` };
    }
  }

  // ── Private helpers ────────────────────────────

  /**
   * Copy a file and compute SHA-256 checksum in a single pass.
   */
  private async copyWithChecksum(srcPath: string, destPath: string): Promise<string> {
    const hash = createHash('sha256');
    const readStream = createReadStream(srcPath);
    const writeStream = createWriteStream(destPath);

    // Pipe through hash and to destination simultaneously
    return new Promise<string>((resolve, reject) => {
      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', () => resolve(hash.digest('hex')));

      readStream.on('data', (chunk: Buffer | string) => {
        hash.update(chunk);
      });

      readStream.pipe(writeStream);
    });
  }

  /**
   * Remove empty directories up to basePath.
   */
  private async cleanEmptyParents(dirPath: string): Promise<void> {
    // Don't go above basePath
    if (!dirPath.startsWith(this.basePath) || dirPath === this.basePath) {
      return;
    }

    try {
      const entries = await readdir(dirPath);
      if (entries.length === 0) {
        await rmdir(dirPath);
        logger.debug({ dir: dirPath }, 'Removed empty archive directory');
        await this.cleanEmptyParents(dirname(dirPath));
      }
    } catch {
      // Ignore errors during cleanup
    }
  }

  /**
   * Recursively walk a directory and sum file sizes and counts.
   */
  private async walkDir(dirPath: string): Promise<{ totalSize: number; fileCount: number }> {
    let totalSize = 0;
    let fileCount = 0;

    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isFile()) {
        const fileStat = await stat(fullPath);
        totalSize += fileStat.size;
        fileCount += 1;
      } else if (entry.isDirectory()) {
        const sub = await this.walkDir(fullPath);
        totalSize += sub.totalSize;
        fileCount += sub.fileCount;
      }
    }

    return { totalSize, fileCount };
  }
}
