import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { resolveSpacePath } from '../utils/path-security.js';
import { getSpaceInfo } from './filesystem.service.js';
import { listSpaces } from './editshare-api/spaces.service.js';
import * as efsCli from './efs-cli/commands.js';
import * as tieringStore from './tiering-rules.store.js';
import * as archiveService from './archive/archive.service.js';
import type { ITieringRule, ITieringSchedulerStatus, ITieringProgress, ISpaceSelector } from '../../../shared/types/tiering.js';
import type { ISpace } from '../../../shared/types/space.js';

// ──────────────────────────────────────────────
// Scheduler State
// ──────────────────────────────────────────────

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastCheckAt: number | undefined;
let nextCheckAt: number | undefined;

// ──────────────────────────────────────────────
// Live Progress State (in-memory)
// ──────────────────────────────────────────────

let currentProgress: ITieringProgress | null = null;
let lastDbFlushAt = 0;
let lastDbFlushCount = 0;
const DB_FLUSH_INTERVAL_MS = 2000;
const DB_FLUSH_FILE_INTERVAL = 5;

/** Get the current in-flight progress (returns null when idle) */
export function getCurrentProgress(): ITieringProgress | null {
  return currentProgress ? { ...currentProgress } : null;
}

function updateProgressPercent(): void {
  if (!currentProgress || currentProgress.totalFiles === 0) return;
  const done = currentProgress.filesProcessed + currentProgress.filesFailed + currentProgress.filesSkipped;
  currentProgress.percentComplete = Math.round((done / currentProgress.totalFiles) * 100);
}

function maybeFlushProgressToDb(logId: number): void {
  if (!currentProgress) return;
  const now = Date.now();
  const totalDone = currentProgress.filesProcessed + currentProgress.filesFailed;

  const timeSinceFlush = now - lastDbFlushAt;
  const filesSinceFlush = totalDone - lastDbFlushCount;

  if (timeSinceFlush >= DB_FLUSH_INTERVAL_MS || filesSinceFlush >= DB_FLUSH_FILE_INTERVAL) {
    tieringStore.updateExecutionLogProgress(logId, {
      filesProcessed: currentProgress.filesProcessed,
      filesSkipped: currentProgress.filesSkipped,
      filesFailed: currentProgress.filesFailed,
      bytesProcessed: currentProgress.bytesProcessed,
      totalFiles: currentProgress.totalFiles,
      currentFile: currentProgress.currentFile,
    });
    lastDbFlushAt = now;
    lastDbFlushCount = totalDone;
  }
}

// ──────────────────────────────────────────────
// Config helpers
// ──────────────────────────────────────────────

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

/** Convert a time-based operator + value to a threshold in seconds */
function operatorToSeconds(operator: string, value: string): number | null {
  const n = parseInt(value, 10);
  if (isNaN(n)) return null;
  switch (operator) {
    case 'older_than_hours': return n * 3600;
    case 'older_than_days': return n * 86400;
    case 'older_than_weeks': return n * 7 * 86400;
    case 'older_than_months': return n * 30 * 86400;
    default: return null;
  }
}

function evaluateCondition(entry: EfsFindEntry, rule: ITieringRule): boolean {
  const now = Math.floor(Date.now() / 1000);

  switch (rule.condition) {
    case 'last_access': {
      const thresholdSec = operatorToSeconds(rule.operator, rule.value);
      if (thresholdSec === null) return false;
      return (now - entry.atime) > thresholdSec;
    }

    case 'last_modified': {
      const thresholdSec = operatorToSeconds(rule.operator, rule.value);
      if (thresholdSec === null) return false;
      return (now - entry.mtime) > thresholdSec;
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
// Space resolution
// ──────────────────────────────────────────────

async function resolveSpacesFromSelector(selector: ISpaceSelector): Promise<ISpace[]> {
  switch (selector.mode) {
    case 'explicit': {
      const results: ISpace[] = [];
      for (const name of selector.spaceNames) {
        try {
          const space = await getSpaceInfo(name);
          results.push(space);
        } catch (err) {
          logger.warn({ err, spaceName: name }, `Space not found for tiering rule, skipping: ${name}`);
        }
      }
      return results;
    }

    case 'by_type': {
      const allSpaces = await listSpaces();
      return allSpaces.filter((s) => selector.spaceTypes.includes(s.type));
    }

    case 'pattern': {
      const allSpaces = await listSpaces();
      try {
        const re = new RegExp(selector.namePattern);
        return allSpaces.filter((s) => re.test(s.name));
      } catch {
        logger.warn({ pattern: selector.namePattern }, 'Invalid regex pattern in tiering rule');
        return [];
      }
    }

    case 'all': {
      return listSpaces();
    }

    default:
      return [];
  }
}

// ──────────────────────────────────────────────
// Per-space rule execution
// ──────────────────────────────────────────────

interface SpaceExecResult {
  filesProcessed: number;
  filesSkipped: number;
  filesFailed: number;
  bytesProcessed: number;
  errors: string[];
}

async function executeRuleForSpace(
  rule: ITieringRule,
  spaceName: string,
  spaceType: string,
  maxFiles: number,
  logId: number,
): Promise<SpaceExecResult> {
  let filesProcessed = 0;
  let filesSkipped = 0;
  let filesFailed = 0;
  let bytesProcessed = 0;
  const errors: string[] = [];

  const contentRoot = resolveSpacePath(spaceName, spaceType);

  // Determine search path
  let searchPath = contentRoot;
  if (rule.pathPattern) {
    searchPath = resolveSpacePath(spaceName, spaceType, rule.pathPattern);
  }

  // Update progress: enumerating this space
  if (currentProgress) {
    currentProgress.currentSpace = spaceName;
    currentProgress.updatedAt = Math.floor(Date.now() / 1000);
  }

  // Use efs-find to enumerate files
  const entries = await efsCli.findEntries(searchPath, contentRoot);
  const fileEntries = entries.filter((e) => e.type === 'file');

  // Evaluate conditions and build candidate list
  const candidates: typeof fileEntries = [];
  for (const entry of fileEntries) {
    if (candidates.length >= maxFiles) break;

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

  // Update progress: candidates known, start processing
  if (currentProgress) {
    currentProgress.totalFiles += candidates.length;
    currentProgress.status = 'processing';
    currentProgress.updatedAt = Math.floor(Date.now() / 1000);
  }

  // Process candidates based on target type
  if (rule.targetType === 'archive' && rule.archiveLocationId) {
    for (const candidate of candidates) {
      // Update progress: current file
      if (currentProgress) {
        currentProgress.currentFile = `${spaceName}/${candidate.path}`;
        currentProgress.updatedAt = Math.floor(Date.now() / 1000);
      }

      try {
        const absPath = resolveSpacePath(spaceName, spaceType, candidate.path);
        const isStub = await archiveService.isStubFile(absPath);
        if (isStub) {
          filesSkipped++;
          if (currentProgress) { currentProgress.filesSkipped++; updateProgressPercent(); }
          maybeFlushProgressToDb(logId);
          continue;
        }

        if (rule.sourceGoal) {
          const currentGoal = await efsCli.getGoal(absPath);
          if (currentGoal !== rule.sourceGoal) {
            filesSkipped++;
            if (currentProgress) { currentProgress.filesSkipped++; updateProgressPercent(); }
            maybeFlushProgressToDb(logId);
            continue;
          }
        }

        await archiveService.archiveFile(spaceName, candidate.path, rule.archiveLocationId, 'tiering-scheduler');
        filesProcessed++;
        bytesProcessed += candidate.size;
        if (currentProgress) {
          currentProgress.filesProcessed++;
          currentProgress.bytesProcessed += candidate.size;
          updateProgressPercent();
        }
      } catch (err) {
        filesFailed++;
        if (currentProgress) { currentProgress.filesFailed++; updateProgressPercent(); }
        const msg = err instanceof Error ? err.message : String(err);
        if (errors.length < 50) errors.push(`[${spaceName}] ${candidate.path}: ${msg}`);
        logger.warn({ err, path: candidate.path, space: spaceName }, 'Failed to archive file');
      }
      maybeFlushProgressToDb(logId);
    }
  } else {
    for (const candidate of candidates) {
      // Update progress: current file
      if (currentProgress) {
        currentProgress.currentFile = `${spaceName}/${candidate.path}`;
        currentProgress.updatedAt = Math.floor(Date.now() / 1000);
      }

      try {
        const absPath = resolveSpacePath(spaceName, spaceType, candidate.path);

        if (rule.sourceGoal) {
          const currentGoal = await efsCli.getGoal(absPath);
          if (currentGoal !== rule.sourceGoal) {
            filesSkipped++;
            if (currentProgress) { currentProgress.filesSkipped++; updateProgressPercent(); }
            maybeFlushProgressToDb(logId);
            continue;
          }
        }

        if (rule.targetGoal) {
          await efsCli.setGoal(rule.targetGoal, [absPath], false);
        }
        filesProcessed++;
        bytesProcessed += candidate.size;
        if (currentProgress) {
          currentProgress.filesProcessed++;
          currentProgress.bytesProcessed += candidate.size;
          updateProgressPercent();
        }
      } catch (err) {
        filesFailed++;
        if (currentProgress) { currentProgress.filesFailed++; updateProgressPercent(); }
        const msg = err instanceof Error ? err.message : String(err);
        if (errors.length < 50) errors.push(`[${spaceName}] ${candidate.path}: ${msg}`);
        logger.warn({ err, path: candidate.path, space: spaceName }, 'Failed to tier file');
      }
      maybeFlushProgressToDb(logId);
    }
  }

  return { filesProcessed, filesSkipped, filesFailed, bytesProcessed, errors };
}

// ──────────────────────────────────────────────
// Rule execution (multi-space)
// ──────────────────────────────────────────────

async function executeRule(rule: ITieringRule): Promise<void> {
  const logId = tieringStore.createExecutionLog(rule.id);
  const maxFiles = getMaxFilesPerRun();
  const now0 = Math.floor(Date.now() / 1000);

  // Initialize live progress
  currentProgress = {
    logId,
    ruleId: rule.id,
    ruleName: rule.name,
    status: 'enumerating',
    totalFiles: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    filesFailed: 0,
    bytesProcessed: 0,
    currentFile: null,
    currentSpace: null,
    startedAt: now0,
    updatedAt: now0,
    percentComplete: 0,
  };
  lastDbFlushAt = Date.now();
  lastDbFlushCount = 0;

  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalBytes = 0;
  const allErrors: string[] = [];

  try {
    // Resolve which spaces this rule targets
    const spaces = await resolveSpacesFromSelector(rule.spaceSelector);

    if (spaces.length === 0) {
      logger.warn({ ruleId: rule.id, name: rule.name }, 'No spaces matched for tiering rule');
      tieringStore.updateExecutionLog(logId, {
        filesProcessed: 0, filesSkipped: 0, filesFailed: 0, bytesProcessed: 0,
        status: 'completed',
      });
      const now = Math.floor(Date.now() / 1000);
      tieringStore.updateRuleRunStatus(rule.id, now, 0, 0, now + getIntervalMinutes() * 60);
      currentProgress = null;
      return;
    }

    logger.info(
      { ruleId: rule.id, name: rule.name, spaceCount: spaces.length, spaces: spaces.map((s) => s.name) },
      `Executing tiering rule "${rule.name}" across ${spaces.length} space(s)`,
    );

    let remainingFiles = maxFiles;

    for (const space of spaces) {
      if (remainingFiles <= 0) break;

      try {
        const result = await executeRuleForSpace(rule, space.name, space.type, remainingFiles, logId);
        totalProcessed += result.filesProcessed;
        totalSkipped += result.filesSkipped;
        totalFailed += result.filesFailed;
        totalBytes += result.bytesProcessed;
        allErrors.push(...result.errors);
        remainingFiles -= result.filesProcessed;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        allErrors.push(`[${space.name}] ${msg}`);
        logger.warn({ err, space: space.name, ruleId: rule.id }, `Failed to execute rule for space: ${space.name}`);
      }
    }

    // Update execution log
    tieringStore.updateExecutionLog(logId, {
      filesProcessed: totalProcessed,
      filesSkipped: totalSkipped,
      filesFailed: totalFailed,
      bytesProcessed: totalBytes,
      errors: allErrors.length > 0 ? allErrors : undefined,
      status: 'completed',
    });

    // Update rule run status
    const now = Math.floor(Date.now() / 1000);
    const nextRun = now + getIntervalMinutes() * 60;
    tieringStore.updateRuleRunStatus(rule.id, now, totalProcessed, totalFailed, nextRun);

    logger.info(
      { ruleId: rule.id, name: rule.name, spaces: spaces.length, totalProcessed, totalSkipped, totalFailed, totalBytes },
      `Tiering rule completed: ${rule.name}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    allErrors.push(msg);

    tieringStore.updateExecutionLog(logId, {
      filesProcessed: totalProcessed,
      filesSkipped: totalSkipped,
      filesFailed: totalFailed,
      bytesProcessed: totalBytes,
      errors: allErrors,
      status: 'failed',
    });

    tieringStore.updateRule(rule.id, { status: 'error' });
    logger.error({ err, ruleId: rule.id, name: rule.name }, `Tiering rule failed: ${rule.name}`);
  } finally {
    // Always clear progress when done
    currentProgress = null;
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

  // Mark any stale running logs from a previous crash
  tieringStore.markStaleRunningLogs();

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
