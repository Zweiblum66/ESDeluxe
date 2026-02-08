import type { Request, Response } from 'express';
import { ValidationError } from '../utils/errors.js';
import * as goalsService from '../services/goals.service.js';

/**
 * GET /api/v1/goals
 * List all available storage goals.
 */
export async function listGoals(_req: Request, res: Response): Promise<void> {
  const goals = await goalsService.listStorageGoals();
  res.json({ data: goals });
}

/**
 * GET /api/v1/spaces/:name/goal
 * Get the storage goal for a space's Content root.
 */
export async function getSpaceGoal(req: Request, res: Response): Promise<void> {
  const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  const goal = await goalsService.getSpaceGoal(name);
  res.json({ data: { spaceName: name, currentGoal: goal } });
}

/**
 * PUT /api/v1/spaces/:name/goal
 * Set the storage goal for a space's Content root.
 */
export async function setSpaceGoal(req: Request, res: Response): Promise<void> {
  const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  const { goalName, recursive } = req.body;

  if (!goalName) {
    throw new ValidationError('goalName is required');
  }

  await goalsService.setSpaceGoal(name, goalName, recursive);
  res.json({ message: `Space goal set to '${goalName}'${recursive ? ' (recursive)' : ''}` });
}
