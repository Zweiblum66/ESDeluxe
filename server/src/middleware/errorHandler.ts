import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { IApiError } from '../../../shared/types/api.js';

/**
 * Global Express error handler.
 * Maps AppError subclasses to their HTTP status codes.
 * Returns a consistent JSON error shape.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let details: unknown = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    details = err.details;
  }

  // Log stack traces for server errors
  if (statusCode >= 500) {
    logger.error({ err, statusCode, code }, `Server error: ${err.message}`);
  } else {
    logger.warn({ statusCode, code, message: err.message }, `Client error: ${err.message}`);
  }

  const body: IApiError = {
    error: true,
    message: err.message,
    code,
    ...(details !== undefined ? { details } : {}),
  };

  res.status(statusCode).json(body);
}
