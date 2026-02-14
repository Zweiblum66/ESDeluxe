import { getDatabase } from '../../db/index.js';
import { resolveSpacePath } from '../../utils/path-security.js';
import { getSpaceInfo } from '../filesystem.service.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import * as catalogStore from './asset-catalog.store.js';
import type {
  ICatalogJob,
  ICatalogJobStats,
  CatalogJobStatus,
  CatalogJobType,
  AssetType,
  ProxyStatus,
  IAssetMetadata,
} from '../../../../shared/types/asset-catalog.js';

// ──────────────────────────────────────────────
// Row Interface
// ──────────────────────────────────────────────

interface JobRow {
  id: number;
  asset_id: number;
  space_name: string;
  primary_file_path: string;
  asset_type: string;
  job_type: string;
  status: string;
  worker_id: string | null;
  stage: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  claimed_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

// ──────────────────────────────────────────────
// Row Mapper
// ──────────────────────────────────────────────

function rowToJob(row: JobRow): ICatalogJob {
  return {
    id: row.id,
    assetId: row.asset_id,
    spaceName: row.space_name,
    primaryFilePath: row.primary_file_path,
    assetType: row.asset_type as AssetType,
    jobType: row.job_type as CatalogJobType,
    status: row.status as CatalogJobStatus,
    workerId: row.worker_id || undefined,
    stage: row.stage || undefined,
    errorMessage: row.error_message || undefined,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    claimedAt: row.claimed_at || undefined,
    completedAt: row.completed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ──────────────────────────────────────────────
// Job CRUD
// ──────────────────────────────────────────────

export function createJob(
  assetId: number,
  spaceName: string,
  primaryFilePath: string,
  assetType: AssetType,
  jobType: CatalogJobType = 'full',
): ICatalogJob {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO catalog_jobs (asset_id, space_name, primary_file_path, asset_type, job_type)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(assetId, spaceName, primaryFilePath, assetType, jobType);
  const jobId = Number(result.lastInsertRowid);

  // Mark the asset as queued for proxy generation
  catalogStore.updateAsset(assetId, { proxyStatus: 'queued' as ProxyStatus });

  return getJob(jobId)!;
}

export function getJob(id: number): ICatalogJob | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT * FROM catalog_jobs WHERE id = ?`).get(id) as JobRow | undefined;
  return row ? rowToJob(row) : null;
}

/**
 * Claim the next pending job for a worker.
 * Returns the job claim with contentRoot + catalogDataPath, or null if no work.
 */
export async function claimNextJob(workerId: string): Promise<{
  job: ICatalogJob;
  contentRoot: string;
  catalogDataPath: string;
} | null> {
  const db = getDatabase();

  // Atomically claim the next pending job
  const row = db.prepare(`
    UPDATE catalog_jobs
    SET status = 'claimed',
        worker_id = ?,
        claimed_at = unixepoch(),
        attempts = attempts + 1,
        updated_at = unixepoch()
    WHERE id = (
      SELECT id FROM catalog_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
    )
    RETURNING *
  `).get(workerId) as JobRow | undefined;

  if (!row) return null;

  const job = rowToJob(row);

  // Resolve the space content root for the worker
  try {
    const space = await getSpaceInfo(job.spaceName);
    const contentRoot = resolveSpacePath(job.spaceName, space.type);

    // Update asset proxy status to 'generating'
    catalogStore.updateAsset(job.assetId, { proxyStatus: 'generating' as ProxyStatus });

    return {
      job,
      contentRoot,
      catalogDataPath: config.CATALOG_DATA_PATH,
    };
  } catch (err) {
    // If we can't resolve the space, fail the job immediately
    logger.error({ err, jobId: job.id, spaceName: job.spaceName }, 'Failed to resolve space for job');
    db.prepare(`
      UPDATE catalog_jobs
      SET status = 'failed',
          error_message = ?,
          completed_at = unixepoch(),
          updated_at = unixepoch()
      WHERE id = ?
    `).run(`Failed to resolve space: ${(err as Error).message}`, job.id);

    catalogStore.updateAsset(job.assetId, { proxyStatus: 'failed' as ProxyStatus });
    return null;
  }
}

/**
 * Update job progress stage.
 */
export function updateJobProgress(jobId: number, workerId: string, stage?: string): boolean {
  const db = getDatabase();
  const result = db.prepare(`
    UPDATE catalog_jobs
    SET status = 'processing',
        stage = ?,
        updated_at = unixepoch()
    WHERE id = ? AND worker_id = ?
  `).run(stage || null, jobId, workerId);
  return result.changes > 0;
}

/**
 * Complete a job and update the associated asset with proxy results.
 */
export function completeJob(
  jobId: number,
  workerId: string,
  result: {
    metadata?: IAssetMetadata;
    thumbnailPath?: string;
    proxyPath?: string;
    proxyStatus?: string;
  },
): boolean {
  const db = getDatabase();

  // Update job status
  const jobResult = db.prepare(`
    UPDATE catalog_jobs
    SET status = 'completed',
        completed_at = unixepoch(),
        updated_at = unixepoch()
    WHERE id = ? AND worker_id = ?
  `).run(jobId, workerId);

  if (jobResult.changes === 0) return false;

  // Get the job to find the asset
  const job = getJob(jobId);
  if (!job) return false;

  // Update the asset with results
  const assetUpdate: {
    thumbnailPath?: string | null;
    proxyPath?: string | null;
    proxyStatus?: ProxyStatus;
    metadata?: IAssetMetadata | null;
  } = {};

  if (result.thumbnailPath !== undefined) assetUpdate.thumbnailPath = result.thumbnailPath || null;
  if (result.proxyPath !== undefined) assetUpdate.proxyPath = result.proxyPath || null;
  if (result.proxyStatus !== undefined) assetUpdate.proxyStatus = result.proxyStatus as ProxyStatus;
  if (result.metadata !== undefined) {
    // Merge with existing metadata
    const existing = catalogStore.getAsset(job.assetId);
    assetUpdate.metadata = { ...existing?.metadata, ...result.metadata };
  }

  catalogStore.updateAsset(job.assetId, assetUpdate);

  logger.info(
    { jobId, assetId: job.assetId, proxyStatus: result.proxyStatus },
    'Job completed, asset updated',
  );

  return true;
}

/**
 * Fail a job. Re-queues if under max attempts.
 */
export function failJob(jobId: number, workerId: string, error: string): boolean {
  const db = getDatabase();

  const job = getJob(jobId);
  if (!job) return false;

  if (job.attempts < job.maxAttempts) {
    // Re-queue for retry
    db.prepare(`
      UPDATE catalog_jobs
      SET status = 'pending',
          worker_id = NULL,
          stage = NULL,
          error_message = ?,
          claimed_at = NULL,
          updated_at = unixepoch()
      WHERE id = ? AND worker_id = ?
    `).run(error, jobId, workerId);

    // Reset asset status to queued
    catalogStore.updateAsset(job.assetId, { proxyStatus: 'queued' as ProxyStatus });

    logger.warn(
      { jobId, assetId: job.assetId, attempts: job.attempts, maxAttempts: job.maxAttempts },
      'Job failed, re-queued for retry',
    );
  } else {
    // Max attempts reached — mark as permanently failed
    db.prepare(`
      UPDATE catalog_jobs
      SET status = 'failed',
          error_message = ?,
          completed_at = unixepoch(),
          updated_at = unixepoch()
      WHERE id = ? AND worker_id = ?
    `).run(error, jobId, workerId);

    catalogStore.updateAsset(job.assetId, { proxyStatus: 'failed' as ProxyStatus });

    logger.error(
      { jobId, assetId: job.assetId, error, attempts: job.attempts },
      'Job permanently failed after max attempts',
    );
  }

  return true;
}

/**
 * Heartbeat — update timestamp to prevent stale expiry.
 */
export function heartbeatJob(jobId: number, workerId: string): boolean {
  const db = getDatabase();
  const result = db.prepare(`
    UPDATE catalog_jobs
    SET updated_at = unixepoch()
    WHERE id = ? AND worker_id = ? AND status IN ('claimed', 'processing')
  `).run(jobId, workerId);
  return result.changes > 0;
}

// ──────────────────────────────────────────────
// Stats & Queries
// ──────────────────────────────────────────────

export function getJobStats(): ICatalogJobStats {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM catalog_jobs
    GROUP BY status
  `).all() as { status: string; count: number }[];

  const stats: ICatalogJobStats = { pending: 0, claimed: 0, processing: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    if (row.status in stats) {
      stats[row.status as keyof ICatalogJobStats] = row.count;
    }
  }
  return stats;
}

export function getPendingJobCount(): number {
  const db = getDatabase();
  const { count } = db.prepare(
    `SELECT COUNT(*) as count FROM catalog_jobs WHERE status = 'pending'`,
  ).get() as { count: number };
  return count;
}

export function getJobsByAsset(assetId: number): ICatalogJob[] {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT * FROM catalog_jobs WHERE asset_id = ? ORDER BY created_at DESC`,
  ).all(assetId) as JobRow[];
  return rows.map(rowToJob);
}

// ──────────────────────────────────────────────
// Stale Job Expiry
// ──────────────────────────────────────────────

/**
 * Expire claimed/processing jobs that haven't been updated within timeoutSeconds.
 * Resets them to pending for re-claiming (if under max attempts), or fails them.
 */
export function expireStaleJobs(timeoutSeconds: number): number {
  const db = getDatabase();
  const cutoff = Math.floor(Date.now() / 1000) - timeoutSeconds;

  // Get stale jobs
  const staleJobs = db.prepare(`
    SELECT * FROM catalog_jobs
    WHERE status IN ('claimed', 'processing')
      AND updated_at < ?
  `).all(cutoff) as JobRow[];

  if (staleJobs.length === 0) return 0;

  let expired = 0;
  for (const row of staleJobs) {
    if (row.attempts < row.max_attempts) {
      // Re-queue
      db.prepare(`
        UPDATE catalog_jobs
        SET status = 'pending',
            worker_id = NULL,
            stage = NULL,
            error_message = 'Expired: worker timeout',
            claimed_at = NULL,
            updated_at = unixepoch()
        WHERE id = ?
      `).run(row.id);

      catalogStore.updateAsset(row.asset_id, { proxyStatus: 'queued' as ProxyStatus });
    } else {
      // Permanently fail
      db.prepare(`
        UPDATE catalog_jobs
        SET status = 'failed',
            error_message = 'Expired: worker timeout after max attempts',
            completed_at = unixepoch(),
            updated_at = unixepoch()
        WHERE id = ?
      `).run(row.id);

      catalogStore.updateAsset(row.asset_id, { proxyStatus: 'failed' as ProxyStatus });
    }
    expired++;
  }

  if (expired > 0) {
    logger.warn({ expired }, `Expired ${expired} stale catalog jobs`);
  }

  return expired;
}

// ──────────────────────────────────────────────
// Bulk Queue
// ──────────────────────────────────────────────

/**
 * Queue proxy generation jobs for all assets in a space that:
 * - Have proxyStatus = 'none'
 * - Have a non-stub primary file
 * - Don't already have a pending/claimed/processing job
 * Returns the number of jobs queued.
 */
export function queueJobsForSpace(spaceName: string): number {
  const db = getDatabase();

  // Find assets eligible for proxy generation
  const assets = db.prepare(`
    SELECT a.id, a.asset_type, af.file_path
    FROM assets a
    JOIN asset_files af ON af.id = a.primary_file_id
    WHERE a.space_name = ?
      AND a.proxy_status = 'none'
      AND af.is_archive_stub = 0
      AND NOT EXISTS (
        SELECT 1 FROM catalog_jobs cj
        WHERE cj.asset_id = a.id
          AND cj.status IN ('pending', 'claimed', 'processing')
      )
  `).all(spaceName) as { id: number; asset_type: string; file_path: string }[];

  if (assets.length === 0) return 0;

  const insertStmt = db.prepare(`
    INSERT INTO catalog_jobs (asset_id, space_name, primary_file_path, asset_type, job_type)
    VALUES (?, ?, ?, ?, 'full')
  `);

  const updateAssetStmt = db.prepare(`
    UPDATE assets SET proxy_status = 'queued', updated_at = unixepoch() WHERE id = ?
  `);

  const doQueue = db.transaction(() => {
    for (const asset of assets) {
      insertStmt.run(asset.id, spaceName, asset.file_path, asset.asset_type);
      updateAssetStmt.run(asset.id);
    }
  });

  doQueue();

  logger.info(
    { spaceName, queued: assets.length },
    `Queued ${assets.length} proxy generation jobs for space ${spaceName}`,
  );

  return assets.length;
}
