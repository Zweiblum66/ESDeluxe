import axios from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';
import type { IGuardianBatchClaim, InsertGuardianEvent } from '../../shared/types/guardian.js';

const client = axios.create({
    baseURL: `${config.MANAGER_URL}/api/v1/worker`,
    headers: {
        'Authorization': `Worker ${config.WORKER_API_KEY}`,
        'Content-Type': 'application/json',
    },
    timeout: 15_000,
});

/**
 * Claim the next available job from the manager.
 * Returns the job claim (with file paths) or null if no work available.
 */
export async function claimJob(): Promise<any | null> {
    try {
        const { data } = await client.post('/jobs/claim', {
            workerId: config.WORKER_ID,
        });
        if (!data.data) return null;
        return data.data;
    } catch (err) {
        logger.error({ err }, 'Failed to claim job');
        return null;
    }
}

/**
 * Report job progress (started processing).
 */
export async function reportProgress(jobId: number, stage?: string): Promise<void> {
    try {
        await client.put(`/jobs/${jobId}/progress`, {
            workerId: config.WORKER_ID,
            stage,
        });
    } catch (err) {
        logger.error({ err, jobId }, 'Failed to report progress');
    }
}

/**
 * Send heartbeat for an active job.
 */
export async function heartbeat(jobId: number): Promise<boolean> {
    try {
        await client.put(`/jobs/${jobId}/heartbeat`, {
            workerId: config.WORKER_ID,
        });
        return true;
    } catch (err) {
        logger.warn({ err, jobId }, 'Heartbeat failed');
        return false;
    }
}

/**
 * Report job completion with results.
 */
export async function reportComplete(jobId: number, result: Record<string, any>): Promise<void> {
    try {
        await client.put(`/jobs/${jobId}/complete`, {
            workerId: config.WORKER_ID,
            result,
        });
    } catch (err) {
        logger.error({ err, jobId }, 'Failed to report completion');
        throw err;
    }
}

/**
 * Report job failure.
 */
export async function reportFail(jobId: number, error: string): Promise<void> {
    try {
        await client.put(`/jobs/${jobId}/fail`, {
            workerId: config.WORKER_ID,
            error,
        });
    } catch (err) {
        logger.error({ err, jobId }, 'Failed to report failure');
    }
}

/**
 * Check connectivity to the manager.
 */
export async function checkConnection(): Promise<boolean> {
    try {
        const { data } = await client.get('/status');
        return !!data.data;
    } catch {
        return false;
    }
}

// ──────────────────────────────────────────────
// Guardian Batch Processing
// ──────────────────────────────────────────────

/**
 * Claim the next available Guardian batch from the queue.
 */
export async function claimGuardianBatch(): Promise<IGuardianBatchClaim | null> {
    try {
        const { data } = await client.post('/guardian/claim', {
            workerId: config.WORKER_ID,
        });
        if (!data.data) return null;
        return data.data as IGuardianBatchClaim;
    } catch (err) {
        logger.error({ err }, 'Failed to claim Guardian batch');
        return null;
    }
}

/**
 * Report Guardian batch completion with parsed events.
 */
export async function completeGuardianBatch(batchId: string, events: InsertGuardianEvent[]): Promise<void> {
    try {
        await client.put(`/guardian/${batchId}/complete`, {
            workerId: config.WORKER_ID,
            events,
        });
    } catch (err) {
        logger.error({ err, batchId }, 'Failed to complete Guardian batch');
        throw err;
    }
}

/**
 * Report Guardian batch failure.
 */
export async function failGuardianBatch(batchId: string, error: string): Promise<void> {
    try {
        await client.put(`/guardian/${batchId}/fail`, {
            workerId: config.WORKER_ID,
            error,
        });
    } catch (err) {
        logger.error({ err, batchId }, 'Failed to report Guardian batch failure');
    }
}

/**
 * Send heartbeat for a Guardian batch being processed.
 */
export async function heartbeatGuardianBatch(batchId: string): Promise<boolean> {
    try {
        await client.put(`/guardian/${batchId}/heartbeat`, {
            workerId: config.WORKER_ID,
        });
        return true;
    } catch (err) {
        logger.warn({ err, batchId }, 'Guardian batch heartbeat failed');
        return false;
    }
}
