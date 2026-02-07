import type { Request, Response } from 'express';
import { ValidationError } from '../utils/errors.js';
import * as qosService from '../services/editshare-api/qos.service.js';

/** Extract :storageNodeGroup param safely (Express v5 params can be string | string[]) */
function getStorageNodeGroup(req: Request): string {
  const val = req.params.storageNodeGroup;
  return Array.isArray(val) ? val[0] : val;
}

/**
 * GET /api/v1/qos/config
 * Retrieves QoS configuration for all storage node groups
 */
export async function getQosConfig(_req: Request, res: Response): Promise<void> {
  const configs = await qosService.getQosConfig();
  res.json({ data: configs });
}

/**
 * PUT /api/v1/qos/config/:storageNodeGroup
 * Updates QoS configuration for a specific storage node group
 * Body: { qosEnabled, pools, othersBandwidthLimit }
 */
export async function setQosConfig(req: Request, res: Response): Promise<void> {
  const storageNodeGroup = getStorageNodeGroup(req);
  const { qosEnabled, pools, othersBandwidthLimit } = req.body;

  if (typeof qosEnabled !== 'boolean') {
    throw new ValidationError('qosEnabled must be a boolean');
  }

  if (!Array.isArray(pools)) {
    throw new ValidationError('pools must be an array');
  }

  // Validate each pool
  for (const pool of pools) {
    if (!pool.name || typeof pool.name !== 'string') {
      throw new ValidationError('Each pool must have a name');
    }

    if (pool.bandwidthLimit !== null && typeof pool.bandwidthLimit !== 'number') {
      throw new ValidationError('bandwidthLimit must be a number or null');
    }

    // Minimum bandwidth limit is 1 MiB/s = 1048576 bytes/sec
    if (pool.bandwidthLimit !== null && pool.bandwidthLimit < 1048576) {
      throw new ValidationError('bandwidthLimit must be at least 1048576 bytes/sec (1 MiB/s)');
    }

    if (!Array.isArray(pool.consumers)) {
      throw new ValidationError('Each pool must have a consumers array');
    }
  }

  if (othersBandwidthLimit !== null && typeof othersBandwidthLimit !== 'number') {
    throw new ValidationError('othersBandwidthLimit must be a number or null');
  }

  await qosService.setQosConfig(storageNodeGroup, {
    qosEnabled,
    pools,
    othersBandwidthLimit,
  });

  res.json({
    data: { storageNodeGroup, message: 'QoS configuration updated successfully' },
  });
}

/**
 * GET /api/v1/qos/usage
 * Retrieves real-time bandwidth usage for all storage node groups
 */
export async function getQosUsage(_req: Request, res: Response): Promise<void> {
  const usage = await qosService.getQosUsage();
  res.json({ data: usage });
}

/**
 * GET /api/v1/qos/client-pools
 * Returns bandwidth limiting information for a client
 * Query params: user, ip, workstation, protocol
 */
export async function getClientPools(req: Request, res: Response): Promise<void> {
  const { user, ip, workstation, protocol } = req.query;

  const params: {
    user?: string;
    ip?: string;
    workstation?: string;
    protocol?: 'efs' | 'smb';
  } = {};

  if (user && typeof user === 'string') params.user = user;
  if (ip && typeof ip === 'string') params.ip = ip;
  if (workstation && typeof workstation === 'string') params.workstation = workstation;
  if (protocol && (protocol === 'efs' || protocol === 'smb')) params.protocol = protocol;

  const clientPools = await qosService.getClientPools(params);
  res.json({ data: clientPools });
}
