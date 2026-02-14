import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import * as qosService from './editshare-api/qos.service.js';
import * as historyStore from './qos-history.store.js';
import * as profilesStore from './qos-profiles.store.js';
import * as alertsStore from './qos-alerts.store.js';
import type { IQosConfig } from '../../../shared/types/qos.js';

// ──────────────────────────────────────────────
// Scheduler State
// ──────────────────────────────────────────────

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastPollAt: number | undefined;
let nextPollAt: number | undefined;
let pollCount = 0;
let errorCount = 0;

function isEnabled(): boolean {
  return config.QOS_HISTORY_ENABLED;
}

function getPollIntervalSeconds(): number {
  return config.QOS_HISTORY_POLL_INTERVAL_SECONDS;
}

function getRetentionDays(): number {
  return config.QOS_HISTORY_RETENTION_DAYS;
}

// ──────────────────────────────────────────────
// Cron matching (simple 5-field cron)
// ──────────────────────────────────────────────

/**
 * Simple cron expression matcher for 5-field cron:
 * minute hour day-of-month month day-of-week
 *
 * Supports: numbers, wildcards (*), ranges (1-5), lists (1,3,5), step values (star/5)
 */
function matchesCron(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const checks = [
    { value: date.getMinutes(), field: parts[0], min: 0, max: 59 },
    { value: date.getHours(), field: parts[1], min: 0, max: 23 },
    { value: date.getDate(), field: parts[2], min: 1, max: 31 },
    { value: date.getMonth() + 1, field: parts[3], min: 1, max: 12 },
    { value: date.getDay(), field: parts[4], min: 0, max: 6 },
  ];

  return checks.every(({ value, field, min, max }) =>
    matchesCronField(field, value, min, max),
  );
}

function matchesCronField(field: string, value: number, min: number, max: number): boolean {
  // Handle wildcard
  if (field === '*') return true;

  // Handle step values: */5 or 1-10/2
  if (field.includes('/')) {
    const [rangePart, stepStr] = field.split('/');
    const step = parseInt(stepStr, 10);
    if (isNaN(step) || step <= 0) return false;

    if (rangePart === '*') {
      return (value - min) % step === 0;
    }

    if (rangePart.includes('-')) {
      const [startStr, endStr] = rangePart.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (value < start || value > end) return false;
      return (value - start) % step === 0;
    }

    return false;
  }

  // Handle lists: 1,3,5
  if (field.includes(',')) {
    return field.split(',').some((part) => matchesCronField(part.trim(), value, min, max));
  }

  // Handle ranges: 1-5
  if (field.includes('-')) {
    const [startStr, endStr] = field.split('-');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    return value >= start && value <= end;
  }

  // Plain number
  return parseInt(field, 10) === value;
}

// ──────────────────────────────────────────────
// Core poll loop
// ──────────────────────────────────────────────

async function pollAndRecord(): Promise<void> {
  if (isRunning) {
    logger.debug('QoS scheduler: skipping poll (already running)');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    // 1. Fetch current QoS usage from all storage node groups
    const usageData = await qosService.getQosUsage();

    // 2. Record bandwidth samples to history
    for (const sngUsage of usageData) {
      const samples = sngUsage.pools
        .filter((p) => p.poolName !== null)
        .map((p) => ({
          poolName: p.poolName as string,
          bytesPerSecond: p.bytesPerSecond,
        }));

      if (samples.length > 0) {
        historyStore.insertSamples(sngUsage.storageNodeGroup, samples);
      }
    }

    // 3. Check alert thresholds
    const flatUsage = usageData.flatMap((sng) =>
      sng.pools.map((p) => ({
        storageNodeGroup: sng.storageNodeGroup,
        poolName: p.poolName,
        bytesPerSecond: p.bytesPerSecond,
      })),
    );
    const triggeredAlerts = alertsStore.checkThresholds(flatUsage);
    if (triggeredAlerts.length > 0) {
      logger.warn(
        { count: triggeredAlerts.length },
        'QoS alerts triggered this poll cycle',
      );
    }

    // 4. Check scheduled profiles
    const now = new Date();
    const enabledSchedules = profilesStore.getEnabledSchedules();

    for (const schedule of enabledSchedules) {
      if (!matchesCron(schedule.cronExpression, now)) continue;

      // Avoid running same schedule more than once per minute
      if (schedule.lastRunAt && (now.getTime() / 1000 - schedule.lastRunAt) < 55) continue;

      try {
        const profileConfig = JSON.parse(schedule.configJson) as Omit<IQosConfig, 'storageNodeGroup'>;
        await qosService.setQosConfig(schedule.storageNodeGroup, {
          qosEnabled: profileConfig.qosEnabled,
          pools: profileConfig.pools,
          othersBandwidthLimit: profileConfig.othersBandwidthLimit,
        });
        profilesStore.markScheduleRun(schedule.id);
        logger.info(
          { scheduleId: schedule.id, profileName: schedule.profileName, storageNodeGroup: schedule.storageNodeGroup },
          'QoS scheduled profile applied',
        );
      } catch (err: unknown) {
        logger.error(
          { err, scheduleId: schedule.id, profileName: schedule.profileName },
          'Failed to apply scheduled QoS profile',
        );
      }
    }

    // 5. Periodically clean old records (every ~100 polls)
    pollCount++;
    if (pollCount % 100 === 0) {
      historyStore.cleanOldRecords(getRetentionDays());
    }

    lastPollAt = Date.now();
    const elapsed = lastPollAt - startTime;
    logger.debug({ elapsed, pollCount }, 'QoS poll cycle completed');
  } catch (err: unknown) {
    errorCount++;
    logger.error({ err, errorCount }, 'QoS scheduler poll failed');
  } finally {
    isRunning = false;
    nextPollAt = Date.now() + getPollIntervalSeconds() * 1000;
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export function startQosScheduler(): void {
  if (schedulerTimer) {
    logger.warn('QoS scheduler already running');
    return;
  }

  if (!isEnabled()) {
    logger.info('QoS history scheduler is disabled (QOS_HISTORY_ENABLED=false)');
    return;
  }

  const intervalMs = getPollIntervalSeconds() * 1000;
  logger.info(
    { intervalSeconds: getPollIntervalSeconds(), retentionDays: getRetentionDays() },
    'Starting QoS scheduler',
  );

  // Run immediately, then on interval
  pollAndRecord().catch((err) =>
    logger.error({ err }, 'QoS scheduler initial poll failed'),
  );

  schedulerTimer = setInterval(() => {
    pollAndRecord().catch((err) =>
      logger.error({ err }, 'QoS scheduler poll failed'),
    );
  }, intervalMs);
}

export function stopQosScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info('QoS scheduler stopped');
  }
}

export interface IQosSchedulerStatus {
  enabled: boolean;
  running: boolean;
  lastPollAt: number | undefined;
  nextPollAt: number | undefined;
  pollCount: number;
  errorCount: number;
  pollIntervalSeconds: number;
  retentionDays: number;
}

export function getQosSchedulerStatus(): IQosSchedulerStatus {
  return {
    enabled: isEnabled(),
    running: schedulerTimer !== null,
    lastPollAt,
    nextPollAt,
    pollCount,
    errorCount,
    pollIntervalSeconds: getPollIntervalSeconds(),
    retentionDays: getRetentionDays(),
  };
}
