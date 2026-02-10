import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.js';
import { getUserSpaces } from '../services/editshare-api/users.service.js';
import { isUserSpaceManager } from '../services/space-manager.store.js';
import { logger } from '../utils/logger.js';

/**
 * Extracts the space name from the request.
 * Handles Express v5 param arrays.
 */
function extractSpaceName(req: Request): string | null {
  const val = req.params.name;
  if (!val) return null;
  return Array.isArray(val) ? val[0] : val;
}

/**
 * Middleware that verifies the current user has access to the target space.
 * Admins bypass all checks. Regular users must have the space in their
 * ES API space membership list.
 *
 * @param mode - 'read' allows readonly or readwrite; 'write' requires readwrite
 */
export function requireSpaceAccess(mode: 'read' | 'write') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // Admins have full access
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
      // No space in the route — let the controller handle it
      next();
      return;
    }

    try {
      // Space managers have full read+write access to their managed spaces
      const isManager = await isUserSpaceManager(req.user.username, spaceName);
      if (isManager) {
        next();
        return;
      }

      const userSpaces = await getUserSpaces(req.user.username);
      const match = userSpaces.find((s) => s.spaceName === spaceName);

      if (!match) {
        next(new ForbiddenError(`No access to space '${spaceName}'`));
        return;
      }

      if (mode === 'write' && match.accessType === 'readonly') {
        next(new ForbiddenError(`Read-only access to space '${spaceName}'`));
        return;
      }

      next();
    } catch (err) {
      logger.error({ err, username: req.user.username, spaceName }, 'Failed to check space access');
      next(new ForbiddenError('Unable to verify space access'));
    }
  };
}
