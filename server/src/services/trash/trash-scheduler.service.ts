/**
 * Trash Scheduler — Auto-purge expired trash entries on a timer.
 * Pattern follows tiering-scheduler.service.ts.
 */
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import * as trashService from './trash.service.js';
import * as trashStore from './trash.store.js';
import type { ITrashSchedulerStatus } from '../../../../shared/types/trash.js';

// ──────────────────────────────────────────────
// Scheduler State
// ──────────────────────────────────────────────

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastPurgeAt: number | undefined;
let nextPurgeAt: number | undefined;
let lastPurgeCount: number | undefined;

function getIntervalMinutes(): number {
  // DB config overrides env if set, but env is the default
  try {
    const dbConfig = trashStore.getConfig();
    return dbConfig.purgeIntervalMinutes;
  } catch {
    return config.TRASH_PURGE_INTERVAL_MINUTES;
  }
}

function isTrashEnabled(): boolean {
  return config.TRASH_ENABLED;
}

// ──────────────────────────────────────────────
// Purge loop
// ──────────────────────────────────────────────

async function runPurge(): Promise<void> {
  if (isRunning) {
    logger.debug('Trash purge check skipped — already running');
    return;
  }

  isRunning = true;
  lastPurgeAt = Math.floor(Date.now() / 1000);

  try {
    const result = await trashService.purgeExpired();

    if (result.itemCount > 0) {
      logger.info(
        { purged: result.itemCount, bytes: result.bytesAffected },
        `Trash auto-purge: ${result.message}`,
      );
    }

    lastPurgeCount = result.itemCount;
  } catch (err) {
    logger.error({ err }, 'Trash auto-purge failed');
  } finally {
    isRunning = false;
    nextPurgeAt = Math.floor(Date.now() / 1000) + getIntervalMinutes() * 60;
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export function startTrashScheduler(): void {
  if (!isTrashEnabled()) {
    logger.info('Trash scheduler is disabled (TRASH_ENABLED=false)');
    return;
  }

  if (schedulerTimer) {
    logger.warn('Trash scheduler already running');
    return;
  }

  const intervalMs = getIntervalMinutes() * 60 * 1000;

  logger.info(
    { intervalMinutes: getIntervalMinutes() },
    'Starting trash auto-purge scheduler',
  );

  // Run once immediately for any overdue items
  runPurge();

  // Then run periodically
  schedulerTimer = setInterval(runPurge, intervalMs);
}

export function stopTrashScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info('Trash scheduler stopped');
  }
}

/** Restart with potentially updated interval from DB config */
export function restartTrashScheduler(): void {
  stopTrashScheduler();
  startTrashScheduler();
}

export function getSchedulerStatus(): ITrashSchedulerStatus {
  const dbConfig = trashStore.getConfig();

  return {
    isRunning: schedulerTimer !== null,
    retentionDays: dbConfig.retentionDays,
    purgeIntervalMinutes: dbConfig.purgeIntervalMinutes,
    lastPurgeAt,
    nextPurgeAt,
    lastPurgeCount,
  };
}
