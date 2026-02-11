import type { Request, Response } from 'express';
import { validateCredentials, getAuthBackends } from '../services/editshare-api/auth.service.js';
import { getUserSpaces } from '../services/editshare-api/users.service.js';
import { getUserManagedSpaces } from '../services/space-manager.store.js';
import { generateToken } from '../services/session.service.js';
import { config } from '../config/index.js';
import { AuthenticationError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { ILoginRequest, ILoginResponse, ICurrentUser, IUserSpacePermission, IAuthBackendsResponse } from '../../../shared/types/auth.js';

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

  // Fetch user's space permissions via service account
  let spaces: IUserSpacePermission[] = [];
  if (!result.isAdmin) {
    try {
      const userSpaces = await getUserSpaces(username);
      spaces = userSpaces.map((s) => ({
        spaceName: s.spaceName,
        accessType: s.accessType === 'readonly' ? 'readonly' as const : 'readwrite' as const,
      }));
    } catch (err) {
      logger.warn({ err, username }, 'Failed to fetch user spaces during login');
    }
  }

  // Fetch managed spaces for non-admin users
  let managedSpaces: string[] = [];
  if (!result.isAdmin) {
    try {
      managedSpaces = await getUserManagedSpaces(username);
    } catch (err) {
      logger.warn({ err, username }, 'Failed to fetch managed spaces during login');
    }
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
      spaces,
      managedSpaces,
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

  // Fetch fresh space permissions
  let spaces: IUserSpacePermission[] = [];
  if (!req.user.isAdmin) {
    try {
      const userSpaces = await getUserSpaces(req.user.username);
      spaces = userSpaces.map((s) => ({
        spaceName: s.spaceName,
        accessType: s.accessType === 'readonly' ? 'readonly' as const : 'readwrite' as const,
      }));
    } catch (err) {
      logger.warn({ err, username: req.user.username }, 'Failed to fetch user spaces for /me');
    }
  }

  // Fetch managed spaces for non-admin users
  let managedSpaces: string[] = [];
  if (!req.user.isAdmin) {
    try {
      managedSpaces = await getUserManagedSpaces(req.user.username);
    } catch (err) {
      logger.warn({ err, username: req.user.username }, 'Failed to fetch managed spaces for /me');
    }
  }

  const currentUser: ICurrentUser = {
    username: req.user.username,
    isAdmin: req.user.isAdmin,
    spaces,
    managedSpaces,
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
