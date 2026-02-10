import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.js';

/**
 * Middleware that restricts access to admin users only.
 * Must be used after the auth middleware (which sets req.user).
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    next(new ForbiddenError('Admin access required'));
    return;
  }
  next();
}
