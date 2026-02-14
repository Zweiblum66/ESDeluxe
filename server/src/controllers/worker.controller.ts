import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import * as guardianQueue from '../services/guardian-queue.store.js';
import * as jobStore from '../services/asset-catalog/job.store.js';
import { processEvents } from '../services/guardian-receiver.service.js';
import { logger } from '../utils/logger.js';
import type { InsertGuardianEvent } from '../../../shared/types/guardian.js';

// ──────────────────────────────────────────────
// Worker Status
// ──────────────────────────────────────────────

export async function getStatus(_req: Request, res: Response): Promise<void> {
  const guardianQueueStats = guardianQueue.getStats();

  res.json({
    data: {
      workerApiEnabled: !!config.WORKER_API_KEY,
      guardianWorkerMode: config.GUARDIAN_WORKER_MODE,
      guardianQueue: guardianQueueStats,
    },
  });
}

// ──────────────────────────────────────────────
// Guardian: Claim batch
// ──────────────────────────────────────────────

export async function claimGuardianBatch(req: Request, res: Response): Promise<void> {
  const workerId = getWorkerId(req);
  if (!workerId) {
    res.status(400).json({ error: 'workerId is required' });
    return;
  }

  if (config.GUARDIAN_WORKER_MODE !== 'queue') {
    res.status(409).json({ error: 'Guardian is not in queue mode (GUARDIAN_WORKER_MODE=local)' });
    return;
  }

  const batch = guardianQueue.claimBatch(workerId);
  if (!batch) {
    res.json({ data: null });
    return;
  }

  res.json({ data: batch });
}

// ──────────────────────────────────────────────
// Guardian: Complete batch
// ──────────────────────────────────────────────

export async function completeGuardianBatch(req: Request, res: Response): Promise<void> {
  const batchId = req.params.batchId as string;
  const workerId = getWorkerId(req);
  const events = (req.body as Record<string, unknown>)?.events as InsertGuardianEvent[] | undefined;

  if (!workerId) {
    res.status(400).json({ error: 'workerId is required' });
    return;
  }

  if (!events || !Array.isArray(events)) {
    res.status(400).json({ error: 'events array is required' });
    return;
  }

  // Store parsed events + feed QoS + check alerts
  processEvents(events);

  const ok = guardianQueue.completeBatch(batchId, workerId, events.length);
  if (!ok) {
    res.status(404).json({ error: 'Batch not found or not claimed by this worker' });
    return;
  }

  res.json({ data: { eventsProcessed: events.length } });
}

// ──────────────────────────────────────────────
// Guardian: Fail batch
// ──────────────────────────────────────────────

export async function failGuardianBatch(req: Request, res: Response): Promise<void> {
  const batchId = req.params.batchId as string;
  const workerId = getWorkerId(req);
  const error = String((req.body as Record<string, unknown>)?.error || 'Unknown error');

  if (!workerId) {
    res.status(400).json({ error: 'workerId is required' });
    return;
  }

  const ok = guardianQueue.failBatch(batchId, workerId, error);
  if (!ok) {
    res.status(404).json({ error: 'Batch not found or not claimed by this worker' });
    return;
  }

  res.json({ data: { ok: true } });
}

// ──────────────────────────────────────────────
// Guardian: Heartbeat
// ──────────────────────────────────────────────

export async function heartbeatGuardianBatch(req: Request, res: Response): Promise<void> {
  const batchId = req.params.batchId as string;
  const workerId = getWorkerId(req);

  if (!workerId) {
    res.status(400).json({ error: 'workerId is required' });
    return;
  }

  const ok = guardianQueue.heartbeat(batchId, workerId);
  if (!ok) {
    res.status(404).json({ error: 'Batch not found or not claimed by this worker' });
    return;
  }

  res.json({ data: { ok: true } });
}

// ──────────────────────────────────────────────
// Asset Catalog: Job Claiming & Lifecycle
// ──────────────────────────────────────────────

export async function claimJob(req: Request, res: Response): Promise<void> {
  const workerId = getWorkerId(req);
  if (!workerId) {
    res.status(400).json({ error: 'workerId is required' });
    return;
  }

  const claim = await jobStore.claimNextJob(workerId);
  if (!claim) {
    res.json({ data: null });
    return;
  }

  logger.info(
    { jobId: claim.job.id, assetId: claim.job.assetId, workerId },
    'Catalog job claimed by worker',
  );

  res.json({ data: claim });
}

export async function reportJobProgress(req: Request, res: Response): Promise<void> {
  const jobId = parseInt(req.params.jobId as string, 10);
  const workerId = getWorkerId(req);
  const stage = (req.body as Record<string, unknown>)?.stage as string | undefined;

  if (!workerId) {
    res.status(400).json({ error: 'workerId is required' });
    return;
  }
  if (isNaN(jobId)) {
    res.status(400).json({ error: 'Invalid jobId' });
    return;
  }

  const ok = jobStore.updateJobProgress(jobId, workerId, stage);
  if (!ok) {
    res.status(404).json({ error: 'Job not found or not claimed by this worker' });
    return;
  }

  res.json({ data: { ok: true } });
}

export async function reportJobComplete(req: Request, res: Response): Promise<void> {
  const jobId = parseInt(req.params.jobId as string, 10);
  const workerId = getWorkerId(req);
  const body = req.body as Record<string, unknown>;

  if (!workerId) {
    res.status(400).json({ error: 'workerId is required' });
    return;
  }
  if (isNaN(jobId)) {
    res.status(400).json({ error: 'Invalid jobId' });
    return;
  }

  // The worker sends result nested under 'result' key
  const jobResult = (body.result || body) as Record<string, unknown>;
  const result = {
    metadata: jobResult.metadata as Record<string, unknown> | undefined,
    thumbnailPath: jobResult.thumbnailPath as string | undefined,
    proxyPath: jobResult.proxyPath as string | undefined,
    proxyStatus: jobResult.proxyStatus as string | undefined,
  };

  const ok = jobStore.completeJob(jobId, workerId, result);
  if (!ok) {
    res.status(404).json({ error: 'Job not found or not claimed by this worker' });
    return;
  }

  logger.info({ jobId, workerId, proxyStatus: result.proxyStatus }, 'Catalog job completed');
  res.json({ data: { ok: true } });
}

export async function reportJobFail(req: Request, res: Response): Promise<void> {
  const jobId = parseInt(req.params.jobId as string, 10);
  const workerId = getWorkerId(req);
  const error = String((req.body as Record<string, unknown>)?.error || 'Unknown error');

  if (!workerId) {
    res.status(400).json({ error: 'workerId is required' });
    return;
  }
  if (isNaN(jobId)) {
    res.status(400).json({ error: 'Invalid jobId' });
    return;
  }

  const ok = jobStore.failJob(jobId, workerId, error);
  if (!ok) {
    res.status(404).json({ error: 'Job not found or not claimed by this worker' });
    return;
  }

  logger.warn({ jobId, workerId, error }, 'Catalog job failed');
  res.json({ data: { ok: true } });
}

export async function heartbeatJob(req: Request, res: Response): Promise<void> {
  const jobId = parseInt(req.params.jobId as string, 10);
  const workerId = getWorkerId(req);

  if (!workerId) {
    res.status(400).json({ error: 'workerId is required' });
    return;
  }
  if (isNaN(jobId)) {
    res.status(400).json({ error: 'Invalid jobId' });
    return;
  }

  const ok = jobStore.heartbeatJob(jobId, workerId);
  if (!ok) {
    res.status(404).json({ error: 'Job not found or not claimed by this worker' });
    return;
  }

  res.json({ data: { ok: true } });
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function getWorkerId(req: Request): string | undefined {
  return req.workerId || ((req.body as Record<string, unknown>)?.workerId as string | undefined);
}
