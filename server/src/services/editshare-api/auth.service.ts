import axios from 'axios';
import https from 'https';
import { config } from '../../config/index.js';
import { getEsApiClient } from './client.js';
import { logger } from '../../utils/logger.js';
import { ApiError } from '../../utils/errors.js';
import type { AuthBackendType } from '../../../../shared/types/auth.js';
import type { ESAuthBackendsResponse } from './types.js';

interface ValidateCredentialsResult {
  valid: boolean;
  isAdmin: boolean;
}

/**
 * Validates user credentials against the EditShare API.
 * Makes a GET request to /api/v1/storage/auth using the provided credentials
 * (not the service account). A successful response means the credentials are valid.
 */
export async function validateCredentials(
  username: string,
  password: string,
): Promise<ValidateCredentialsResult> {
  try {
    const response = await axios.get(
      `https://${config.ES_HOST}:${config.ES_API_PORT}/api/v1/storage/auth`,
      {
        auth: { username, password },
        httpsAgent: new https.Agent({
          rejectUnauthorized: !config.ES_ALLOW_SELF_SIGNED,
        }),
        timeout: 15_000,
      },
    );

    // If we get a 200, credentials are valid
    // The response body may contain admin status
    const isAdmin = response.data?.is_admin === true ||
      response.data?.admin === true ||
      username === config.ES_API_USER;

    logger.info({ username, isAdmin }, `Credentials validated for user: ${username}`);

    return { valid: true, isAdmin };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      // 401/403 means invalid credentials
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        logger.warn({ username }, `Invalid credentials for user: ${username}`);
        return { valid: false, isAdmin: false };
      }
      // Other errors are API connectivity issues
      logger.error({ err, username }, 'ES API error during credential validation');
      throw new ApiError(`EditShare API error during authentication: ${err.message}`);
    }
    throw err;
  }
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
