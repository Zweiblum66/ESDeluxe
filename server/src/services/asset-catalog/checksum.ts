import { createHash } from 'crypto';
import { open } from 'fs/promises';
import { logger } from '../../utils/logger.js';

const CHUNK_SIZE = 1024 * 1024; // 1 MB

/**
 * Compute a partial checksum for fast file identification.
 *
 * Strategy: SHA-256 hash of first 1MB + last 1MB + file size.
 * For files <= 2MB, the entire file content is hashed.
 *
 * Format: "partial-sha256:<hex>:<filesize>"
 *
 * This is fast even for multi-GB media files while still providing
 * strong identification (collision probability is negligible for
 * media files that differ in their headers or trailers).
 */
export async function computePartialChecksum(
  absPath: string,
  fileSize: number,
): Promise<string> {
  const hash = createHash('sha256');

  const fd = await open(absPath, 'r');
  try {
    if (fileSize <= CHUNK_SIZE * 2) {
      // Small file: hash the entire content
      const buf = Buffer.alloc(fileSize);
      await fd.read(buf, 0, fileSize, 0);
      hash.update(buf);
    } else {
      // Large file: hash first 1MB + last 1MB
      const headBuf = Buffer.alloc(CHUNK_SIZE);
      await fd.read(headBuf, 0, CHUNK_SIZE, 0);
      hash.update(headBuf);

      const tailBuf = Buffer.alloc(CHUNK_SIZE);
      await fd.read(tailBuf, 0, CHUNK_SIZE, fileSize - CHUNK_SIZE);
      hash.update(tailBuf);
    }

    // Include file size in the hash input for extra uniqueness
    hash.update(`:${fileSize}`);

    return `partial-sha256:${hash.digest('hex')}:${fileSize}`;
  } catch (err) {
    logger.warn({ err, path: absPath }, 'Failed to compute partial checksum');
    throw err;
  } finally {
    await fd.close();
  }
}
