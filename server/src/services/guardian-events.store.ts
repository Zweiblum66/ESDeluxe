import { getDatabase } from '../db/index.js';
import { logger } from '../utils/logger.js';
import type { GuardianEventType, IGuardianEvent, InsertGuardianEvent } from '../../../shared/types/guardian.js';

export type { GuardianEventType, IGuardianEvent, InsertGuardianEvent };

interface EventRow {
  id: number;
  received_at: number;
  event_type: string;
  event_action: string | null;
  timestamp: string | null;
  source_host: string | null;
  username: string | null;
  space_name: string | null;
  pool_name: string | null;
  storage_node_group: string | null;
  file_path: string | null;
  bytes_transferred: number | null;
  client_ip: string | null;
  details_json: string | null;
  severity: string;
}

// ──────────────────────────────────────────────
// Insert
// ──────────────────────────────────────────────

/**
 * Insert a single Guardian event.
 */
export function insertEvent(event: InsertGuardianEvent): void {
  const db = getDatabase();

  db.prepare(`
    INSERT INTO guardian_events (
      event_type, event_action, timestamp, source_host, username,
      space_name, pool_name, storage_node_group, file_path,
      bytes_transferred, client_ip, details_json, severity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventType,
    event.eventAction ?? null,
    event.timestamp ?? null,
    event.sourceHost ?? null,
    event.username ?? null,
    event.spaceName ?? null,
    event.poolName ?? null,
    event.storageNodeGroup ?? null,
    event.filePath ?? null,
    event.bytesTransferred ?? null,
    event.clientIp ?? null,
    event.detailsJson ?? null,
    event.severity ?? 'info',
  );
}

/**
 * Batch insert multiple Guardian events in a single transaction.
 */
export function insertEvents(events: InsertGuardianEvent[]): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO guardian_events (
      event_type, event_action, timestamp, source_host, username,
      space_name, pool_name, storage_node_group, file_path,
      bytes_transferred, client_ip, details_json, severity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  const batch = db.transaction(() => {
    for (const event of events) {
      stmt.run(
        event.eventType,
        event.eventAction ?? null,
        event.timestamp ?? null,
        event.sourceHost ?? null,
        event.username ?? null,
        event.spaceName ?? null,
        event.poolName ?? null,
        event.storageNodeGroup ?? null,
        event.filePath ?? null,
        event.bytesTransferred ?? null,
        event.clientIp ?? null,
        event.detailsJson ?? null,
        event.severity ?? 'info',
      );
      count++;
    }
  });

  batch();
  return count;
}

// ──────────────────────────────────────────────
// Query
// ──────────────────────────────────────────────

export interface QueryEventsOptions {
  eventType?: GuardianEventType;
  eventAction?: string;
  username?: string;
  spaceName?: string;
  from?: number;  // Unix timestamp
  to?: number;    // Unix timestamp
  limit?: number;
  offset?: number;
}

export function queryEvents(options: QueryEventsOptions = {}): IGuardianEvent[] {
  const db = getDatabase();

  let sql = 'SELECT * FROM guardian_events WHERE 1=1';
  const params: (string | number)[] = [];

  if (options.eventType) {
    sql += ' AND event_type = ?';
    params.push(options.eventType);
  }

  if (options.eventAction) {
    sql += ' AND event_action = ?';
    params.push(options.eventAction);
  }

  if (options.username) {
    sql += ' AND username = ?';
    params.push(options.username);
  }

  if (options.spaceName) {
    sql += ' AND space_name = ?';
    params.push(options.spaceName);
  }

  if (options.from !== undefined) {
    sql += ' AND received_at >= ?';
    params.push(options.from);
  }

  if (options.to !== undefined) {
    sql += ' AND received_at <= ?';
    params.push(options.to);
  }

  sql += ' ORDER BY received_at DESC';

  const limit = options.limit ?? 200;
  sql += ' LIMIT ?';
  params.push(limit);

  if (options.offset) {
    sql += ' OFFSET ?';
    params.push(options.offset);
  }

  const rows = db.prepare(sql).all(...params) as EventRow[];
  return rows.map(mapEvent);
}

/**
 * Get event counts grouped by event_type for a time range.
 */
export function getEventStats(from?: number, to?: number): Array<{ eventType: string; count: number }> {
  const db = getDatabase();

  let sql = 'SELECT event_type, COUNT(*) as count FROM guardian_events WHERE 1=1';
  const params: number[] = [];

  if (from !== undefined) {
    sql += ' AND received_at >= ?';
    params.push(from);
  }

  if (to !== undefined) {
    sql += ' AND received_at <= ?';
    params.push(to);
  }

  sql += ' GROUP BY event_type ORDER BY count DESC';

  const rows = db.prepare(sql).all(...params) as Array<{ event_type: string; count: number }>;
  return rows.map((r) => ({ eventType: r.event_type, count: r.count }));
}

/**
 * Get total event count.
 */
export function getTotalCount(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) as count FROM guardian_events').get() as { count: number };
  return row.count;
}

// ──────────────────────────────────────────────
// Timeline (bucketed counts for chart)
// ──────────────────────────────────────────────

export interface TimelineBucket {
  bucket: number;
  file_audit: number;
  storage: number;
  system: number;
}

/**
 * Get event counts bucketed by time interval, grouped by event type.
 */
export function getEventTimeline(from: number, to: number, bucketCount = 24): TimelineBucket[] {
  const db = getDatabase();
  const range = to - from;
  const bucketSize = Math.max(1, Math.floor(range / bucketCount));

  const rows = db.prepare(`
    SELECT
      (received_at - ?) / ? AS bucket_idx,
      event_type,
      COUNT(*) AS count
    FROM guardian_events
    WHERE received_at >= ? AND received_at <= ?
    GROUP BY bucket_idx, event_type
    ORDER BY bucket_idx ASC
  `).all(from, bucketSize, from, to) as Array<{
    bucket_idx: number;
    event_type: string;
    count: number;
  }>;

  // Build full bucket array (including empty buckets)
  const buckets: TimelineBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    buckets.push({
      bucket: from + i * bucketSize,
      file_audit: 0,
      storage: 0,
      system: 0,
    });
  }

  for (const row of rows) {
    const idx = Math.max(0, Math.min(row.bucket_idx, bucketCount - 1));
    const b = buckets[idx];
    if (!b) continue;
    const type = row.event_type as GuardianEventType;
    if (type in b) {
      b[type] = row.count;
    }
  }

  return buckets;
}

// ──────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────

/**
 * Delete events older than the specified number of days.
 */
export function cleanOldEvents(retentionDays: number): number {
  const db = getDatabase();

  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86400;

  const result = db.prepare('DELETE FROM guardian_events WHERE received_at < ?').run(cutoff);

  if (result.changes > 0) {
    logger.info({ retentionDays, deleted: result.changes }, 'Old Guardian events cleaned');
  }

  return result.changes;
}

// ──────────────────────────────────────────────
// Row mapper
// ──────────────────────────────────────────────

function mapEvent(row: EventRow): IGuardianEvent {
  return {
    id: row.id,
    receivedAt: row.received_at,
    eventType: row.event_type as GuardianEventType,
    eventAction: row.event_action,
    timestamp: row.timestamp,
    sourceHost: row.source_host,
    username: row.username,
    spaceName: row.space_name,
    poolName: row.pool_name,
    storageNodeGroup: row.storage_node_group,
    filePath: row.file_path,
    bytesTransferred: row.bytes_transferred,
    clientIp: row.client_ip,
    detailsJson: row.details_json,
    severity: row.severity,
  };
}
