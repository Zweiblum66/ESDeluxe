import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { resolveSpacePath } from '../utils/path-security.js';
import { getSpaceInfo } from './filesystem.service.js';
import * as efsCli from './efs-cli/commands.js';
import * as tieringStore from './tiering-rules.store.js';
import type { ITieringRule, ITieringSchedulerStatus } from '../../../shared/types/tiering.js';

// ──────────────────────────────────────────────
// Scheduler State
// ──────────────────────────────────────────────

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastCheckAt: number | undefined;
let nextCheckAt: number | undefined;

function getIntervalMinutes(): number {
  return config.TIERING_CHECK_INTERVAL_MINUTES;
}

function getMaxFilesPerRun(): number {
  return config.TIERING_MAX_FILES_PER_RUN;
}

function getLogRetentionDays(): number {
  return config.TIERING_LOG_RETENTION_DAYS;
}

function isTieringEnabled(): boolean {
  return config.TIERING_ENABLED;
}

// ──────────────────────────────────────────────
// Condition evaluation
// ──────────────────────────────────────────────

interface EfsFindEntry {
  atime: number;
  mtime: number;
  size: number;
  type: string;
  path: string;
}

function evaluateCondition(entry: EfsFindEntry, rule: ITieringRule): boolean {
  const now = Math.floor(Date.now() / 1000);

  switch (rule.condition) {
    case 'last_access': {
      if (rule.operator !== 'older_than_days') return false;
      const thresholdDays = parseInt(rule.value, 10);
      if (isNaN(thresholdDays)) return false;
      const ageDays = (now - entry.atime) / 86400;
      return ageDays > thresholdDays;
    }

    case 'last_modified': {
      if (rule.operator !== 'older_than_days') return false;
      const thresholdDays = parseInt(rule.value, 10);
      if (isNaN(thresholdDays)) return false;
      const ageDays = (now - entry.mtime) / 86400;
      return ageDays > thresholdDays;
    }

    case 'file_size': {
      if (rule.operator !== 'larger_than_bytes') return false;
      const thresholdBytes = parseInt(rule.value, 10);
      if (isNaN(thresholdBytes)) return false;
      return entry.size > thresholdBytes;
    }

    case 'file_extension': {
      const ext = entry.path.split('.').pop()?.toLowerCase() || '';
      if (rule.operator === 'matches') {
        const patterns = rule.value.split(',').map((p) => p.trim().toLowerCase());
        return patterns.includes(ext);
      }
      if (rule.operator === 'not_matches') {
        const patterns = rule.value.split(',').map((p) => p.trim().toLowerCase());
        return !patterns.includes(ext);
      }
      return false;
    }

    default:
      return false;
  }
}

// ──────────────────────────────────────────────
// Rule execution
// ──────────────────────────────────────────────

async function executeRule(rule: ITieringRule): Promise<void> {
  const logId = tieringStore.createExecutionLog(rule.id);
  const maxFiles = getMaxFilesPerRun();

  let filesProcessed = 0;
  let filesSkipped = 0;
  let filesFailed = 0;
  let bytesProcessed = 0;
  const errors: string[] = [];

  try {
    logger.info(
      { ruleId: rule.id, spaceName: rule.spaceName, name: rule.name },
      `Executing tiering rule: ${rule.name}`,
    );

    // Resolve space path
    const space = await getSpaceInfo(rule.spaceName);
    const contentRoot = resolveSpacePath(rule.spaceName, space.type);

    // Determine search path (contentRoot or subpath if pathPattern is set)
    let searchPath = contentRoot;
    if (rule.pathPattern) {
      searchPath = resolveSpacePath(rule.spaceName, space.type, rule.pathPattern);
    }

    // Use efs-find to enumerate files
    const entries = await efsCli.findEntries(searchPath, contentRoot);

    // Filter to files only (tiering applies to files, not directories)
    const fileEntries = entries.filter((e) => e.type === 'file');

    // Get current goal for each file and check against source goal
    // To be efficient, we batch-check by evaluating conditions first,
    // then checking goals only for candidates
    const candidates: typeof fileEntries = [];

    for (const entry of fileEntries) {
      if (candidates.length >= maxFiles) break;

      // Convert IFileEntry to the shape evaluateCondition expects
      const efsFindEntry: EfsFindEntry = {
        atime: entry.atime,
        mtime: entry.mtime,
        size: entry.size,
        type: 'file',
        path: entry.path,
      };

      if (evaluateCondition(efsFindEntry, rule)) {
        candidates.push(entry);
      } else {
        filesSkipped++;
      }
    }

    // Process candidates: verify goal and apply new goal
    for (const candidate of candidates) {
      try {
        const absPath = resolveSpacePath(rule.spaceName, space.type, candidate.path);

        // Check current goal
        const currentGoal = await efsCli.getGoal(absPath);
        if (currentGoal !== rule.sourceGoal) {
          filesSkipped++;
          continue;
        }

        // Apply new goal
        await efsCli.setGoal(rule.targetGoal, [absPath], false);
        filesProcessed++;
        bytesProcessed += candidate.size;

        logger.debug(
          { path: candidate.path, from: rule.sourceGoal, to: rule.targetGoal },
          'File tiered',
        );
      } catch (err) {
        filesFailed++;
        const msg = err instanceof Error ? err.message : String(err);
        if (errors.length < 50) {
          errors.push(`${candidate.path}: ${msg}`);
        }
        logger.warn({ err, path: candidate.path }, 'Failed to tier file');
      }
    }

    // Update execution log
    tieringStore.updateExecutionLog(logId, {
      filesProcessed,
      filesSkipped,
      filesFailed,
      bytesProcessed,
      errors: errors.length > 0 ? errors : undefined,
      status: filesFailed > 0 ? 'completed' : 'completed',
    });

    // Update rule run status
    const now = Math.floor(Date.now() / 1000);
    const nextRun = now + getIntervalMinutes() * 60;
    tieringStore.updateRuleRunStatus(rule.id, now, filesProcessed, filesFailed, nextRun);

    logger.info(
      {
        ruleId: rule.id,
        name: rule.name,
        filesProcessed,
        filesSkipped,
        filesFailed,
        bytesProcessed,
      },
      `Tiering rule completed: ${rule.name}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);

    tieringStore.updateExecutionLog(logId, {
      filesProcessed,
      filesSkipped,
      filesFailed,
      bytesProcessed,
      errors,
      status: 'failed',
    });

    // Mark rule as error if it fails completely
    tieringStore.updateRule(rule.id, { status: 'error' });

    logger.error({ err, ruleId: rule.id, name: rule.name }, `Tiering rule failed: ${rule.name}`);
  }
}

// ──────────────────────────────────────────────
// Scheduler loop
// ──────────────────────────────────────────────

async function checkAndRunRules(): Promise<void> {
  if (isRunning) {
    logger.debug('Scheduler check skipped — already running');
    return;
  }

  isRunning = true;
  lastCheckAt = Math.floor(Date.now() / 1000);

  try {
    const now = Math.floor(Date.now() / 1000);
    const dueRules = tieringStore.getDueRules(now);

    if (dueRules.length > 0) {
      logger.info({ count: dueRules.length }, `Found ${dueRules.length} due tiering rule(s)`);

      // Execute rules sequentially to avoid overloading the filesystem
      for (const rule of dueRules) {
        await executeRule(rule);
      }
    }

    // Clean old logs periodically
    const cleaned = tieringStore.cleanOldLogs(getLogRetentionDays());
    if (cleaned > 0) {
      logger.debug({ cleaned }, 'Cleaned old tiering logs');
    }
  } catch (err) {
    logger.error({ err }, 'Tiering scheduler check failed');
  } finally {
    isRunning = false;
    nextCheckAt = Math.floor(Date.now() / 1000) + getIntervalMinutes() * 60;
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export function startScheduler(): void {
  if (!isTieringEnabled()) {
    logger.info('Tiering scheduler is disabled (TIERING_ENABLED=false)');
    return;
  }

  if (schedulerTimer) {
    logger.warn('Tiering scheduler already running');
    return;
  }

  const intervalMs = getIntervalMinutes() * 60 * 1000;

  logger.info(
    { intervalMinutes: getIntervalMinutes() },
    'Starting tiering scheduler',
  );

  // Run immediately for any overdue rules
  checkAndRunRules();

  // Then run periodically
  schedulerTimer = setInterval(checkAndRunRules, intervalMs);
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info('Tiering scheduler stopped');
  }
}

export async function triggerRule(ruleId: number): Promise<void> {
  const rule = tieringStore.getRule(ruleId);
  if (!rule) {
    throw new Error(`Rule ${ruleId} not found`);
  }
  if (rule.status !== 'active' && rule.status !== 'error') {
    throw new Error(`Rule ${ruleId} is ${rule.status}, cannot trigger`);
  }

  // Reset error status if needed
  if (rule.status === 'error') {
    tieringStore.updateRule(ruleId, { status: 'active' });
  }

  await executeRule(rule);
}

export function getSchedulerStatus(): ITieringSchedulerStatus {
  const activeRules = tieringStore.getActiveRules();

  return {
    isRunning: schedulerTimer !== null,
    intervalMinutes: getIntervalMinutes(),
    activeRuleCount: activeRules.length,
    lastCheckAt,
    nextCheckAt,
  };
}
