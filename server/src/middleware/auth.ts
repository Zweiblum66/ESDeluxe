import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/session.service.js';
import { config } from '../config/index.js';
import { AuthenticationError } from '../utils/errors.js';
import type { ICurrentUser } from '../../../shared/types/auth.js';

// Augment Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: ICurrentUser;
    }
  }
}

/** Paths that do not require authentication */
const PUBLIC_PATHS = ['/api/v1/auth/login', '/api/v1/system/health'];

/**
 * JWT authentication middleware.
 * Reads the Authorization: Bearer <token> header, verifies it,
 * and attaches the decoded user payload to req.user.
 *
 * Only applies to /api/ routes. Non-API paths (frontend static files,
 * SPA routes) pass through without authentication.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // Skip auth for non-API paths (frontend static files, SPA routes)
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  // Skip auth for public API paths
  if (PUBLIC_PATHS.some((p) => req.path === p)) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AuthenticationError('Missing or invalid Authorization header'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token, config.APP_SECRET);
    req.user = payload as ICurrentUser;
    next();
  } catch {
    next(new AuthenticationError('Invalid or expired token'));
  }
}
