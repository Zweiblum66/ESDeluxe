import { getDatabase } from '../../db/index.js';
import { logger } from '../../utils/logger.js';
import type {
  IArchiveLocation,
  IArchiveCatalogEntry,
  IArchiveStats,
  IArchiveCatalogQuery,
  IArchiveCatalogResult,
  ICreateArchiveLocationRequest,
  IUpdateArchiveLocationRequest,
  ArchiveLocationType,
  ArchiveLocationConfig,
  ArchiveCatalogStatus,
} from '../../../../shared/types/archive.js';

// ──────────────────────────────────────────────
// Row Interfaces
// ──────────────────────────────────────────────

interface LocationRow {
  id: number;
  name: string;
  type: string;
  config: string;
  description: string | null;
  enabled: number;
  total_size: number;
  file_count: number;
  priority: number;
  last_activity_at: number | null;
  created_at: number;
  updated_at: number;
}

interface CatalogRow {
  id: number;
  original_space: string;
  original_path: string;
  original_size: number;
  original_mtime: number | null;
  checksum: string;
  archive_location_id: number;
  archive_location_name?: string;
  archive_path: string;
  status: string;
  archived_at: number;
  archived_by: string | null;
  restored_at: number | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

// ──────────────────────────────────────────────
// Row Mappers
// ──────────────────────────────────────────────

function rowToLocation(row: LocationRow): IArchiveLocation {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ArchiveLocationType,
    config: JSON.parse(row.config) as ArchiveLocationConfig,
    description: row.description || undefined,
    enabled: !!row.enabled,
    totalSize: row.total_size,
    fileCount: row.file_count,
    priority: row.priority,
    lastActivityAt: row.last_activity_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToCatalogEntry(row: CatalogRow): IArchiveCatalogEntry {
  return {
    id: row.id,
    originalSpace: row.original_space,
    originalPath: row.original_path,
    originalSize: row.original_size,
    originalMtime: row.original_mtime || undefined,
    checksum: row.checksum,
    archiveLocationId: row.archive_location_id,
    archiveLocationName: row.archive_location_name || undefined,
    archivePath: row.archive_path,
    status: row.status as ArchiveCatalogStatus,
    archivedAt: row.archived_at,
    archivedBy: row.archived_by || undefined,
    restoredAt: row.restored_at || undefined,
    errorMessage: row.error_message || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ──────────────────────────────────────────────
// Archive Locations CRUD
// ──────────────────────────────────────────────

export function listLocations(): IArchiveLocation[] {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM archive_locations ORDER BY name`);
  return (stmt.all() as LocationRow[]).map(rowToLocation);
}

export function getLocation(id: number): IArchiveLocation | null {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM archive_locations WHERE id = ?`);
  const row = stmt.get(id) as LocationRow | undefined;
  return row ? rowToLocation(row) : null;
}

export function createLocation(request: ICreateArchiveLocationRequest): IArchiveLocation {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO archive_locations (name, type, config, description, priority)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    request.name,
    request.type,
    JSON.stringify(request.config),
    request.description || null,
    request.priority ?? 50,
  );

  const locationId = Number(result.lastInsertRowid);
  logger.info({ locationId, name: request.name, type: request.type }, 'Archive location created');

  return getLocation(locationId)!;
}

export function updateLocation(id: number, request: IUpdateArchiveLocationRequest): IArchiveLocation | null {
  const db = getDatabase();

  const sets: string[] = ['updated_at = unixepoch()'];
  const params: unknown[] = [];

  if (request.name !== undefined) { sets.push('name = ?'); params.push(request.name); }
  if (request.config !== undefined) { sets.push('config = ?'); params.push(JSON.stringify(request.config)); }
  if (request.description !== undefined) { sets.push('description = ?'); params.push(request.description || null); }
  if (request.enabled !== undefined) { sets.push('enabled = ?'); params.push(request.enabled ? 1 : 0); }
  if (request.priority !== undefined) { sets.push('priority = ?'); params.push(request.priority); }

  params.push(id);

  const stmt = db.prepare(`UPDATE archive_locations SET ${sets.join(', ')} WHERE id = ?`);
  const result = stmt.run(...params);

  if (result.changes === 0) return null;

  logger.info({ locationId: id }, 'Archive location updated');
  return getLocation(id);
}

export function deleteLocation(id: number): boolean {
  const db = getDatabase();

  // Check for existing catalog entries
  const entryCount = db.prepare(
    `SELECT COUNT(*) as count FROM archive_catalog WHERE archive_location_id = ? AND status IN ('archiving', 'archived')`,
  ).get(id) as { count: number };

  if (entryCount.count > 0) {
    throw new Error(`Cannot delete archive location: ${entryCount.count} active entries still reference it`);
  }

  const stmt = db.prepare(`DELETE FROM archive_locations WHERE id = ?`);
  const result = stmt.run(id);
  if (result.changes > 0) {
    logger.info({ locationId: id }, 'Archive location deleted');
  }
  return result.changes > 0;
}

export function updateLocationStats(id: number, sizeDelta: number, countDelta: number): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE archive_locations SET
      total_size = MAX(0, total_size + ?),
      file_count = MAX(0, file_count + ?),
      last_activity_at = unixepoch(),
      updated_at = unixepoch()
    WHERE id = ?
  `);
  stmt.run(sizeDelta, countDelta, id);
}

// ──────────────────────────────────────────────
// Archive Catalog CRUD
// ──────────────────────────────────────────────

export function createCatalogEntry(entry: {
  originalSpace: string;
  originalPath: string;
  originalSize: number;
  originalMtime?: number;
  checksum: string;
  archiveLocationId: number;
  archivePath: string;
  status?: ArchiveCatalogStatus;
  archivedBy?: string;
}): IArchiveCatalogEntry {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO archive_catalog (
      original_space, original_path, original_size, original_mtime,
      checksum, archive_location_id, archive_path, status, archived_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    entry.originalSpace,
    entry.originalPath,
    entry.originalSize,
    entry.originalMtime || null,
    entry.checksum,
    entry.archiveLocationId,
    entry.archivePath,
    entry.status || 'archiving',
    entry.archivedBy || null,
  );

  const entryId = Number(result.lastInsertRowid);
  logger.info(
    { entryId, space: entry.originalSpace, path: entry.originalPath },
    'Archive catalog entry created',
  );

  return getCatalogEntry(entryId)!;
}

export function updateCatalogEntry(
  id: number,
  update: {
    status?: ArchiveCatalogStatus;
    checksum?: string;
    archivePath?: string;
    restoredAt?: number;
    errorMessage?: string;
    originalPath?: string;
  },
): void {
  const db = getDatabase();

  const sets: string[] = ['updated_at = unixepoch()'];
  const params: unknown[] = [];

  if (update.status !== undefined) { sets.push('status = ?'); params.push(update.status); }
  if (update.checksum !== undefined) { sets.push('checksum = ?'); params.push(update.checksum); }
  if (update.archivePath !== undefined) { sets.push('archive_path = ?'); params.push(update.archivePath); }
  if (update.restoredAt !== undefined) { sets.push('restored_at = ?'); params.push(update.restoredAt); }
  if (update.errorMessage !== undefined) { sets.push('error_message = ?'); params.push(update.errorMessage || null); }
  if (update.originalPath !== undefined) { sets.push('original_path = ?'); params.push(update.originalPath); }

  params.push(id);

  const stmt = db.prepare(`UPDATE archive_catalog SET ${sets.join(', ')} WHERE id = ?`);
  stmt.run(...params);
}

export function getCatalogEntry(id: number): IArchiveCatalogEntry | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT c.*, l.name as archive_location_name
    FROM archive_catalog c
    LEFT JOIN archive_locations l ON l.id = c.archive_location_id
    WHERE c.id = ?
  `);
  const row = stmt.get(id) as CatalogRow | undefined;
  return row ? rowToCatalogEntry(row) : null;
}

export function getCatalogEntryByPath(spaceName: string, filePath: string): IArchiveCatalogEntry | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT c.*, l.name as archive_location_name
    FROM archive_catalog c
    LEFT JOIN archive_locations l ON l.id = c.archive_location_id
    WHERE c.original_space = ? AND c.original_path = ?
      AND c.status IN ('archiving', 'archived')
    ORDER BY c.archived_at DESC LIMIT 1
  `);
  const row = stmt.get(spaceName, filePath) as CatalogRow | undefined;
  return row ? rowToCatalogEntry(row) : null;
}

export function queryCatalog(query: IArchiveCatalogQuery): IArchiveCatalogResult {
  const db = getDatabase();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.spaceName) { conditions.push('c.original_space = ?'); params.push(query.spaceName); }
  if (query.locationId) { conditions.push('c.archive_location_id = ?'); params.push(query.locationId); }
  if (query.status) { conditions.push('c.status = ?'); params.push(query.status); }
  if (query.searchTerm) {
    conditions.push('(c.original_path LIKE ? OR c.original_space LIKE ?)');
    params.push(`%${query.searchTerm}%`, `%${query.searchTerm}%`);
  }
  if (query.dateFrom) { conditions.push('c.archived_at >= ?'); params.push(query.dateFrom); }
  if (query.dateTo) { conditions.push('c.archived_at <= ?'); params.push(query.dateTo); }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM archive_catalog c ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  // Fetch page
  const limit = query.limit || 50;
  const offset = query.offset || 0;

  const dataStmt = db.prepare(`
    SELECT c.*, l.name as archive_location_name
    FROM archive_catalog c
    LEFT JOIN archive_locations l ON l.id = c.archive_location_id
    ${whereClause}
    ORDER BY c.archived_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = dataStmt.all(...params, limit, offset) as CatalogRow[];

  return {
    entries: rows.map(rowToCatalogEntry),
    total,
  };
}

export function deleteCatalogEntry(id: number): boolean {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM archive_catalog WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}

// ──────────────────────────────────────────────
// Priority-based lookups
// ──────────────────────────────────────────────

/**
 * Returns ALL catalog entries for a given file path (space + path) with status='archived',
 * joined with location data and ordered by location priority ASC (lowest = highest priority).
 */
export function getCatalogEntriesByPath(spaceName: string, filePath: string): IArchiveCatalogEntry[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT c.*, l.name as archive_location_name
    FROM archive_catalog c
    LEFT JOIN archive_locations l ON l.id = c.archive_location_id
    WHERE c.original_space = ? AND c.original_path = ?
      AND c.status = 'archived'
      AND l.enabled = 1
    ORDER BY l.priority ASC, c.archived_at DESC
  `);
  const rows = stmt.all(spaceName, filePath) as CatalogRow[];
  return rows.map(rowToCatalogEntry);
}

/**
 * Returns enabled locations ordered by priority ASC (lowest = highest priority).
 */
export function getLocationsByPriority(): IArchiveLocation[] {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM archive_locations WHERE enabled = 1 ORDER BY priority ASC`);
  return (stmt.all() as LocationRow[]).map(rowToLocation);
}

// ──────────────────────────────────────────────
// Archive Stats
// ──────────────────────────────────────────────

export function getArchiveStats(): IArchiveStats {
  const db = getDatabase();

  // Totals across all archived files
  const totals = db.prepare(`
    SELECT COUNT(*) as total_files, COALESCE(SUM(original_size), 0) as total_size
    FROM archive_catalog
    WHERE status = 'archived'
  `).get() as { total_files: number; total_size: number };

  // Per-location breakdown
  const breakdown = db.prepare(`
    SELECT
      l.id as location_id,
      l.name as location_name,
      l.type as location_type,
      l.enabled,
      COUNT(c.id) as file_count,
      COALESCE(SUM(c.original_size), 0) as total_size
    FROM archive_locations l
    LEFT JOIN archive_catalog c ON c.archive_location_id = l.id AND c.status = 'archived'
    GROUP BY l.id
    ORDER BY l.name
  `).all() as {
    location_id: number;
    location_name: string;
    location_type: string;
    enabled: number;
    file_count: number;
    total_size: number;
  }[];

  // Recent activity (last 20 entries)
  const recentRows = db.prepare(`
    SELECT c.*, l.name as archive_location_name
    FROM archive_catalog c
    LEFT JOIN archive_locations l ON l.id = c.archive_location_id
    ORDER BY c.updated_at DESC
    LIMIT 20
  `).all() as CatalogRow[];

  return {
    totalFiles: totals.total_files,
    totalSize: totals.total_size,
    locationBreakdown: breakdown.map((b) => ({
      locationId: b.location_id,
      locationName: b.location_name,
      locationType: b.location_type as ArchiveLocationType,
      fileCount: b.file_count,
      totalSize: b.total_size,
      enabled: !!b.enabled,
    })),
    recentActivity: recentRows.map(rowToCatalogEntry),
  };
}
