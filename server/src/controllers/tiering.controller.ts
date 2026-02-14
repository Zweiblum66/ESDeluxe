import type { Request, Response } from 'express';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import * as tieringStore from '../services/tiering-rules.store.js';
import * as tieringScheduler from '../services/tiering-scheduler.service.js';
import type { ISpaceSelector } from '../../../shared/types/tiering.js';

const VALID_SPACE_TYPES = ['avidstyle', 'avidmxf', 'managed', 'unmanaged', 'acl'];
const VALID_CONDITIONS = ['last_access', 'last_modified', 'file_size', 'file_extension'];
const VALID_OPERATORS = ['older_than_hours', 'older_than_days', 'older_than_weeks', 'older_than_months', 'larger_than_bytes', 'matches', 'not_matches'];
const TIME_OPERATORS = ['older_than_hours', 'older_than_days', 'older_than_weeks', 'older_than_months'];

const VALID_OPERATORS_BY_CONDITION: Record<string, string[]> = {
  last_access: TIME_OPERATORS,
  last_modified: TIME_OPERATORS,
  file_size: ['larger_than_bytes'],
  file_extension: ['matches', 'not_matches'],
};

function validateSpaceSelector(selector: unknown): ISpaceSelector {
  if (!selector || typeof selector !== 'object') {
    throw new ValidationError('Invalid spaceSelector');
  }

  const s = selector as Record<string, unknown>;
  switch (s.mode) {
    case 'explicit':
      if (!Array.isArray(s.spaceNames) || s.spaceNames.length === 0) {
        throw new ValidationError('spaceSelector.spaceNames must be a non-empty array');
      }
      if (s.spaceNames.some((n: unknown) => typeof n !== 'string' || !n)) {
        throw new ValidationError('spaceSelector.spaceNames must contain non-empty strings');
      }
      return { mode: 'explicit', spaceNames: s.spaceNames as string[] };

    case 'by_type':
      if (!Array.isArray(s.spaceTypes) || s.spaceTypes.length === 0) {
        throw new ValidationError('spaceSelector.spaceTypes must be a non-empty array');
      }
      for (const t of s.spaceTypes as unknown[]) {
        if (typeof t !== 'string' || !VALID_SPACE_TYPES.includes(t)) {
          throw new ValidationError(`Invalid space type: ${t}`);
        }
      }
      return { mode: 'by_type', spaceTypes: s.spaceTypes as string[] } as ISpaceSelector;

    case 'pattern':
      if (typeof s.namePattern !== 'string' || !s.namePattern) {
        throw new ValidationError('spaceSelector.namePattern must be a non-empty string');
      }
      try {
        new RegExp(s.namePattern);
      } catch {
        throw new ValidationError(`Invalid regex pattern: ${s.namePattern}`);
      }
      return { mode: 'pattern', namePattern: s.namePattern };

    case 'all':
      return { mode: 'all' };

    default:
      throw new ValidationError(`Invalid spaceSelector.mode: ${s.mode}`);
  }
}

function getParamId(req: Request): number {
  const val = req.params.id;
  const str = Array.isArray(val) ? val[0] : val;
  const id = parseInt(str, 10);
  if (isNaN(id)) throw new ValidationError('Invalid rule ID');
  return id;
}

// ──────────────────────────────────────────────
// Rules CRUD
// ──────────────────────────────────────────────

export async function listRules(req: Request, res: Response): Promise<void> {
  const spaceName = req.query.spaceName as string | undefined;
  const rules = tieringStore.listRules(spaceName);
  res.json({ data: rules });
}

export async function getRule(req: Request, res: Response): Promise<void> {
  const id = getParamId(req);
  if (isNaN(id)) throw new ValidationError('Invalid rule ID');

  const rule = tieringStore.getRule(id);
  if (!rule) throw new NotFoundError('Tiering rule', String(id));

  res.json({ data: rule });
}

export async function createRule(req: Request, res: Response): Promise<void> {
  const { spaceName, spaceSelector, name, sourceGoal, targetGoal, condition, operator, value, targetType, archiveLocationId } = req.body;

  // Validate space selector (accept new or legacy format)
  let resolvedSelector: ISpaceSelector;
  if (spaceSelector) {
    resolvedSelector = validateSpaceSelector(spaceSelector);
  } else if (spaceName) {
    resolvedSelector = { mode: 'explicit', spaceNames: [spaceName] };
  } else {
    throw new ValidationError('spaceSelector or spaceName is required');
  }

  if (!name) throw new ValidationError('name is required');
  if (!condition) throw new ValidationError('condition is required');
  if (!VALID_CONDITIONS.includes(condition)) throw new ValidationError(`Invalid condition: ${condition}`);
  if (!operator) throw new ValidationError('operator is required');
  if (!VALID_OPERATORS.includes(operator)) throw new ValidationError(`Invalid operator: ${operator}`);
  const allowedOps = VALID_OPERATORS_BY_CONDITION[condition];
  if (allowedOps && !allowedOps.includes(operator)) {
    throw new ValidationError(`Operator '${operator}' is not valid for condition '${condition}'`);
  }
  if (value === undefined || value === '') throw new ValidationError('value is required');

  // Validate based on target type
  const effectiveTargetType = targetType || 'goal_change';
  if (effectiveTargetType === 'archive') {
    if (!archiveLocationId) throw new ValidationError('archiveLocationId is required for archive rules');
  } else {
    if (!sourceGoal) throw new ValidationError('sourceGoal is required for goal change rules');
    if (!targetGoal) throw new ValidationError('targetGoal is required for goal change rules');
  }

  const rule = tieringStore.createRule({
    spaceSelector: resolvedSelector,
    name,
    description: req.body.description,
    targetType: effectiveTargetType,
    sourceGoal: sourceGoal || undefined,
    targetGoal: targetGoal || undefined,
    archiveLocationId: archiveLocationId || undefined,
    condition,
    operator,
    value: String(value),
    recursive: req.body.recursive ?? true,
    pathPattern: req.body.pathPattern,
  });

  res.status(201).json({ data: rule });
}

export async function updateRule(req: Request, res: Response): Promise<void> {
  const id = getParamId(req);

  // Validate spaceSelector if provided
  const body = { ...req.body };
  if (body.spaceSelector) {
    body.spaceSelector = validateSpaceSelector(body.spaceSelector);
  }

  const rule = tieringStore.updateRule(id, body);
  if (!rule) throw new NotFoundError('Tiering rule', String(id));

  res.json({ data: rule });
}

export async function deleteRule(req: Request, res: Response): Promise<void> {
  const id = getParamId(req);

  const deleted = tieringStore.deleteRule(id);
  if (!deleted) throw new NotFoundError('Tiering rule', String(id));

  res.json({ message: 'Rule deleted' });
}

// ──────────────────────────────────────────────
// Manual execution
// ──────────────────────────────────────────────

export async function triggerRule(req: Request, res: Response): Promise<void> {
  const id = getParamId(req);

  await tieringScheduler.triggerRule(id);
  res.json({ message: 'Rule execution triggered' });
}

// ──────────────────────────────────────────────
// Logs
// ──────────────────────────────────────────────

export async function getRuleLogs(req: Request, res: Response): Promise<void> {
  const id = getParamId(req);

  const limit = parseInt(req.query.limit as string, 10) || 20;
  const logs = tieringStore.getRuleLogs(id, limit);
  res.json({ data: logs });
}

export async function getRecentLogs(req: Request, res: Response): Promise<void> {
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const logs = tieringStore.getRecentLogs(limit);
  res.json({ data: logs });
}

// ──────────────────────────────────────────────
// Scheduler status
// ──────────────────────────────────────────────

export async function getSchedulerStatus(_req: Request, res: Response): Promise<void> {
  const status = tieringScheduler.getSchedulerStatus();
  res.json({ data: status });
}

// ──────────────────────────────────────────────
// Live progress
// ──────────────────────────────────────────────

export async function getProgress(_req: Request, res: Response): Promise<void> {
  const progress = tieringScheduler.getCurrentProgress();
  res.json({ data: progress });
}
