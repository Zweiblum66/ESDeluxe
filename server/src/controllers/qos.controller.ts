import type { Request, Response } from 'express';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import * as qosService from '../services/editshare-api/qos.service.js';
import * as historyStore from '../services/qos-history.store.js';
import * as profilesStore from '../services/qos-profiles.store.js';
import * as alertsStore from '../services/qos-alerts.store.js';
import { getQosSchedulerStatus } from '../services/qos-scheduler.service.js';

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

// ──────────────────────────────────────────────
// History
// ──────────────────────────────────────────────

/**
 * GET /api/v1/qos/history
 * Query params: storageNodeGroup, poolName, from (unix), to (unix)
 */
export async function getHistory(req: Request, res: Response): Promise<void> {
  const { storageNodeGroup, poolName, from, to } = req.query;

  if (!from || !to) {
    throw new ValidationError('from and to query parameters are required (unix timestamps)');
  }

  const fromTs = Number(from);
  const toTs = Number(to);

  if (isNaN(fromTs) || isNaN(toTs)) {
    throw new ValidationError('from and to must be valid unix timestamps');
  }

  const records = historyStore.getHistory({
    storageNodeGroup: typeof storageNodeGroup === 'string' ? storageNodeGroup : undefined,
    poolName: typeof poolName === 'string' ? poolName : undefined,
    from: fromTs,
    to: toTs,
  });

  res.json({ data: records });
}

/**
 * GET /api/v1/qos/scheduler-status
 * Returns the QoS scheduler status
 */
export async function getSchedulerStatus(_req: Request, res: Response): Promise<void> {
  const status = getQosSchedulerStatus();
  res.json({ data: status });
}

// ──────────────────────────────────────────────
// Profiles
// ──────────────────────────────────────────────

/** GET /api/v1/qos/profiles */
export async function listProfiles(_req: Request, res: Response): Promise<void> {
  const profiles = profilesStore.listProfiles();
  res.json({ data: profiles });
}

/** GET /api/v1/qos/profiles/:id */
export async function getProfile(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const profile = profilesStore.getProfile(id);
  if (!profile) throw new NotFoundError('QoS profile', String(id));
  res.json({ data: profile });
}

/** POST /api/v1/qos/profiles */
export async function createProfile(req: Request, res: Response): Promise<void> {
  const { name, storageNodeGroup, config } = req.body;

  if (!name || typeof name !== 'string') {
    throw new ValidationError('Profile name is required');
  }
  if (!storageNodeGroup || typeof storageNodeGroup !== 'string') {
    throw new ValidationError('storageNodeGroup is required');
  }
  if (!config || typeof config !== 'object') {
    throw new ValidationError('config object is required');
  }

  const profile = profilesStore.createProfile(name.trim(), storageNodeGroup, config);
  res.status(201).json({ data: profile });
}

/**
 * POST /api/v1/qos/profiles/from-current
 * Save the current live QoS config as a named profile.
 * Body: { name, storageNodeGroup }
 */
export async function createProfileFromCurrent(req: Request, res: Response): Promise<void> {
  const { name, storageNodeGroup } = req.body;

  if (!name || typeof name !== 'string') {
    throw new ValidationError('Profile name is required');
  }
  if (!storageNodeGroup || typeof storageNodeGroup !== 'string') {
    throw new ValidationError('storageNodeGroup is required');
  }

  // Fetch the current live config
  const configs = await qosService.getQosConfig();
  const currentConfig = configs.find((c) => c.storageNodeGroup === storageNodeGroup);
  if (!currentConfig) {
    throw new NotFoundError('QoS config for storage node group', storageNodeGroup);
  }

  const { storageNodeGroup: _sng, ...configWithoutSng } = currentConfig;
  const profile = profilesStore.createProfile(name.trim(), storageNodeGroup, configWithoutSng);
  res.status(201).json({ data: profile });
}

/** PUT /api/v1/qos/profiles/:id */
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const { name, config } = req.body;

  const updated = profilesStore.updateProfile(id, { name, config });
  if (!updated) throw new NotFoundError('QoS profile', String(id));

  res.json({ data: updated });
}

/** DELETE /api/v1/qos/profiles/:id */
export async function deleteProfile(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const deleted = profilesStore.deleteProfile(id);
  if (!deleted) throw new NotFoundError('QoS profile', String(id));

  res.json({ data: { id, message: 'Profile deleted' } });
}

// ──────────────────────────────────────────────
// Schedules
// ──────────────────────────────────────────────

/** GET /api/v1/qos/schedules */
export async function listSchedules(req: Request, res: Response): Promise<void> {
  const profileId = req.query.profileId ? Number(req.query.profileId) : undefined;
  const schedules = profilesStore.listSchedules(profileId);
  res.json({ data: schedules });
}

/** POST /api/v1/qos/schedules */
export async function createSchedule(req: Request, res: Response): Promise<void> {
  const { profileId, cronExpression, enabled } = req.body;

  if (!profileId || typeof profileId !== 'number') {
    throw new ValidationError('profileId is required');
  }
  if (!cronExpression || typeof cronExpression !== 'string') {
    throw new ValidationError('cronExpression is required');
  }

  // Validate profile exists
  const profile = profilesStore.getProfile(profileId);
  if (!profile) throw new NotFoundError('QoS profile', String(profileId));

  // Basic cron format validation (5 fields)
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new ValidationError('cronExpression must be a 5-field cron expression (minute hour day month weekday)');
  }

  const schedule = profilesStore.createSchedule(profileId, cronExpression.trim(), enabled !== false);
  res.status(201).json({ data: schedule });
}

/** PUT /api/v1/qos/schedules/:id */
export async function updateSchedule(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const { cronExpression, enabled } = req.body;

  const updated = profilesStore.updateSchedule(id, { cronExpression, enabled });
  if (!updated) throw new NotFoundError('QoS schedule', String(id));

  res.json({ data: updated });
}

/** DELETE /api/v1/qos/schedules/:id */
export async function deleteSchedule(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const deleted = profilesStore.deleteSchedule(id);
  if (!deleted) throw new NotFoundError('QoS schedule', String(id));

  res.json({ data: { id, message: 'Schedule deleted' } });
}

// ──────────────────────────────────────────────
// Alert Thresholds
// ──────────────────────────────────────────────

/** GET /api/v1/qos/alerts/thresholds */
export async function listAlertThresholds(req: Request, res: Response): Promise<void> {
  const storageNodeGroup = typeof req.query.storageNodeGroup === 'string'
    ? req.query.storageNodeGroup
    : undefined;
  const thresholds = alertsStore.listThresholds(storageNodeGroup);
  res.json({ data: thresholds });
}

/** POST /api/v1/qos/alerts/thresholds */
export async function createAlertThreshold(req: Request, res: Response): Promise<void> {
  const { storageNodeGroup, poolName, thresholdBytesPerSec, direction, cooldownMinutes } = req.body;

  if (!storageNodeGroup || typeof storageNodeGroup !== 'string') {
    throw new ValidationError('storageNodeGroup is required');
  }
  if (typeof thresholdBytesPerSec !== 'number' || thresholdBytesPerSec <= 0) {
    throw new ValidationError('thresholdBytesPerSec must be a positive number');
  }
  if (direction && direction !== 'above' && direction !== 'below') {
    throw new ValidationError('direction must be "above" or "below"');
  }

  const threshold = alertsStore.createThreshold({
    storageNodeGroup,
    poolName: poolName ?? null,
    thresholdBytesPerSec,
    direction: direction || 'above',
    cooldownMinutes,
  });

  res.status(201).json({ data: threshold });
}

/** PUT /api/v1/qos/alerts/thresholds/:id */
export async function updateAlertThreshold(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const { thresholdBytesPerSec, direction, enabled, cooldownMinutes } = req.body;

  const updated = alertsStore.updateThreshold(id, {
    thresholdBytesPerSec,
    direction,
    enabled,
    cooldownMinutes,
  });
  if (!updated) throw new NotFoundError('QoS alert threshold', String(id));

  res.json({ data: updated });
}

/** DELETE /api/v1/qos/alerts/thresholds/:id */
export async function deleteAlertThreshold(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const deleted = alertsStore.deleteThreshold(id);
  if (!deleted) throw new NotFoundError('QoS alert threshold', String(id));

  res.json({ data: { id, message: 'Alert threshold deleted' } });
}

// ──────────────────────────────────────────────
// Alert Events
// ──────────────────────────────────────────────

/** GET /api/v1/qos/alerts/events */
export async function listAlertEvents(req: Request, res: Response): Promise<void> {
  const thresholdId = req.query.thresholdId ? Number(req.query.thresholdId) : undefined;
  const unacknowledgedOnly = req.query.unacknowledgedOnly === 'true';
  const limit = req.query.limit ? Number(req.query.limit) : 100;

  const events = alertsStore.listEvents({ thresholdId, unacknowledgedOnly, limit });
  res.json({ data: events });
}

/**
 * POST /api/v1/qos/alerts/events/acknowledge
 * Body: { eventIds: number[] }
 */
export async function acknowledgeAlertEvents(req: Request, res: Response): Promise<void> {
  const { eventIds } = req.body;

  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    throw new ValidationError('eventIds must be a non-empty array');
  }

  const count = alertsStore.acknowledgeEvents(eventIds);
  res.json({ data: { acknowledged: count } });
}

/** GET /api/v1/qos/alerts/unacknowledged-count */
export async function getUnacknowledgedAlertCount(_req: Request, res: Response): Promise<void> {
  const count = alertsStore.getUnacknowledgedCount();
  res.json({ data: { count } });
}
