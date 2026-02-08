import { getEsApiClient } from './editshare-api/client.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/errors.js';
import * as efsCli from './efs-cli/commands.js';
import { getSpaceInfo } from './filesystem.service.js';
import type { IStorageGoal } from '../../../shared/types/goals.js';

/**
 * Raw storage goal from ES REST API.
 * GET /api/v1/storage/storage_goals
 */
interface ESStorageGoal {
  id: number;
  name: string;
  is_used: boolean;
  writeable: boolean;
  definition: string;
  storage_efficiency?: string;
  satisfiable?: boolean;
}

/**
 * Lists all available storage goals.
 * Tries ES REST API first, falls back to efs-admin CLI.
 */
export async function listStorageGoals(): Promise<IStorageGoal[]> {
  try {
    const client = getEsApiClient();
    const response = await client.get<ESStorageGoal[]>('/api/v1/storage/storage_goals');
    return response.data.map((g) => ({
      id: g.id,
      name: g.name,
      isUsed: g.is_used,
      writeable: g.writeable,
      definition: g.definition,
    }));
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch goals from ES API, falling back to CLI');
    // Fall back to efs-admin list-goals
    try {
      return await efsCli.listGoals();
    } catch (cliErr) {
      logger.error({ cliErr }, 'Failed to fetch goals from CLI');
      throw new ApiError('Failed to list storage goals');
    }
  }
}

/**
 * Get the storage goal for a space's Content root.
 */
export async function getSpaceGoal(spaceName: string): Promise<string> {
  const space = await getSpaceInfo(spaceName);
  const { resolveSpacePath } = await import('../utils/path-security.js');
  const contentRoot = resolveSpacePath(spaceName, space.type);
  return efsCli.getGoal(contentRoot);
}

/**
 * Set the storage goal for a space's Content root.
 */
export async function setSpaceGoal(
  spaceName: string,
  goalName: string,
  recursive = false,
): Promise<void> {
  const space = await getSpaceInfo(spaceName);
  const { resolveSpacePath } = await import('../utils/path-security.js');
  const contentRoot = resolveSpacePath(spaceName, space.type);
  await efsCli.setGoal(goalName, [contentRoot], recursive);
  logger.info({ spaceName, goalName, recursive }, 'Space goal updated');
}
