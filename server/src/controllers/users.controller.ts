import type { Request, Response } from 'express';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { isSystemUser } from '../services/ldap/constants.js';
import * as esUsers from '../services/editshare-api/users.service.js';
import * as ldapUsers from '../services/ldap/users.service.js';
import { getUiGroups } from '../services/ldap/groups.service.js';
import { hasUserPermissionOverride } from '../services/user-permission-override.store.js';
import type { IUser, IUserDetail } from '../../../shared/types/user.js';

/** Extract username param safely (Express v5 params can be string | string[]) */
function getUsername(req: Request): string {
  const val = req.params.username;
  return Array.isArray(val) ? val[0] : val;
}

/**
 * GET /api/v1/users
 * Returns all users merged from ES API (detail) + LDAP (UID filtering).
 * Filters out system accounts.
 */
export async function listUsers(_req: Request, res: Response): Promise<void> {
  // Fetch from both sources in parallel
  const [apiUsers, ldapUserList] = await Promise.all([
    esUsers.listUsers(),
    ldapUsers.listLdapUsers().catch((err) => {
      logger.warn({ err }, 'LDAP user list failed, falling back to API only');
      return [] as { username: string; uid: number }[];
    }),
  ]);

  // Build a UID lookup from LDAP
  const ldapUidMap = new Map<string, number>();
  for (const lu of ldapUserList) {
    ldapUidMap.set(lu.username, lu.uid);
  }

  // Filter out system users and enrich with LDAP UIDs
  const users: IUser[] = apiUsers
    .filter((u) => !isSystemUser(u.username))
    .map((u) => ({
      ...u,
      uid: u.uid ?? ldapUidMap.get(u.username),
    }));

  res.json({ data: users });
}

/**
 * GET /api/v1/users/:username
 * Returns full user detail: base info + spaces + groups.
 */
export async function getUser(req: Request, res: Response): Promise<void> {
  const username = getUsername(req);

  // Fetch all data in parallel
  const [baseUser, spaces, apiGroups, uiGroups] = await Promise.all([
    esUsers.getUser(username),
    esUsers.getUserSpaces(username),
    esUsers.getUserGroups(username),
    getUiGroups().catch(() => []),
  ]);

  // Get the UI group names this user belongs to
  const userUiGroups = uiGroups
    .filter((g) => g.members.includes(username))
    .map((g) => g.displayName);

  // Combine ES API groups with UI groups (deduplicated)
  const allGroups = [...new Set([...apiGroups, ...userUiGroups])];

  // Enrich spaces with hasOverride flag
  const enrichedSpaces = spaces.map((s) => ({
    ...s,
    hasOverride: hasUserPermissionOverride(s.spaceName, username),
  }));

  const detail: IUserDetail = {
    ...baseUser,
    spaces: enrichedSpaces,
    groups: allGroups,
  };

  res.json({ data: detail });
}

/**
 * POST /api/v1/users
 * Creates a new user. Body: { username, password }
 */
export async function createUser(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    throw new ValidationError('Username is required');
  }
  if (!password || typeof password !== 'string' || password.length < 4) {
    throw new ValidationError('Password must be at least 4 characters');
  }

  // Sanitize username: lowercase, no spaces
  const cleanUsername = username.trim().toLowerCase();

  await esUsers.createUser(cleanUsername, password);

  res.status(201).json({
    data: { username: cleanUsername, message: 'User created successfully' },
  });
}

/**
 * DELETE /api/v1/users/:username
 */
export async function deleteUser(req: Request, res: Response): Promise<void> {
  const username = getUsername(req);

  await esUsers.deleteUser(username);

  res.json({ data: { username, message: 'User deleted successfully' } });
}

/**
 * PUT /api/v1/users/:username/password
 * Body: { password }
 */
export async function updatePassword(req: Request, res: Response): Promise<void> {
  const username = getUsername(req);
  const { password } = req.body;

  if (!password || typeof password !== 'string' || password.length < 4) {
    throw new ValidationError('Password must be at least 4 characters');
  }

  await esUsers.changePassword(username, password);

  res.json({ data: { username, message: 'Password updated successfully' } });
}

/**
 * GET /api/v1/users/:username/spaces
 */
export async function getUserSpaces(req: Request, res: Response): Promise<void> {
  const username = getUsername(req);

  const spaces = await esUsers.getUserSpaces(username);

  // Enrich with hasOverride flag
  const enrichedSpaces = spaces.map((s) => ({
    ...s,
    hasOverride: hasUserPermissionOverride(s.spaceName, username),
  }));

  res.json({ data: enrichedSpaces });
}

/**
 * GET /api/v1/users/:username/groups
 */
export async function getUserGroups(req: Request, res: Response): Promise<void> {
  const username = getUsername(req);

  const [apiGroups, uiGroups] = await Promise.all([
    esUsers.getUserGroups(username),
    getUiGroups().catch(() => []),
  ]);

  // Get the UI group names this user belongs to
  const userUiGroups = uiGroups
    .filter((g) => g.members.includes(username))
    .map((g) => g.displayName);

  const allGroups = [...new Set([...apiGroups, ...userUiGroups])];

  res.json({ data: allGroups });
}

/**
 * POST /api/v1/users/:username/groups
 * Body: { groups: string[] }
 */
export async function addUserToGroups(req: Request, res: Response): Promise<void> {
  const username = getUsername(req);
  const { groups } = req.body;

  if (!Array.isArray(groups) || groups.length === 0) {
    throw new ValidationError('Groups must be a non-empty array');
  }

  await esUsers.addUserToGroups(username, groups);

  res.json({ data: { username, groups, message: 'User added to groups successfully' } });
}
