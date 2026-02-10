import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.js';
import { isUserSpaceManager } from '../services/space-manager.store.js';
import { logger } from '../utils/logger.js';

/**
 * Extracts space name from Express v5 route params.
 * Handles the case where params can be string | string[].
 */
function extractSpaceName(req: Request): string | null {
  const val = req.params.name;
  if (!val) return null;
  return Array.isArray(val) ? val[0] : val;
}

/**
 * Middleware that requires the user to be either a global admin
 * or a space manager for the space identified by req.params.name.
 *
 * Use this instead of requireAdmin on endpoints that space managers
 * should be able to access (e.g., user/group management on a space,
 * quota changes, goal setting).
 */
export function requireSpaceManagement() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // Global admins bypass all checks
    if (req.user?.isAdmin) {
      next();
      return;
    }

    if (!req.user) {
      next(new ForbiddenError('Authentication required'));
      return;
    }

    const spaceName = extractSpaceName(req);
    if (!spaceName) {
      next(new ForbiddenError('Space name required'));
      return;
    }

    try {
      const isManager = await isUserSpaceManager(req.user.username, spaceName);
      if (!isManager) {
        next(new ForbiddenError(`Not a manager of space '${spaceName}'`));
        return;
      }
      next();
    } catch (err) {
      logger.error(
        { err, username: req.user.username, spaceName },
        'Failed to check space management access',
      );
      next(new ForbiddenError('Unable to verify space management access'));
    }
  };
}
