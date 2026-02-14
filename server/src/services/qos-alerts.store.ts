import { getDatabase } from '../db/index.js';
import { logger } from '../utils/logger.js';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface IQosAlertThreshold {
  id: number;
  storageNodeGroup: string;
  poolName: string | null;
  thresholdBytesPerSec: number;
  direction: 'above' | 'below';
  enabled: boolean;
  cooldownMinutes: number;
  createdAt: number;
  updatedAt: number;
}

export interface IQosAlertEvent {
  id: number;
  thresholdId: number;
  triggeredAt: number;
  actualBytesPerSec: number;
  acknowledged: boolean;
  acknowledgedAt: number | null;
}

interface ThresholdRow {
  id: number;
  storage_node_group: string;
  pool_name: string | null;
  threshold_bytes_per_sec: number;
  direction: string;
  enabled: number;
  cooldown_minutes: number;
  created_at: number;
  updated_at: number;
}

interface EventRow {
  id: number;
  threshold_id: number;
  triggered_at: number;
  actual_bytes_per_sec: number;
  acknowledged: number;
  acknowledged_at: number | null;
}

// ──────────────────────────────────────────────
// Threshold CRUD
// ──────────────────────────────────────────────

export function listThresholds(storageNodeGroup?: string): IQosAlertThreshold[] {
  const db = getDatabase();

  if (storageNodeGroup) {
    const rows = db.prepare('SELECT * FROM qos_alert_thresholds WHERE storage_node_group = ? ORDER BY id')
      .all(storageNodeGroup) as ThresholdRow[];
    return rows.map(mapThreshold);
  }

  const rows = db.prepare('SELECT * FROM qos_alert_thresholds ORDER BY id').all() as ThresholdRow[];
  return rows.map(mapThreshold);
}

export function getThreshold(id: number): IQosAlertThreshold | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM qos_alert_thresholds WHERE id = ?').get(id) as ThresholdRow | undefined;
  return row ? mapThreshold(row) : null;
}

export function createThreshold(params: {
  storageNodeGroup: string;
  poolName: string | null;
  thresholdBytesPerSec: number;
  direction: 'above' | 'below';
  cooldownMinutes?: number;
}): IQosAlertThreshold {
  const db = getDatabase();

  const result = db.prepare(`
    INSERT INTO qos_alert_thresholds (storage_node_group, pool_name, threshold_bytes_per_sec, direction, cooldown_minutes)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    params.storageNodeGroup,
    params.poolName,
    params.thresholdBytesPerSec,
    params.direction,
    params.cooldownMinutes ?? 15,
  );

  logger.info({ id: result.lastInsertRowid, ...params }, 'QoS alert threshold created');
  return getThreshold(Number(result.lastInsertRowid))!;
}

export function updateThreshold(
  id: number,
  updates: {
    thresholdBytesPerSec?: number;
    direction?: 'above' | 'below';
    enabled?: boolean;
    cooldownMinutes?: number;
  },
): IQosAlertThreshold | null {
  const db = getDatabase();

  const existing = getThreshold(id);
  if (!existing) return null;

  if (updates.thresholdBytesPerSec !== undefined) {
    db.prepare('UPDATE qos_alert_thresholds SET threshold_bytes_per_sec = ?, updated_at = unixepoch() WHERE id = ?')
      .run(updates.thresholdBytesPerSec, id);
  }

  if (updates.direction !== undefined) {
    db.prepare('UPDATE qos_alert_thresholds SET direction = ?, updated_at = unixepoch() WHERE id = ?')
      .run(updates.direction, id);
  }

  if (updates.enabled !== undefined) {
    db.prepare('UPDATE qos_alert_thresholds SET enabled = ?, updated_at = unixepoch() WHERE id = ?')
      .run(updates.enabled ? 1 : 0, id);
  }

  if (updates.cooldownMinutes !== undefined) {
    db.prepare('UPDATE qos_alert_thresholds SET cooldown_minutes = ?, updated_at = unixepoch() WHERE id = ?')
      .run(updates.cooldownMinutes, id);
  }

  logger.info({ id }, 'QoS alert threshold updated');
  return getThreshold(id);
}

export function deleteThreshold(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM qos_alert_thresholds WHERE id = ?').run(id);
  if (result.changes > 0) {
    logger.info({ id }, 'QoS alert threshold deleted');
  }
  return result.changes > 0;
}

// ──────────────────────────────────────────────
// Alert Event Operations
// ──────────────────────────────────────────────

/**
 * Check all enabled thresholds against current usage data.
 * Creates alert events for any thresholds that are triggered.
 * Respects cooldown periods to avoid alert storms.
 */
export function checkThresholds(
  usage: Array<{ storageNodeGroup: string; poolName: string | null; bytesPerSecond: number }>,
): IQosAlertEvent[] {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const triggered: IQosAlertEvent[] = [];

  const thresholds = db.prepare(
    'SELECT * FROM qos_alert_thresholds WHERE enabled = 1',
  ).all() as ThresholdRow[];

  for (const threshold of thresholds) {
    // Find matching usage entry
    const usageEntry = usage.find(
      (u) =>
        u.storageNodeGroup === threshold.storage_node_group &&
        u.poolName === threshold.pool_name,
    );

    if (!usageEntry) continue;

    // Check if threshold is breached
    const breached =
      threshold.direction === 'above'
        ? usageEntry.bytesPerSecond > threshold.threshold_bytes_per_sec
        : usageEntry.bytesPerSecond < threshold.threshold_bytes_per_sec;

    if (!breached) continue;

    // Check cooldown — has this threshold fired within the cooldown window?
    const cooldownCutoff = now - threshold.cooldown_minutes * 60;
    const recentEvent = db.prepare(`
      SELECT 1 FROM qos_alert_events
      WHERE threshold_id = ? AND triggered_at > ?
      LIMIT 1
    `).get(threshold.id, cooldownCutoff);

    if (recentEvent) continue; // Still in cooldown

    // Create alert event
    const result = db.prepare(`
      INSERT INTO qos_alert_events (threshold_id, actual_bytes_per_sec)
      VALUES (?, ?)
    `).run(threshold.id, Math.round(usageEntry.bytesPerSecond));

    const event = getEvent(Number(result.lastInsertRowid));
    if (event) {
      triggered.push(event);
      logger.warn(
        {
          thresholdId: threshold.id,
          storageNodeGroup: threshold.storage_node_group,
          poolName: threshold.pool_name,
          direction: threshold.direction,
          threshold: threshold.threshold_bytes_per_sec,
          actual: Math.round(usageEntry.bytesPerSecond),
        },
        'QoS alert threshold breached',
      );
    }
  }

  return triggered;
}

/**
 * Query alert events with optional filters.
 */
export function listEvents(options?: {
  thresholdId?: number;
  unacknowledgedOnly?: boolean;
  limit?: number;
}): IQosAlertEvent[] {
  const db = getDatabase();

  let sql = 'SELECT * FROM qos_alert_events WHERE 1=1';
  const params: (number)[] = [];

  if (options?.thresholdId !== undefined) {
    sql += ' AND threshold_id = ?';
    params.push(options.thresholdId);
  }

  if (options?.unacknowledgedOnly) {
    sql += ' AND acknowledged = 0';
  }

  sql += ' ORDER BY triggered_at DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(sql).all(...params) as EventRow[];
  return rows.map(mapEvent);
}

/**
 * Get a single alert event by ID.
 */
export function getEvent(id: number): IQosAlertEvent | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM qos_alert_events WHERE id = ?').get(id) as EventRow | undefined;
  return row ? mapEvent(row) : null;
}

/**
 * Acknowledge one or more alert events.
 */
export function acknowledgeEvents(eventIds: number[]): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE qos_alert_events
    SET acknowledged = 1, acknowledged_at = unixepoch()
    WHERE id = ? AND acknowledged = 0
  `);

  let count = 0;
  const ack = db.transaction(() => {
    for (const id of eventIds) {
      const result = stmt.run(id);
      count += result.changes;
    }
  });

  ack();

  if (count > 0) {
    logger.info({ count, eventIds }, 'QoS alert events acknowledged');
  }

  return count;
}

/**
 * Get count of unacknowledged events (for badge display).
 */
export function getUnacknowledgedCount(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) as count FROM qos_alert_events WHERE acknowledged = 0')
    .get() as { count: number };
  return row.count;
}

// ──────────────────────────────────────────────
// Row mappers
// ──────────────────────────────────────────────

function mapThreshold(row: ThresholdRow): IQosAlertThreshold {
  return {
    id: row.id,
    storageNodeGroup: row.storage_node_group,
    poolName: row.pool_name,
    thresholdBytesPerSec: row.threshold_bytes_per_sec,
    direction: row.direction as 'above' | 'below',
    enabled: row.enabled === 1,
    cooldownMinutes: row.cooldown_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row: EventRow): IQosAlertEvent {
  return {
    id: row.id,
    thresholdId: row.threshold_id,
    triggeredAt: row.triggered_at,
    actualBytesPerSec: row.actual_bytes_per_sec,
    acknowledged: row.acknowledged === 1,
    acknowledgedAt: row.acknowledged_at,
  };
}
