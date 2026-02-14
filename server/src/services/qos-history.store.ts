import { getDatabase } from '../db/index.js';
import { logger } from '../utils/logger.js';
import type { IBandwidthRecord } from '../../../shared/types/qos.js';

interface BandwidthRow {
  timestamp: number;
  pool_name: string;
  bytes_per_sec: number;
  storage_node_group: string;
}

/**
 * Insert bandwidth samples into the history table.
 * Called by the QoS scheduler after each poll.
 */
export function insertSamples(
  storageNodeGroup: string,
  samples: Array<{ poolName: string; bytesPerSecond: number }>,
): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO bandwidth_history (storage_node_group, pool_name, bytes_per_sec)
    VALUES (?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const sample of samples) {
      stmt.run(storageNodeGroup, sample.poolName, Math.round(sample.bytesPerSecond));
    }
  });

  insertAll();
  logger.debug(
    { storageNodeGroup, count: samples.length },
    'Bandwidth history samples inserted',
  );
}

/**
 * Query bandwidth history for a time range.
 * Optionally filter by storageNodeGroup and/or poolName.
 */
export function getHistory(options: {
  storageNodeGroup?: string;
  poolName?: string;
  from: number; // Unix timestamp
  to: number;   // Unix timestamp
}): IBandwidthRecord[] {
  const db = getDatabase();

  let sql = `
    SELECT timestamp, pool_name, bytes_per_sec, storage_node_group
    FROM bandwidth_history
    WHERE timestamp >= ? AND timestamp <= ?
  `;
  const params: (string | number)[] = [options.from, options.to];

  if (options.storageNodeGroup) {
    sql += ' AND storage_node_group = ?';
    params.push(options.storageNodeGroup);
  }

  if (options.poolName) {
    sql += ' AND pool_name = ?';
    params.push(options.poolName);
  }

  sql += ' ORDER BY timestamp ASC';

  const rows = db.prepare(sql).all(...params) as BandwidthRow[];

  return rows.map((row) => ({
    timestamp: row.timestamp,
    poolName: row.pool_name,
    bytesPerSecond: row.bytes_per_sec,
    storageNodeGroup: row.storage_node_group,
  }));
}

/**
 * Delete records older than the specified number of days.
 * Called periodically by the scheduler to prevent unbounded growth.
 */
export function cleanOldRecords(retentionDays: number): number {
  const db = getDatabase();

  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86400;

  const result = db.prepare(`
    DELETE FROM bandwidth_history WHERE timestamp < ?
  `).run(cutoff);

  if (result.changes > 0) {
    logger.info(
      { retentionDays, deleted: result.changes },
      'Old bandwidth history records cleaned',
    );
  }

  return result.changes;
}
