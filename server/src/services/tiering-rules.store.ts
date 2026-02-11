import { getDatabase } from '../db/index.js';
import { logger } from '../utils/logger.js';
import type {
  ITieringRule,
  ICreateTieringRuleRequest,
  IUpdateTieringRuleRequest,
  ITieringExecutionLog,
  TieringTargetType,
  ISpaceSelector,
} from '../../../shared/types/tiering.js';

// ──────────────────────────────────────────────
// Tiering Rules CRUD
// ──────────────────────────────────────────────

interface RuleRow {
  id: number;
  space_name: string | null;
  space_selector: string | null;
  name: string;
  description: string | null;
  target_type: string;
  source_goal: string | null;
  target_goal: string | null;
  archive_location_id: number | null;
  archive_location_name?: string;
  condition: string;
  operator: string;
  value: string;
  recursive: number;
  path_pattern: string | null;
  status: string;
  last_run_at: number | null;
  last_run_files: number | null;
  last_run_errors: number | null;
  next_run_at: number | null;
  created_at: number;
  updated_at: number;
}

function parseSpaceSelector(row: RuleRow): ISpaceSelector {
  if (row.space_selector) {
    try {
      return JSON.parse(row.space_selector) as ISpaceSelector;
    } catch {
      // Fallback for corrupt JSON
    }
  }
  // Legacy fallback: construct from space_name
  if (row.space_name) {
    return { mode: 'explicit', spaceNames: [row.space_name] };
  }
  return { mode: 'explicit', spaceNames: [] };
}

function selectorToSpaceName(selector: ISpaceSelector): string | null {
  if (selector.mode === 'explicit' && selector.spaceNames.length === 1) {
    return selector.spaceNames[0];
  }
  return null;
}

function rowToRule(row: RuleRow): ITieringRule {
  const spaceSelector = parseSpaceSelector(row);
  return {
    id: row.id,
    spaceSelector,
    spaceName: selectorToSpaceName(spaceSelector) || undefined,
    name: row.name,
    description: row.description || undefined,
    targetType: (row.target_type || 'goal_change') as TieringTargetType,
    sourceGoal: row.source_goal || undefined,
    targetGoal: row.target_goal || undefined,
    archiveLocationId: row.archive_location_id || undefined,
    archiveLocationName: row.archive_location_name || undefined,
    condition: row.condition as ITieringRule['condition'],
    operator: row.operator as ITieringRule['operator'],
    value: row.value,
    recursive: !!row.recursive,
    pathPattern: row.path_pattern || undefined,
    status: row.status as ITieringRule['status'],
    lastRunAt: row.last_run_at || undefined,
    lastRunFiles: row.last_run_files || undefined,
    lastRunErrors: row.last_run_errors || undefined,
    nextRunAt: row.next_run_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listRules(spaceName?: string): ITieringRule[] {
  const db = getDatabase();

  if (spaceName) {
    // Match rules that reference this space explicitly, or target all/by_type/pattern
    const stmt = db.prepare(`
      SELECT r.*, al.name as archive_location_name
      FROM tiering_rules r
      LEFT JOIN archive_locations al ON al.id = r.archive_location_id
      WHERE r.space_name = ?
        OR json_extract(r.space_selector, '$.mode') IN ('all', 'by_type', 'pattern')
        OR (json_extract(r.space_selector, '$.mode') = 'explicit'
            AND EXISTS (
              SELECT 1 FROM json_each(json_extract(r.space_selector, '$.spaceNames'))
              WHERE json_each.value = ?
            ))
      ORDER BY r.name
    `);
    return (stmt.all(spaceName, spaceName) as RuleRow[]).map(rowToRule);
  }

  const stmt = db.prepare(`
    SELECT r.*, al.name as archive_location_name
    FROM tiering_rules r
    LEFT JOIN archive_locations al ON al.id = r.archive_location_id
    ORDER BY r.name
  `);
  return (stmt.all() as RuleRow[]).map(rowToRule);
}

export function getRule(id: number): ITieringRule | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT r.*, al.name as archive_location_name
    FROM tiering_rules r
    LEFT JOIN archive_locations al ON al.id = r.archive_location_id
    WHERE r.id = ?
  `);
  const row = stmt.get(id) as RuleRow | undefined;
  return row ? rowToRule(row) : null;
}

export function createRule(request: ICreateTieringRuleRequest): ITieringRule {
  const db = getDatabase();

  // Normalize selector — support deprecated spaceName field
  const selector: ISpaceSelector = request.spaceSelector
    ?? { mode: 'explicit', spaceNames: [request.spaceName!] };
  const selectorJson = JSON.stringify(selector);
  const denormalizedSpaceName = selectorToSpaceName(selector);

  // Compute initial next_run_at (next hour boundary)
  const nextRunAt = Math.floor(Date.now() / 1000) + 3600;

  const stmt = db.prepare(`
    INSERT INTO tiering_rules (
      space_name, space_selector, name, description, target_type, source_goal, target_goal,
      archive_location_id, condition, operator, value, recursive, path_pattern, next_run_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    denormalizedSpaceName,
    selectorJson,
    request.name,
    request.description || null,
    request.targetType || 'goal_change',
    request.sourceGoal || null,
    request.targetGoal || null,
    request.archiveLocationId || null,
    request.condition,
    request.operator,
    request.value,
    request.recursive ? 1 : 0,
    request.pathPattern || null,
    nextRunAt,
  );

  const ruleId = Number(result.lastInsertRowid);
  logger.info({ ruleId, selector: selector.mode, name: request.name }, 'Tiering rule created');

  return getRule(ruleId)!;
}

export function updateRule(id: number, request: IUpdateTieringRuleRequest): ITieringRule | null {
  const db = getDatabase();

  // Build dynamic update
  const sets: string[] = ['updated_at = unixepoch()'];
  const params: unknown[] = [];

  if (request.spaceSelector !== undefined) {
    const selectorJson = JSON.stringify(request.spaceSelector);
    sets.push('space_selector = ?');
    params.push(selectorJson);
    sets.push('space_name = ?');
    params.push(selectorToSpaceName(request.spaceSelector));
  }
  if (request.name !== undefined) { sets.push('name = ?'); params.push(request.name); }
  if (request.description !== undefined) { sets.push('description = ?'); params.push(request.description || null); }
  if (request.targetType !== undefined) { sets.push('target_type = ?'); params.push(request.targetType); }
  if (request.sourceGoal !== undefined) { sets.push('source_goal = ?'); params.push(request.sourceGoal); }
  if (request.targetGoal !== undefined) { sets.push('target_goal = ?'); params.push(request.targetGoal); }
  if (request.archiveLocationId !== undefined) { sets.push('archive_location_id = ?'); params.push(request.archiveLocationId || null); }
  if (request.condition !== undefined) { sets.push('condition = ?'); params.push(request.condition); }
  if (request.operator !== undefined) { sets.push('operator = ?'); params.push(request.operator); }
  if (request.value !== undefined) { sets.push('value = ?'); params.push(request.value); }
  if (request.recursive !== undefined) { sets.push('recursive = ?'); params.push(request.recursive ? 1 : 0); }
  if (request.pathPattern !== undefined) { sets.push('path_pattern = ?'); params.push(request.pathPattern || null); }
  if (request.status !== undefined) { sets.push('status = ?'); params.push(request.status); }

  params.push(id);

  const stmt = db.prepare(`UPDATE tiering_rules SET ${sets.join(', ')} WHERE id = ?`);
  const result = stmt.run(...params);

  if (result.changes === 0) return null;

  logger.info({ ruleId: id }, 'Tiering rule updated');
  return getRule(id);
}

export function deleteRule(id: number): boolean {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM tiering_rules WHERE id = ?`);
  const result = stmt.run(id);
  if (result.changes > 0) {
    logger.info({ ruleId: id }, 'Tiering rule deleted');
  }
  return result.changes > 0;
}

export function updateRuleRunStatus(
  id: number,
  lastRunAt: number,
  filesProcessed: number,
  errors: number,
  nextRunAt: number,
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE tiering_rules SET
      last_run_at = ?, last_run_files = ?, last_run_errors = ?,
      next_run_at = ?, updated_at = unixepoch()
    WHERE id = ?
  `);
  stmt.run(lastRunAt, filesProcessed, errors, nextRunAt, id);
}

export function getActiveRules(): ITieringRule[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT r.*, al.name as archive_location_name
    FROM tiering_rules r
    LEFT JOIN archive_locations al ON al.id = r.archive_location_id
    WHERE r.status = 'active' ORDER BY r.next_run_at
  `);
  return (stmt.all() as RuleRow[]).map(rowToRule);
}

export function getDueRules(now: number): ITieringRule[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT r.*, al.name as archive_location_name
    FROM tiering_rules r
    LEFT JOIN archive_locations al ON al.id = r.archive_location_id
    WHERE r.status = 'active' AND (r.next_run_at IS NULL OR r.next_run_at <= ?)
    ORDER BY r.next_run_at
  `);
  return (stmt.all(now) as RuleRow[]).map(rowToRule);
}

// ──────────────────────────────────────────────
// Execution Logs
// ──────────────────────────────────────────────

interface LogRow {
  id: number;
  rule_id: number;
  started_at: number;
  completed_at: number | null;
  files_processed: number;
  files_skipped: number;
  files_failed: number;
  bytes_processed: number;
  errors: string | null;
  status: string;
}

function rowToLog(row: LogRow): ITieringExecutionLog {
  return {
    id: row.id,
    ruleId: row.rule_id,
    startedAt: row.started_at,
    completedAt: row.completed_at || undefined,
    filesProcessed: row.files_processed,
    filesSkipped: row.files_skipped,
    filesFailed: row.files_failed,
    bytesProcessed: row.bytes_processed,
    errors: row.errors ? JSON.parse(row.errors) : undefined,
    status: row.status as ITieringExecutionLog['status'],
  };
}

export function createExecutionLog(ruleId: number): number {
  const db = getDatabase();
  const stmt = db.prepare(`INSERT INTO tiering_execution_log (rule_id) VALUES (?)`);
  const result = stmt.run(ruleId);
  return Number(result.lastInsertRowid);
}

export function updateExecutionLog(
  logId: number,
  update: {
    filesProcessed?: number;
    filesSkipped?: number;
    filesFailed?: number;
    bytesProcessed?: number;
    errors?: string[];
    status?: string;
  },
): void {
  const db = getDatabase();

  const sets: string[] = ['completed_at = unixepoch()'];
  const params: unknown[] = [];

  if (update.filesProcessed !== undefined) { sets.push('files_processed = ?'); params.push(update.filesProcessed); }
  if (update.filesSkipped !== undefined) { sets.push('files_skipped = ?'); params.push(update.filesSkipped); }
  if (update.filesFailed !== undefined) { sets.push('files_failed = ?'); params.push(update.filesFailed); }
  if (update.bytesProcessed !== undefined) { sets.push('bytes_processed = ?'); params.push(update.bytesProcessed); }
  if (update.errors !== undefined) { sets.push('errors = ?'); params.push(JSON.stringify(update.errors)); }
  if (update.status !== undefined) { sets.push('status = ?'); params.push(update.status); }

  params.push(logId);

  const stmt = db.prepare(`UPDATE tiering_execution_log SET ${sets.join(', ')} WHERE id = ?`);
  stmt.run(...params);
}

export function getRuleLogs(ruleId: number, limit = 20): ITieringExecutionLog[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM tiering_execution_log
    WHERE rule_id = ? ORDER BY started_at DESC LIMIT ?
  `);
  return (stmt.all(ruleId, limit) as LogRow[]).map(rowToLog);
}

export function getRecentLogs(limit = 50): ITieringExecutionLog[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM tiering_execution_log
    ORDER BY started_at DESC LIMIT ?
  `);
  return (stmt.all(limit) as LogRow[]).map(rowToLog);
}

export function cleanOldLogs(retentionDays: number): number {
  const db = getDatabase();
  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86400;
  const stmt = db.prepare(`
    DELETE FROM tiering_execution_log WHERE started_at < ?
  `);
  const result = stmt.run(cutoff);
  return result.changes;
}
