import type { Request, Response } from 'express';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import * as tieringStore from '../services/tiering-rules.store.js';
import * as tieringScheduler from '../services/tiering-scheduler.service.js';

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
  const { spaceName, name, sourceGoal, targetGoal, condition, operator, value } = req.body;

  if (!spaceName) throw new ValidationError('spaceName is required');
  if (!name) throw new ValidationError('name is required');
  if (!sourceGoal) throw new ValidationError('sourceGoal is required');
  if (!targetGoal) throw new ValidationError('targetGoal is required');
  if (!condition) throw new ValidationError('condition is required');
  if (!operator) throw new ValidationError('operator is required');
  if (value === undefined || value === '') throw new ValidationError('value is required');

  const rule = tieringStore.createRule({
    spaceName,
    name,
    description: req.body.description,
    sourceGoal,
    targetGoal,
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

  const rule = tieringStore.updateRule(id, req.body);
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
