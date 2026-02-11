/**
 * Base application error with HTTP status code and machine-readable code.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ApiError extends AppError {
  constructor(message: string, statusCode = 502, details?: unknown) {
    super(message, statusCode, 'API_ERROR', details);
  }
}

export class LdapError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 502, 'LDAP_ERROR', details);
  }
}

export class EfsCliError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'EFS_CLI_ERROR', details);
  }
}
