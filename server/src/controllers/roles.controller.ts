import type { Request, Response } from 'express';
import {
  getSpaceManagers,
  getAllSpaceManagerAssignments,
  assignUserAsManager,
  removeUserAsManager,
  assignGroupAsManager,
  removeGroupAsManager,
} from '../services/space-manager.store.js';
import { getGroupMembers } from '../services/editshare-api/groups.service.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { IManageSpaceManagerRequest, ISpaceManagersResponse } from '../../../shared/types/roles.js';

/** Extract :name param safely (Express v5 params can be string | string[]) */
function getSpaceName(req: Request): string {
  const val = req.params.name;
  return Array.isArray(val) ? val[0] : val;
}

/**
 * GET /api/v1/roles
 * List all space manager assignments across all spaces.
 */
export async function listAll(_req: Request, res: Response): Promise<void> {
  const { users, groups } = getAllSpaceManagerAssignments();

  // Group by space
  const bySpace = new Map<string, ISpaceManagersResponse>();

  for (const u of users) {
    if (!bySpace.has(u.space_name)) {
      bySpace.set(u.space_name, { spaceName: u.space_name, users: [], groups: [] });
    }
    bySpace.get(u.space_name)!.users.push({
      username: u.username,
      assignedAt: u.created_at,
    });
  }

  for (const g of groups) {
    if (!bySpace.has(g.space_name)) {
      bySpace.set(g.space_name, { spaceName: g.space_name, users: [], groups: [] });
    }
    // Try to get member count
    let memberCount: number | undefined;
    try {
      const members = await getGroupMembers(g.group_name);
      memberCount = members.length;
    } catch {
      // ignore — member count is optional
    }
    bySpace.get(g.space_name)!.groups.push({
      groupName: g.group_name,
      assignedAt: g.created_at,
      memberCount,
    });
  }

  res.json({ data: Array.from(bySpace.values()) });
}

/**
 * GET /api/v1/roles/spaces/:name
 * Get managers for a specific space.
 */
export async function getSpaceManagersHandler(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const { users, groups } = getSpaceManagers(spaceName);

  const response: ISpaceManagersResponse = {
    spaceName,
    users: users.map((u) => ({
      username: u.username,
      assignedAt: u.created_at,
    })),
    groups: [],
  };

  // Enrich groups with member count
  for (const g of groups) {
    let memberCount: number | undefined;
    try {
      const members = await getGroupMembers(g.group_name);
      memberCount = members.length;
    } catch {
      // ignore
    }
    response.groups.push({
      groupName: g.group_name,
      assignedAt: g.created_at,
      memberCount,
    });
  }

  res.json({ data: response });
}

/**
 * POST /api/v1/roles/spaces/:name
 * Assign a user or group as space manager.
 */
export async function assignManager(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const { assigneeType, assigneeName } = req.body as IManageSpaceManagerRequest;

  if (!assigneeType || !assigneeName) {
    throw new ValidationError('assigneeType and assigneeName are required');
  }

  if (assigneeType !== 'user' && assigneeType !== 'group') {
    throw new ValidationError('assigneeType must be "user" or "group"');
  }

  const assignedBy = req.user?.username;

  if (assigneeType === 'user') {
    assignUserAsManager(spaceName, assigneeName);
    logger.info({ spaceName, username: assigneeName, assignedBy }, 'User assigned as space manager');
  } else {
    assignGroupAsManager(spaceName, assigneeName, assignedBy);
    logger.info({ spaceName, groupName: assigneeName, assignedBy }, 'Group assigned as space manager');
  }

  res.json({ data: { spaceName, assigneeType, assigneeName, status: 'assigned' } });
}

/**
 * DELETE /api/v1/roles/spaces/:name
 * Remove a user or group as space manager.
 */
export async function removeManager(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const { assigneeType, assigneeName } = req.body as IManageSpaceManagerRequest;

  if (!assigneeType || !assigneeName) {
    throw new ValidationError('assigneeType and assigneeName are required');
  }

  if (assigneeType !== 'user' && assigneeType !== 'group') {
    throw new ValidationError('assigneeType must be "user" or "group"');
  }

  if (assigneeType === 'user') {
    removeUserAsManager(spaceName, assigneeName);
    logger.info({ spaceName, username: assigneeName }, 'User removed as space manager');
  } else {
    removeGroupAsManager(spaceName, assigneeName);
    logger.info({ spaceName, groupName: assigneeName }, 'Group removed as space manager');
  }

  res.json({ data: { spaceName, assigneeType, assigneeName, status: 'removed' } });
}
