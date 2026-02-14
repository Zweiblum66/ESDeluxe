import type { Request, Response } from 'express';
import { existsSync } from 'fs';
import { getEsApiClient } from '../services/editshare-api/client.js';
import { getLdapClient } from '../services/ldap/client.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getSchedulerStatus as getTieringStatus, getCurrentProgress as getTieringProgress } from '../services/tiering-scheduler.service.js';
import { getQosSchedulerStatus } from '../services/qos-scheduler.service.js';
import { getSchedulerStatus as getTrashStatus } from '../services/trash/trash-scheduler.service.js';
import { getSchedulerStatus as getCatalogScanStatus } from '../services/asset-catalog/scan-scheduler.service.js';
import { getGuardianReceiverStatus } from '../services/guardian-receiver.service.js';
import * as guardianEventsStore from '../services/guardian-events.store.js';
import * as jobStore from '../services/asset-catalog/job.store.js';
import type { IHealthStatus, IAutomationStatus } from '../../../shared/types/api.js';

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

/**
 * GET /api/v1/system/automation
 * Returns combined status for all background automation services.
 */
export async function getAutomationStatus(_req: Request, res: Response): Promise<void> {
  const tiering = getTieringStatus();
  const tieringProgress = getTieringProgress();
  const qos = getQosSchedulerStatus();
  const trash = getTrashStatus();
  const catalogScan = getCatalogScanStatus();
  const guardianBase = getGuardianReceiverStatus();
  const totalStoredEvents = guardianEventsStore.getTotalCount();
  const catalogJobs = jobStore.getJobStats();

  const data: IAutomationStatus = {
    tiering: { scheduler: tiering, progress: tieringProgress },
    catalogScan: { scheduler: catalogScan, jobs: catalogJobs },
    trashPurge: trash,
    qos,
    guardian: { ...guardianBase, totalStoredEvents },
  };

  res.json({ data });
}
