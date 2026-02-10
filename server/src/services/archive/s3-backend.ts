import { createReadStream, createWriteStream } from 'fs';
import { stat, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
  S3Client,
  HeadBucketCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { logger } from '../../utils/logger.js';
import type { IArchiveBackend, IStoreResult, IValidateResult } from './archive-backend.interface.js';
import type { IS3ArchiveConfig } from '../../../../shared/types/archive.js';

/**
 * S3-compatible archive backend.
 * Stores archived files as objects in an S3 bucket.
 * Supports AWS S3, Minio, Wasabi, Backblaze B2, DigitalOcean Spaces, etc.
 */
export class S3ArchiveBackend implements IArchiveBackend {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(config: IS3ArchiveConfig) {
    this.bucket = config.bucket;
    this.prefix = config.prefix || '';

    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    };

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = true; // Required for most S3-compatible services
    }

    this.client = new S3Client(clientConfig);
  }

  async store(srcAbsPath: string, archiveRelPath: string): Promise<IStoreResult> {
    const key = this.buildKey(archiveRelPath);
    const hash = createHash('sha256');
    const readStream = createReadStream(srcAbsPath);

    // Feed data through hash as it streams
    readStream.on('data', (chunk: Buffer | string) => {
      hash.update(chunk);
    });

    // Use managed Upload for automatic multipart handling on large files
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: readStream,
      },
      partSize: 64 * 1024 * 1024, // 64 MB parts
      queueSize: 4,
    });

    await upload.done();

    const srcStat = await stat(srcAbsPath);
    const checksum = hash.digest('hex');

    logger.debug({ key, bucket: this.bucket, size: srcStat.size }, 'File stored in S3 archive');

    return {
      size: srcStat.size,
      checksum,
    };
  }

  async retrieve(archiveRelPath: string, destAbsPath: string): Promise<void> {
    const key = this.buildKey(archiveRelPath);

    // Ensure destination directory exists
    await mkdir(dirname(destAbsPath), { recursive: true });

    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!response.Body) {
      throw new Error(`Empty response body for S3 object: ${key}`);
    }

    const writeStream = createWriteStream(destAbsPath);

    // Body is a Readable stream in Node.js
    await pipeline(response.Body as Readable, writeStream);

    logger.debug({ key, bucket: this.bucket, dest: destAbsPath }, 'File retrieved from S3 archive');
  }

  async delete(archiveRelPath: string): Promise<void> {
    const key = this.buildKey(archiveRelPath);

    // S3 DeleteObject is idempotent — no error if object doesn't exist
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    logger.debug({ key, bucket: this.bucket }, 'File deleted from S3 archive');
  }

  async exists(archiveRelPath: string): Promise<boolean> {
    const key = this.buildKey(archiveRelPath);

    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err: unknown) {
      const name = (err as { name?: string }).name;
      if (name === 'NotFound' || name === 'NoSuchKey' || name === '404') {
        return false;
      }
      throw err;
    }
  }

  async getStats(): Promise<{ totalSize: number; fileCount: number }> {
    let totalSize = 0;
    let fileCount = 0;
    let continuationToken: string | undefined;

    const prefix = this.prefix ? this.prefix + '/' : undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          totalSize += obj.Size || 0;
          fileCount += 1;
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return { totalSize, fileCount };
  }

  async validate(): Promise<IValidateResult> {
    try {
      // Step 1: Verify bucket exists and credentials have access
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));

      // Step 2: Write a test object
      const testKey = this.buildKey('.es-archive-test');
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: testKey,
          Body: 'archive-validation-test',
        }),
      );

      // Step 3: Clean up test object
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: testKey }),
      );

      const location = this.prefix
        ? `s3://${this.bucket}/${this.prefix}`
        : `s3://${this.bucket}`;

      return { ok: true, message: `S3 bucket is accessible and writable: ${location}` };
    } catch (err: unknown) {
      const name = (err as { name?: string }).name;
      const message = err instanceof Error ? err.message : String(err);

      if (name === 'NoSuchBucket') {
        return { ok: false, message: `Bucket '${this.bucket}' does not exist` };
      }
      if (name === 'AccessDenied' || name === 'Forbidden' || name === '403') {
        return { ok: false, message: `Access denied to bucket '${this.bucket}'. Check your credentials and bucket policy.` };
      }
      if (name === 'InvalidAccessKeyId') {
        return { ok: false, message: `Invalid Access Key ID. Check your credentials.` };
      }
      if (name === 'SignatureDoesNotMatch') {
        return { ok: false, message: `Invalid Secret Access Key. Check your credentials.` };
      }

      return { ok: false, message: `S3 validation failed: ${message}` };
    }
  }

  // ── Private helpers ────────────────────────────

  /**
   * Build the full S3 object key from a relative archive path.
   */
  private buildKey(archiveRelPath: string): string {
    const parts = this.prefix
      ? `${this.prefix}/${archiveRelPath}`
      : archiveRelPath;
    // Strip any leading slash
    return parts.replace(/^\/+/, '');
  }
}
