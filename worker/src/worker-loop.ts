import { config } from './config.js';
import { logger } from './logger.js';
import * as api from './api-client.js';
import { processJob } from './job-processor.js';
import { processGuardianBatch } from './guardian-processor.js';
import type { IGuardianBatchClaim } from '../../shared/types/guardian.js';

interface ActiveJob {
    jobId: number | string;
    jobType: 'catalog' | 'guardian';
    heartbeatTimer: ReturnType<typeof setInterval>;
    claim: any;
}

const activeJobs = new Map<number | string, ActiveJob>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let isShuttingDown = false;

// ──────────────────────────────────────────────
// Heartbeat
// ──────────────────────────────────────────────

function startCatalogHeartbeat(jobId: number): ReturnType<typeof setInterval> {
    return setInterval(async () => {
        const ok = await api.heartbeat(jobId);
        if (!ok) {
            logger.warn({ jobId }, 'Heartbeat failed — job may have been reclaimed');
        }
    }, config.HEARTBEAT_INTERVAL_SECONDS * 1000);
}

function startGuardianHeartbeat(batchId: string): ReturnType<typeof setInterval> {
    return setInterval(async () => {
        const ok = await api.heartbeatGuardianBatch(batchId);
        if (!ok) {
            logger.warn({ batchId }, 'Guardian heartbeat failed — batch may have been reclaimed');
        }
    }, config.HEARTBEAT_INTERVAL_SECONDS * 1000);
}

// ──────────────────────────────────────────────
// Catalog Job Execution
// ──────────────────────────────────────────────

async function executeCatalogJob(claim: any): Promise<void> {
    const jobId = claim.job.id;

    const heartbeatTimer = startCatalogHeartbeat(jobId);
    activeJobs.set(jobId, { jobId, jobType: 'catalog', heartbeatTimer, claim });

    try {
        await api.reportProgress(jobId);
        const result = await processJob(claim);
        await api.reportComplete(jobId, result);
        logger.info({ jobId, assetId: claim.job.assetId, proxyStatus: result.proxyStatus }, 'Job completed successfully');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error({ err, jobId }, `Job failed: ${errorMessage}`);
        await api.reportFail(jobId, errorMessage);
    } finally {
        clearInterval(heartbeatTimer);
        activeJobs.delete(jobId);
    }
}

// ──────────────────────────────────────────────
// Guardian Batch Execution
// ──────────────────────────────────────────────

async function executeGuardianBatch(batch: IGuardianBatchClaim): Promise<void> {
    const heartbeatTimer = startGuardianHeartbeat(batch.batchId);
    activeJobs.set(batch.batchId, { jobId: batch.batchId, jobType: 'guardian', heartbeatTimer, claim: batch });

    try {
        const result = processGuardianBatch(batch.rawPayload, batch.sourceProtocol);

        await api.completeGuardianBatch(batch.batchId, result.events);

        logger.info({
            batchId: batch.batchId,
            eventsProcessed: result.events.length,
            parseErrors: result.parseErrors,
            totalLines: result.totalLines,
        }, 'Guardian batch completed');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error({ err, batchId: batch.batchId }, `Guardian batch failed: ${errorMessage}`);
        await api.failGuardianBatch(batch.batchId, errorMessage);
    } finally {
        clearInterval(heartbeatTimer);
        activeJobs.delete(batch.batchId);
    }
}

// ──────────────────────────────────────────────
// Poll Loop
// ──────────────────────────────────────────────

async function poll(): Promise<void> {
    if (isShuttingDown) return;

    if (activeJobs.size >= config.MAX_CONCURRENT_JOBS) {
        schedulePoll();
        return;
    }

    let claimedWork = false;

    try {
        // Try to claim a catalog job first
        const catalogClaim = await api.claimJob();
        if (catalogClaim) {
            logger.info({
                jobId: catalogClaim.job.id,
                assetId: catalogClaim.job.assetId,
                type: catalogClaim.job.assetType,
                path: catalogClaim.job.primaryFilePath,
                activeJobs: activeJobs.size + 1,
                maxJobs: config.MAX_CONCURRENT_JOBS,
            }, `Claimed catalog job #${catalogClaim.job.id}`);

            executeCatalogJob(catalogClaim).catch((err) => {
                logger.error({ err, jobId: catalogClaim.job.id }, 'Unhandled error in catalog job');
            });

            claimedWork = true;
        }

        // Try to claim a Guardian batch (if enabled and we have capacity)
        if (config.GUARDIAN_PROCESSING_ENABLED && activeJobs.size < config.MAX_CONCURRENT_JOBS) {
            const guardianBatch = await api.claimGuardianBatch();
            if (guardianBatch) {
                logger.info({
                    batchId: guardianBatch.batchId,
                    protocol: guardianBatch.sourceProtocol,
                    estimateEvents: guardianBatch.eventCountEstimate,
                    activeJobs: activeJobs.size + 1,
                    maxJobs: config.MAX_CONCURRENT_JOBS,
                }, `Claimed Guardian batch ${guardianBatch.batchId.slice(0, 8)}...`);

                executeGuardianBatch(guardianBatch).catch((err) => {
                    logger.error({ err, batchId: guardianBatch.batchId }, 'Unhandled error in Guardian batch');
                });

                claimedWork = true;
            }
        }

        // If we claimed work and still have capacity, try again immediately
        if (claimedWork && activeJobs.size < config.MAX_CONCURRENT_JOBS) {
            setImmediate(poll);
            return;
        }
    } catch (err) {
        logger.error({ err }, 'Poll failed');
    }

    schedulePoll();
}

function schedulePoll(): void {
    if (isShuttingDown) return;
    pollTimer = setTimeout(poll, config.POLL_INTERVAL_SECONDS * 1000);
}

// ──────────────────────────────────────────────
// Start / Stop
// ──────────────────────────────────────────────

export function startWorkerLoop(): void {
    logger.info({
        workerId: config.WORKER_ID,
        maxConcurrent: config.MAX_CONCURRENT_JOBS,
        pollInterval: config.POLL_INTERVAL_SECONDS,
        heartbeatInterval: config.HEARTBEAT_INTERVAL_SECONDS,
        guardianEnabled: config.GUARDIAN_PROCESSING_ENABLED,
    }, 'Starting worker loop');

    poll();
}

export async function stopWorkerLoop(): Promise<void> {
    isShuttingDown = true;

    if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }

    if (activeJobs.size > 0) {
        logger.info({ activeJobs: activeJobs.size }, 'Waiting for active jobs to finish...');
        const timeout = config.JOB_TIMEOUT_SECONDS * 1000;
        const start = Date.now();

        while (activeJobs.size > 0 && Date.now() - start < timeout) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (activeJobs.size > 0) {
            logger.warn({ remainingJobs: activeJobs.size }, 'Shutdown timeout — abandoning remaining jobs');
            for (const job of activeJobs.values()) {
                clearInterval(job.heartbeatTimer);
            }
            activeJobs.clear();
        }
    }

    logger.info('Worker loop stopped');
}
