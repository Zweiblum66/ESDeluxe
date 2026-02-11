/**
 * Trash Store — SQLite metadata operations for trash entries.
 * Manages the trash_entries table and app_config settings.
 */
import { getDatabase } from '../../db/index.js';
import { logger } from '../../utils/logger.js';
import type { ITrashEntry, ITrashStats, ITrashConfig } from '../../../../shared/types/trash.js';

// ──────────────────────────────────────────────
// Row mapping
// ──────────────────────────────────────────────

interface TrashRow {
  id: number;
  space_name: string;
  original_path: string;
  original_name: string;
  entry_type: string;
  size_bytes: number;
  trash_path: string;
  deleted_at: number;
  deleted_by: string;
  expires_at: number;
  status: string;
}

function rowToEntry(row: TrashRow): ITrashEntry {
  return {
    id: row.id,
    spaceName: row.space_name,
    originalPath: row.original_path,
    originalName: row.original_name,
    entryType: row.entry_type as 'file' | 'directory',
    sizeBytes: row.size_bytes,
    trashPath: row.trash_path,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    expiresAt: row.expires_at,
    status: row.status as 'active' | 'restoring' | 'purging',
  };
}

// ──────────────────────────────────────────────
// CRUD operations
// ──────────────────────────────────────────────

export function createEntry(data: {
  spaceName: string;
  originalPath: string;
  originalName: string;
  entryType: 'file' | 'directory';
  sizeBytes: number;
  trashPath: string;
  deletedBy: string;
  retentionDays: number;
}): ITrashEntry {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + data.retentionDays * 86400;

  const stmt = db.prepare(`
    INSERT INTO trash_entries (space_name, original_path, original_name, entry_type, size_bytes, trash_path, deleted_at, deleted_by, expires_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `);

  const result = stmt.run(
    data.spaceName,
    data.originalPath,
    data.originalName,
    data.entryType,
    data.sizeBytes,
    data.trashPath,
    now,
    data.deletedBy,
    expiresAt,
  );

  logger.info(
    { id: result.lastInsertRowid, spaceName: data.spaceName, path: data.originalPath },
    'Trash entry created',
  );

  return getEntry(Number(result.lastInsertRowid))!;
}

export function getEntry(id: number): ITrashEntry | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM trash_entries WHERE id = ?').get(id) as TrashRow | undefined;
  return row ? rowToEntry(row) : null;
}

export function listEntries(filters?: {
  spaceName?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): ITrashEntry[] {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.spaceName) {
    conditions.push('space_name = ?');
    params.push(filters.spaceName);
  }
  if (filters?.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit ?? 500;
  const offset = filters?.offset ?? 0;

  const rows = db.prepare(
    `SELECT * FROM trash_entries ${where} ORDER BY deleted_at DESC LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset) as TrashRow[];

  return rows.map(rowToEntry);
}

export function updateStatus(id: number, status: 'active' | 'restoring' | 'purging'): void {
  const db = getDatabase();
  db.prepare('UPDATE trash_entries SET status = ? WHERE id = ?').run(status, id);
}

export function deleteEntry(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM trash_entries WHERE id = ?').run(id);
  logger.debug({ id }, 'Trash entry deleted from DB');
}

// ──────────────────────────────────────────────
// Queries for scheduler
// ──────────────────────────────────────────────

/** Get all active entries whose expiry time has passed */
export function getExpiredEntries(): ITrashEntry[] {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const rows = db.prepare(
    `SELECT * FROM trash_entries WHERE status = 'active' AND expires_at <= ? ORDER BY expires_at ASC`,
  ).all(now) as TrashRow[];

  return rows.map(rowToEntry);
}

/** Get total trash size (active items only) */
export function getTotalTrashSize(): number {
  const db = getDatabase();
  const row = db.prepare(
    `SELECT COALESCE(SUM(size_bytes), 0) as total FROM trash_entries WHERE status = 'active'`,
  ).get() as { total: number };
  return row.total;
}

// ──────────────────────────────────────────────
// Statistics
// ──────────────────────────────────────────────

export function getStats(): ITrashStats {
  const db = getDatabase();

  const totals = db.prepare(
    `SELECT COUNT(*) as total_items, COALESCE(SUM(size_bytes), 0) as total_size
     FROM trash_entries WHERE status = 'active'`,
  ).get() as { total_items: number; total_size: number };

  const perSpaceRows = db.prepare(
    `SELECT space_name, COUNT(*) as item_count, COALESCE(SUM(size_bytes), 0) as size_bytes
     FROM trash_entries WHERE status = 'active'
     GROUP BY space_name ORDER BY size_bytes DESC`,
  ).all() as { space_name: string; item_count: number; size_bytes: number }[];

  const now = Math.floor(Date.now() / 1000);
  const in24h = now + 86400;
  const expiring = db.prepare(
    `SELECT COUNT(*) as count FROM trash_entries
     WHERE status = 'active' AND expires_at <= ?`,
  ).get(in24h) as { count: number };

  const oldest = db.prepare(
    `SELECT MIN(deleted_at) as oldest FROM trash_entries WHERE status = 'active'`,
  ).get() as { oldest: number | null };

  return {
    totalItems: totals.total_items,
    totalSizeBytes: totals.total_size,
    perSpace: perSpaceRows.map((r) => ({
      spaceName: r.space_name,
      itemCount: r.item_count,
      sizeBytes: r.size_bytes,
    })),
    expiringWithin24h: expiring.count,
    oldestItemAt: oldest.oldest,
  };
}

// ──────────────────────────────────────────────
// Configuration (uses app_config table)
// ──────────────────────────────────────────────

export function getConfig(): ITrashConfig {
  const db = getDatabase();

  function getConfigValue(key: string, fallback: string): string {
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? fallback;
  }

  return {
    enabled: getConfigValue('trash.enabled', 'true') === 'true',
    retentionDays: parseInt(getConfigValue('trash.retention_days', '30'), 10),
    purgeIntervalMinutes: parseInt(getConfigValue('trash.purge_interval_minutes', '60'), 10),
    maxTrashSizeBytes: parseInt(getConfigValue('trash.max_size_bytes', '0'), 10),
  };
}

export function updateConfig(updates: Partial<ITrashConfig>): void {
  const db = getDatabase();
  const upsert = db.prepare(
    `INSERT INTO app_config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );

  const transaction = db.transaction(() => {
    if (updates.enabled !== undefined) {
      upsert.run('trash.enabled', String(updates.enabled));
    }
    if (updates.retentionDays !== undefined) {
      upsert.run('trash.retention_days', String(updates.retentionDays));
    }
    if (updates.purgeIntervalMinutes !== undefined) {
      upsert.run('trash.purge_interval_minutes', String(updates.purgeIntervalMinutes));
    }
    if (updates.maxTrashSizeBytes !== undefined) {
      upsert.run('trash.max_size_bytes', String(updates.maxTrashSizeBytes));
    }
  });

  transaction();
  logger.info({ updates }, 'Trash config updated');
}
