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

  // Skip JWT auth for worker API paths (uses its own API key auth)
  if (req.path.startsWith('/api/v1/worker')) {
    next();
    return;
  }

  // Accept token from Authorization header or ?token= query param (for <img>/<video> tags)
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : typeof req.query.token === 'string'
      ? req.query.token
      : null;

  if (!token) {
    next(new AuthenticationError('Missing or invalid Authorization header'));
    return;
  }

  try {
    const payload = verifyToken(token, config.APP_SECRET);
    req.user = payload as ICurrentUser;
    next();
  } catch {
    next(new AuthenticationError('Invalid or expired token'));
  }
}
