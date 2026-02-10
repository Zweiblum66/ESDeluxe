import ldap from 'ldapjs';
import axios from 'axios';
import https from 'https';
import { config } from '../../config/index.js';
import { getEsApiClient } from './client.js';
import { logger } from '../../utils/logger.js';
import { ApiError } from '../../utils/errors.js';
import { PEOPLE_OU } from '../ldap/constants.js';
import type { AuthBackendType } from '../../../../shared/types/auth.js';
import type { ESAuthBackendsResponse } from './types.js';

interface ValidateCredentialsResult {
  valid: boolean;
  isAdmin: boolean;
}

/**
 * Try authenticating via the EditShare storage API.
 * Returns true if the API accepts the credentials, false if 401/403.
 * Throws on connectivity errors.
 */
async function tryEsApiAuth(username: string, password: string): Promise<boolean> {
  try {
    await axios.get(
      `https://${config.ES_HOST}:${config.ES_API_PORT}/api/v1/storage/auth`,
      {
        auth: { username, password },
        httpsAgent: new https.Agent({
          rejectUnauthorized: !config.ES_ALLOW_SELF_SIGNED,
        }),
        timeout: 15_000,
      },
    );
    return true;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response && (err.response.status === 401 || err.response.status === 403)) {
      return false;
    }
    throw err;
  }
}

/**
 * Try authenticating via LDAP simple bind.
 * Constructs the user DN as cn=<username>,ou=People,<BASE_DN> and attempts a bind.
 * Returns true if the bind succeeds, false otherwise.
 */
async function tryLdapAuth(username: string, password: string): Promise<boolean> {
  const userDn = `cn=${username},${PEOPLE_OU}`;

  return new Promise((resolve) => {
    const client = ldap.createClient({
      url: config.LDAP_URI,
      tlsOptions: {
        rejectUnauthorized: config.LDAP_REJECT_UNAUTHORIZED !== false,
      },
      connectTimeout: 10_000,
    });

    client.on('error', (err: Error) => {
      logger.warn({ err, username }, 'LDAP auth client error');
      resolve(false);
    });

    client.on('connectTimeout', () => {
      logger.warn({ username }, 'LDAP auth connection timeout');
      resolve(false);
    });

    client.bind(userDn, password, (err) => {
      // Always unbind/destroy the one-shot client
      try { client.unbind(() => {}); } catch { /* ignore */ }

      if (err) {
        logger.debug({ err, username }, 'LDAP bind failed for user');
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

/**
 * Determines admin status for a successfully authenticated user.
 */
async function determineAdminStatus(username: string): Promise<boolean> {
  if (username === config.ES_API_USER) return true;

  try {
    const client = getEsApiClient();
    const groupsResp = await client.get<string[]>(
      `/api/v1/storage/users/${encodeURIComponent(username)}/groups`,
    );
    const groups: string[] = groupsResp.data ?? [];
    return groups.includes('admins');
  } catch (groupErr) {
    logger.warn({ err: groupErr, username }, 'Failed to fetch user groups for admin check');
    return false;
  }
}

/**
 * Validates user credentials against the EditShare API, falling back to LDAP
 * simple bind if the API rejects the credentials.
 *
 * 1. Try ES API auth (/api/v1/storage/auth with user credentials)
 * 2. If 401/403, try LDAP bind (cn=<username>,ou=People,<BASE_DN>)
 * 3. If either succeeds, check group membership for admin status
 */
export async function validateCredentials(
  username: string,
  password: string,
): Promise<ValidateCredentialsResult> {
  // 1. Try EditShare API auth
  let authenticated = false;
  let authMethod = '';

  try {
    authenticated = await tryEsApiAuth(username, password);
    if (authenticated) authMethod = 'es-api';
  } catch (err) {
    // API connectivity error — log but still try LDAP
    logger.warn({ err, username }, 'ES API auth error, will try LDAP fallback');
  }

  // 2. If ES API rejected, try LDAP bind
  if (!authenticated) {
    try {
      authenticated = await tryLdapAuth(username, password);
      if (authenticated) authMethod = 'ldap';
    } catch (err) {
      logger.warn({ err, username }, 'LDAP auth error');
    }
  }

  if (!authenticated) {
    logger.warn({ username }, `Invalid credentials for user: ${username}`);
    return { valid: false, isAdmin: false };
  }

  // 3. Determine admin status
  const isAdmin = await determineAdminStatus(username);

  logger.info({ username, isAdmin, authMethod }, `Credentials validated for user: ${username} (via ${authMethod})`);
  return { valid: true, isAdmin };
}

/**
 * Returns the list of configured authentication backends from the EditShare API.
 */
export async function getAuthBackends(): Promise<AuthBackendType[]> {
  try {
    const client = getEsApiClient();
    const response = await client.get<ESAuthBackendsResponse>('/api/v1/auth/settings/backends');

    const backends: AuthBackendType[] = [];

    for (const backend of response.data.backends ?? []) {
      if (!backend.enabled) continue;

      switch (backend.type?.toLowerCase()) {
        case 'local':
        case 'local_es':
          backends.push('LOCAL_ES');
          break;
        case 'ad':
        case 'active_directory':
          backends.push('AD');
          break;
        case 'sso':
        case 'sso_saml':
          backends.push('SSO_SAML');
          break;
        case 'multisite':
          backends.push('MULTISITE');
          break;
        default:
          logger.warn({ type: backend.type }, `Unknown auth backend type: ${backend.type}`);
      }
    }

    return backends;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error({ err }, 'Failed to fetch auth backends');
    throw new ApiError('Failed to fetch authentication backends');
  }
}
