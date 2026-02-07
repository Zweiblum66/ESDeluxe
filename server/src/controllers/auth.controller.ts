import type { Request, Response } from 'express';
import { validateCredentials, getAuthBackends } from '../services/editshare-api/auth.service.js';
import { generateToken } from '../services/session.service.js';
import { config } from '../config/index.js';
import { AuthenticationError, ValidationError } from '../utils/errors.js';
import type { ILoginRequest, ILoginResponse, ICurrentUser, IAuthBackendsResponse } from '../../../shared/types/auth.js';

/**
 * POST /api/v1/auth/login
 * Validates credentials against the EditShare API and returns a JWT.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body as ILoginRequest;

  if (!username || !password) {
    throw new ValidationError('Username and password are required');
  }

  const result = await validateCredentials(username, password);

  if (!result.valid) {
    throw new AuthenticationError('Invalid username or password');
  }

  const tokenPayload = {
    username,
    isAdmin: result.isAdmin,
  };

  const token = generateToken(tokenPayload, config.APP_SECRET, config.JWT_EXPIRY);

  const response: ILoginResponse = {
    token,
    user: {
      username,
      isAdmin: result.isAdmin,
    },
    backends: [],
  };

  // Try to populate backends, but don't fail login if this errors
  try {
    response.backends = await getAuthBackends();
  } catch {
    // Backends info is optional on login
  }

  res.json({ data: response });
}

/**
 * GET /api/v1/auth/me
 * Returns the current authenticated user from the JWT.
 */
export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AuthenticationError('Not authenticated');
  }

  const currentUser: ICurrentUser = {
    username: req.user.username,
    isAdmin: req.user.isAdmin,
  };

  res.json({ data: currentUser });
}

/**
 * GET /api/v1/auth/backends
 * Returns the list of configured authentication backends.
 */
export async function backends(_req: Request, res: Response): Promise<void> {
  const backendList = await getAuthBackends();

  const response: IAuthBackendsResponse = {
    backends: backendList,
    adActive: backendList.includes('AD'),
    ssoActive: backendList.includes('SSO_SAML'),
  };

  res.json({ data: response });
}
