import type { Request, Response } from 'express';
import { existsSync } from 'fs';
import { getEsApiClient } from '../services/editshare-api/client.js';
import { getLdapClient } from '../services/ldap/client.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { IHealthStatus } from '../../../shared/types/api.js';

const startTime = Date.now();

/**
 * GET /api/v1/system/health
 * Returns the health status of all backend connections.
 */
export async function health(_req: Request, res: Response): Promise<void> {
  let esApiConnected = false;
  let ldapConnected = false;
  let efsMounted = false;

  // Check ES API connectivity
  try {
    const client = getEsApiClient();
    const response = await client.get('/api/v1/storage/auth', { timeout: 5000 });
    esApiConnected = response.status >= 200 && response.status < 500;
  } catch (err) {
    logger.debug({ err }, 'Health check: ES API not reachable');
  }

  // Check LDAP connectivity
  try {
    const ldap = getLdapClient();
    ldapConnected = ldap.isConnected();
  } catch {
    logger.debug('Health check: LDAP client not initialized');
  }

  // Check EFS mount point
  try {
    efsMounted = existsSync(config.EFS_MOUNT_POINT);
  } catch {
    logger.debug('Health check: EFS mount point not accessible');
  }

  const allUp = esApiConnected && ldapConnected && efsMounted;
  const someUp = esApiConnected || ldapConnected || efsMounted;

  const status: IHealthStatus = {
    status: allUp ? 'ok' : someUp ? 'degraded' : 'error',
    esApiConnected,
    ldapConnected,
    efsMounted,
    version: '0.1.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };

  const httpStatus = status.status === 'error' ? 503 : 200;
  res.status(httpStatus).json({ data: status });
}
