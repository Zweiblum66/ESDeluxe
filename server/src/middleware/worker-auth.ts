import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

declare global {
  namespace Express {
    interface Request {
      workerId?: string;
    }
  }
}

/**
 * Worker API key authentication middleware.
 * Checks for `Authorization: Worker {API_KEY}` header.
 * If WORKER_API_KEY is not configured, returns 403 (worker API disabled).
 */
export function workerAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.WORKER_API_KEY) {
    res.status(403).json({ error: 'Worker API is not enabled (WORKER_API_KEY not configured)' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Worker ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header (expected: Worker <key>)' });
    return;
  }

  const key = authHeader.slice(7);
  if (key !== config.WORKER_API_KEY) {
    res.status(401).json({ error: 'Invalid worker API key' });
    return;
  }

  // Extract workerId from body if available (for POST/PUT requests)
  req.workerId = (req.body as Record<string, unknown>)?.workerId as string | undefined;

  next();
}
