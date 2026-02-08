import { getDatabase } from '../db/index.js';
import { logger } from '../utils/logger.js';
import type {
  ITieringRule,
  ICreateTieringRuleRequest,
  IUpdateTieringRuleRequest,
  ITieringExecutionLog,
} from '../../../shared/types/tiering.js';

// ──────────────────────────────────────────────
// Tiering Rules CRUD
// ──────────────────────────────────────────────

interface RuleRow {
  id: number;
  space_name: string;
  name: string;
  description: string | null;
  source_goal: string;
  target_goal: string;
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

function rowToRule(row: RuleRow): ITieringRule {
  return {
    id: row.id,
    spaceName: row.space_name,
    name: row.name,
    description: row.description || undefined,
    sourceGoal: row.source_goal,
    targetGoal: row.target_goal,
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
    const stmt = db.prepare(`
      SELECT * FROM tiering_rules WHERE space_name = ? ORDER BY name
    `);
    return (stmt.all(spaceName) as RuleRow[]).map(rowToRule);
  }

  const stmt = db.prepare(`SELECT * FROM tiering_rules ORDER BY space_name, name`);
  return (stmt.all() as RuleRow[]).map(rowToRule);
}

export function getRule(id: number): ITieringRule | null {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM tiering_rules WHERE id = ?`);
  const row = stmt.get(id) as RuleRow | undefined;
  return row ? rowToRule(row) : null;
}

export function createRule(request: ICreateTieringRuleRequest): ITieringRule {
  const db = getDatabase();

  // Compute initial next_run_at (next hour boundary)
  const nextRunAt = Math.floor(Date.now() / 1000) + 3600;

  const stmt = db.prepare(`
    INSERT INTO tiering_rules (
      space_name, name, description, source_goal, target_goal,
      condition, operator, value, recursive, path_pattern, next_run_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    request.spaceName,
    request.name,
    request.description || null,
    request.sourceGoal,
    request.targetGoal,
    request.condition,
    request.operator,
    request.value,
    request.recursive ? 1 : 0,
    request.pathPattern || null,
    nextRunAt,
  );

  const ruleId = Number(result.lastInsertRowid);
  logger.info({ ruleId, spaceName: request.spaceName, name: request.name }, 'Tiering rule created');

  return getRule(ruleId)!;
}

export function updateRule(id: number, request: IUpdateTieringRuleRequest): ITieringRule | null {
  const db = getDatabase();

  // Build dynamic update
  const sets: string[] = ['updated_at = unixepoch()'];
  const params: unknown[] = [];

  if (request.name !== undefined) { sets.push('name = ?'); params.push(request.name); }
  if (request.description !== undefined) { sets.push('description = ?'); params.push(request.description || null); }
  if (request.sourceGoal !== undefined) { sets.push('source_goal = ?'); params.push(request.sourceGoal); }
  if (request.targetGoal !== undefined) { sets.push('target_goal = ?'); params.push(request.targetGoal); }
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
  const stmt = db.prepare(`SELECT * FROM tiering_rules WHERE status = 'active' ORDER BY next_run_at`);
  return (stmt.all() as RuleRow[]).map(rowToRule);
}

export function getDueRules(now: number): ITieringRule[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM tiering_rules
    WHERE status = 'active' AND (next_run_at IS NULL OR next_run_at <= ?)
    ORDER BY next_run_at
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
