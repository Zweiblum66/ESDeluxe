import { getDatabase } from '../db/index.js';
import { logger } from '../utils/logger.js';
import type { IQosConfig } from '../../../shared/types/qos.js';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface IQosProfile {
  id: number;
  name: string;
  storageNodeGroup: string;
  config: Omit<IQosConfig, 'storageNodeGroup'>;
  createdAt: number;
  updatedAt: number;
}

export interface IQosSchedule {
  id: number;
  profileId: number;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface ProfileRow {
  id: number;
  name: string;
  storage_node_group: string;
  config_json: string;
  created_at: number;
  updated_at: number;
}

interface ScheduleRow {
  id: number;
  profile_id: number;
  cron_expression: string;
  enabled: number;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
}

// ──────────────────────────────────────────────
// Profile CRUD
// ──────────────────────────────────────────────

export function listProfiles(): IQosProfile[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM qos_profiles ORDER BY name').all() as ProfileRow[];
  return rows.map(mapProfile);
}

export function getProfile(id: number): IQosProfile | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM qos_profiles WHERE id = ?').get(id) as ProfileRow | undefined;
  return row ? mapProfile(row) : null;
}

export function createProfile(
  name: string,
  storageNodeGroup: string,
  config: Omit<IQosConfig, 'storageNodeGroup'>,
): IQosProfile {
  const db = getDatabase();
  const configJson = JSON.stringify(config);

  const result = db.prepare(`
    INSERT INTO qos_profiles (name, storage_node_group, config_json)
    VALUES (?, ?, ?)
  `).run(name, storageNodeGroup, configJson);

  logger.info({ id: result.lastInsertRowid, name, storageNodeGroup }, 'QoS profile created');

  return getProfile(Number(result.lastInsertRowid))!;
}

export function updateProfile(
  id: number,
  updates: { name?: string; config?: Omit<IQosConfig, 'storageNodeGroup'> },
): IQosProfile | null {
  const db = getDatabase();

  const existing = getProfile(id);
  if (!existing) return null;

  if (updates.name !== undefined) {
    db.prepare('UPDATE qos_profiles SET name = ?, updated_at = unixepoch() WHERE id = ?')
      .run(updates.name, id);
  }

  if (updates.config !== undefined) {
    db.prepare('UPDATE qos_profiles SET config_json = ?, updated_at = unixepoch() WHERE id = ?')
      .run(JSON.stringify(updates.config), id);
  }

  logger.info({ id }, 'QoS profile updated');
  return getProfile(id);
}

export function deleteProfile(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM qos_profiles WHERE id = ?').run(id);
  if (result.changes > 0) {
    logger.info({ id }, 'QoS profile deleted');
  }
  return result.changes > 0;
}

// ──────────────────────────────────────────────
// Schedule CRUD
// ──────────────────────────────────────────────

export function listSchedules(profileId?: number): IQosSchedule[] {
  const db = getDatabase();

  if (profileId !== undefined) {
    const rows = db.prepare('SELECT * FROM qos_schedules WHERE profile_id = ? ORDER BY id')
      .all(profileId) as ScheduleRow[];
    return rows.map(mapSchedule);
  }

  const rows = db.prepare('SELECT * FROM qos_schedules ORDER BY id').all() as ScheduleRow[];
  return rows.map(mapSchedule);
}

export function getSchedule(id: number): IQosSchedule | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM qos_schedules WHERE id = ?').get(id) as ScheduleRow | undefined;
  return row ? mapSchedule(row) : null;
}

export function createSchedule(
  profileId: number,
  cronExpression: string,
  enabled: boolean = true,
): IQosSchedule {
  const db = getDatabase();

  const result = db.prepare(`
    INSERT INTO qos_schedules (profile_id, cron_expression, enabled)
    VALUES (?, ?, ?)
  `).run(profileId, cronExpression, enabled ? 1 : 0);

  logger.info({ id: result.lastInsertRowid, profileId, cronExpression }, 'QoS schedule created');

  return getSchedule(Number(result.lastInsertRowid))!;
}

export function updateSchedule(
  id: number,
  updates: { cronExpression?: string; enabled?: boolean },
): IQosSchedule | null {
  const db = getDatabase();

  const existing = getSchedule(id);
  if (!existing) return null;

  if (updates.cronExpression !== undefined) {
    db.prepare('UPDATE qos_schedules SET cron_expression = ?, updated_at = unixepoch() WHERE id = ?')
      .run(updates.cronExpression, id);
  }

  if (updates.enabled !== undefined) {
    db.prepare('UPDATE qos_schedules SET enabled = ?, updated_at = unixepoch() WHERE id = ?')
      .run(updates.enabled ? 1 : 0, id);
  }

  logger.info({ id }, 'QoS schedule updated');
  return getSchedule(id);
}

export function deleteSchedule(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM qos_schedules WHERE id = ?').run(id);
  if (result.changes > 0) {
    logger.info({ id }, 'QoS schedule deleted');
  }
  return result.changes > 0;
}

export function markScheduleRun(id: number): void {
  const db = getDatabase();
  db.prepare('UPDATE qos_schedules SET last_run_at = unixepoch() WHERE id = ?').run(id);
}

/**
 * Get all enabled schedules that are due to run.
 * A schedule is "due" if its cron expression matches the current time
 * and it hasn't run within the last minute.
 *
 * This is called by the scheduler to find profiles that need to be applied.
 * The actual cron matching is done by the caller (scheduler service).
 */
export function getEnabledSchedules(): Array<IQosSchedule & { profileName: string; storageNodeGroup: string; configJson: string }> {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT s.*, p.name as profile_name, p.storage_node_group, p.config_json
    FROM qos_schedules s
    JOIN qos_profiles p ON p.id = s.profile_id
    WHERE s.enabled = 1
    ORDER BY s.id
  `).all() as Array<ScheduleRow & { profile_name: string; storage_node_group: string; config_json: string }>;

  return rows.map((row) => ({
    ...mapSchedule(row),
    profileName: row.profile_name,
    storageNodeGroup: row.storage_node_group,
    configJson: row.config_json,
  }));
}

// ──────────────────────────────────────────────
// Row mappers
// ──────────────────────────────────────────────

function mapProfile(row: ProfileRow): IQosProfile {
  return {
    id: row.id,
    name: row.name,
    storageNodeGroup: row.storage_node_group,
    config: JSON.parse(row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSchedule(row: ScheduleRow): IQosSchedule {
  return {
    id: row.id,
    profileId: row.profile_id,
    cronExpression: row.cron_expression,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
