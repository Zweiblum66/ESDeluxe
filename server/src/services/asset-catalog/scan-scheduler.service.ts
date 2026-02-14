import * as catalogStore from './asset-catalog.store.js';
import * as jobStore from './job.store.js';
import { scanSpace } from './scanner.service.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { IAssetScanSchedulerStatus } from '../../../../shared/types/asset-catalog.js';

// ──────────────────────────────────────────────
// Asset Scan Scheduler
// ──────────────────────────────────────────────

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastCheckAt: number | undefined;
let nextCheckAt: number | undefined;

/**
 * Start the asset catalog scan scheduler.
 * Checks enabled spaces at a configurable interval and triggers scans for due spaces.
 */
export function startAssetScanScheduler(): void {
  if (!config.CATALOG_SCAN_ENABLED) {
    logger.info('Asset catalog scan scheduler is disabled via CATALOG_SCAN_ENABLED=false');
    return;
  }

  if (schedulerTimer) {
    logger.warn('Asset catalog scan scheduler already running');
    return;
  }

  const intervalMs = (config.CATALOG_SCAN_INTERVAL_MINUTES ?? 60) * 60 * 1000;

  logger.info(
    { intervalMinutes: config.CATALOG_SCAN_INTERVAL_MINUTES ?? 60 },
    'Starting asset catalog scan scheduler',
  );

  // Run immediately on startup
  checkAndRunScans();

  // Then run on interval
  schedulerTimer = setInterval(checkAndRunScans, intervalMs);
}

/**
 * Stop the asset catalog scan scheduler.
 */
export function stopAssetScanScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info('Asset catalog scan scheduler stopped');
  }
}

/**
 * Get the current scheduler status.
 */
export function getSchedulerStatus(): IAssetScanSchedulerStatus {
  const configs = catalogStore.listScanConfigs();
  const enabledCount = configs.filter((c) => c.enabled).length;

  return {
    isRunning,
    enabledSpaceCount: enabledCount,
    lastCheckAt,
    nextCheckAt,
  };
}

/**
 * Core scheduler loop: check for due spaces and trigger scans.
 */
async function checkAndRunScans(): Promise<void> {
  if (isRunning) {
    logger.debug('Asset scan scheduler: previous check still running, skipping');
    return;
  }

  isRunning = true;
  lastCheckAt = Math.floor(Date.now() / 1000);

  try {
    // Expire stale catalog jobs (worker timeout: 5 minutes)
    try {
      const expired = jobStore.expireStaleJobs(300);
      if (expired > 0) {
        logger.info({ expired }, `Expired ${expired} stale catalog jobs`);
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to expire stale catalog jobs');
    }

    const dueConfigs = catalogStore.getDueScanConfigs();

    if (dueConfigs.length === 0) {
      logger.debug('Asset scan scheduler: no spaces due for scanning');
      return;
    }

    logger.info(
      { spaceCount: dueConfigs.length },
      `Asset scan scheduler: ${dueConfigs.length} space(s) due for scanning`,
    );

    // Process spaces sequentially to avoid overloading the system
    for (const scanConfig of dueConfigs) {
      try {
        logger.info({ spaceName: scanConfig.spaceName }, `Scheduled scan starting for: ${scanConfig.spaceName}`);
        await scanSpace(scanConfig.spaceName, 'scheduled');
      } catch (err) {
        logger.error(
          { err, spaceName: scanConfig.spaceName },
          `Scheduled scan failed for space: ${scanConfig.spaceName}`,
        );
        // Continue with next space even if one fails
      }
    }
  } catch (err) {
    logger.error({ err }, 'Asset scan scheduler: unexpected error in check loop');
  } finally {
    isRunning = false;
    const intervalMs = (config.CATALOG_SCAN_INTERVAL_MINUTES ?? 60) * 60 * 1000;
    nextCheckAt = Math.floor(Date.now() / 1000) + Math.floor(intervalMs / 1000);
  }
}
