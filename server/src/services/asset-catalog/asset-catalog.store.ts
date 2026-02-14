import { getDatabase } from '../../db/index.js';
import { logger } from '../../utils/logger.js';
import type {
  IAsset,
  IAssetFile,
  IAssetScanLog,
  IAssetScanConfig,
  IAssetCatalogQuery,
  IAssetCatalogResult,
  IAssetCatalogStats,
  AssetType,
  AssetArchiveStatus,
  AssetFileType,
  AssetFileRole,
  ProxyStatus,
  ScanStatus,
  ScanType,
  IAssetMetadata,
} from '../../../../shared/types/asset-catalog.js';

// ──────────────────────────────────────────────
// Row Interfaces
// ──────────────────────────────────────────────

interface AssetRow {
  id: number;
  space_name: string;
  directory_path: string;
  name: string;
  asset_type: string;
  file_count: number;
  total_size: number;
  primary_file_id: number | null;
  thumbnail_path: string | null;
  proxy_path: string | null;
  proxy_status: string;
  metadata: string | null;
  first_seen_at: number;
  last_scanned_at: number;
  created_at: number;
  updated_at: number;
  // Computed column (from queryAssets)
  archive_status?: string;
}

interface AssetFileRow {
  id: number;
  asset_id: number;
  space_name: string;
  file_path: string;
  file_name: string;
  file_size: number;
  file_mtime: number;
  file_type: string;
  role: string;
  checksum: string | null;
  checksum_computed_at: number | null;
  is_archive_stub: number;
  inode: number | null;
  created_at: number;
  updated_at: number;
}

interface ScanLogRow {
  id: number;
  space_name: string;
  scan_type: string;
  status: string;
  files_discovered: number;
  files_new: number;
  files_updated: number;
  files_removed: number;
  assets_created: number;
  assets_updated: number;
  error_message: string | null;
  jobs_queued: number;
  started_at: number;
  completed_at: number | null;
  created_at: number;
}

interface ScanConfigRow {
  space_name: string;
  enabled: number;
  interval_hours: number;
  last_scan_at: number | null;
  next_scan_at: number | null;
  created_at: number;
  updated_at: number;
}

// ──────────────────────────────────────────────
// Row Mappers
// ──────────────────────────────────────────────

function rowToAsset(row: AssetRow): IAsset {
  let metadata: IAssetMetadata | undefined;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata) as IAssetMetadata;
    } catch {
      logger.warn({ assetId: row.id }, 'Failed to parse asset metadata JSON');
    }
  }

  return {
    id: row.id,
    spaceName: row.space_name,
    directoryPath: row.directory_path,
    name: row.name,
    assetType: row.asset_type as AssetType,
    fileCount: row.file_count,
    totalSize: row.total_size,
    primaryFileId: row.primary_file_id || undefined,
    thumbnailPath: row.thumbnail_path || undefined,
    proxyPath: row.proxy_path || undefined,
    proxyStatus: row.proxy_status as ProxyStatus,
    metadata,
    firstSeenAt: row.first_seen_at,
    lastScannedAt: row.last_scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archiveStatus: (row.archive_status as AssetArchiveStatus) || undefined,
  };
}

function rowToAssetFile(row: AssetFileRow): IAssetFile {
  return {
    id: row.id,
    assetId: row.asset_id,
    spaceName: row.space_name,
    filePath: row.file_path,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileMtime: row.file_mtime,
    fileType: row.file_type as AssetFileType,
    role: row.role as AssetFileRole,
    checksum: row.checksum || undefined,
    checksumComputedAt: row.checksum_computed_at || undefined,
    isArchiveStub: !!row.is_archive_stub,
    inode: row.inode || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToScanLog(row: ScanLogRow): IAssetScanLog {
  return {
    id: row.id,
    spaceName: row.space_name,
    scanType: row.scan_type as ScanType,
    status: row.status as ScanStatus,
    filesDiscovered: row.files_discovered,
    filesNew: row.files_new,
    filesUpdated: row.files_updated,
    filesRemoved: row.files_removed,
    assetsCreated: row.assets_created,
    assetsUpdated: row.assets_updated,
    errorMessage: row.error_message || undefined,
    jobsQueued: row.jobs_queued || undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at || undefined,
  };
}

function rowToScanConfig(row: ScanConfigRow): IAssetScanConfig {
  return {
    spaceName: row.space_name,
    enabled: !!row.enabled,
    intervalHours: row.interval_hours,
    lastScanAt: row.last_scan_at || undefined,
    nextScanAt: row.next_scan_at || undefined,
  };
}

// ──────────────────────────────────────────────
// Assets CRUD
// ──────────────────────────────────────────────

export function createAsset(asset: {
  spaceName: string;
  directoryPath: string;
  name: string;
  assetType: AssetType;
  fileCount?: number;
  totalSize?: number;
  primaryFileId?: number;
  metadata?: IAssetMetadata;
}): IAsset {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO assets (space_name, directory_path, name, asset_type, file_count, total_size, primary_file_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    asset.spaceName,
    asset.directoryPath,
    asset.name,
    asset.assetType,
    asset.fileCount ?? 0,
    asset.totalSize ?? 0,
    asset.primaryFileId ?? null,
    asset.metadata ? JSON.stringify(asset.metadata) : null,
  );

  const assetId = Number(result.lastInsertRowid);
  logger.debug({ assetId, name: asset.name, space: asset.spaceName }, 'Asset created');

  return getAsset(assetId)!;
}

export function getAsset(id: number): IAsset | null {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM assets WHERE id = ?`);
  const row = stmt.get(id) as AssetRow | undefined;
  return row ? rowToAsset(row) : null;
}

export function getAssetWithFiles(id: number): IAsset | null {
  const asset = getAsset(id);
  if (!asset) return null;

  asset.files = getAssetFiles(id);
  if (asset.primaryFileId) {
    asset.primaryFile = asset.files.find((f) => f.id === asset.primaryFileId);
  }

  // Compute archive status from files
  if (asset.files.length > 0) {
    const stubCount = asset.files.filter((f) => f.isArchiveStub).length;
    if (stubCount === asset.files.length) asset.archiveStatus = 'archived';
    else if (stubCount > 0) asset.archiveStatus = 'partial';
    else asset.archiveStatus = 'online';
  } else {
    asset.archiveStatus = 'online';
  }

  return asset;
}

export function updateAsset(
  id: number,
  update: {
    name?: string;
    assetType?: AssetType;
    fileCount?: number;
    totalSize?: number;
    primaryFileId?: number | null;
    thumbnailPath?: string | null;
    proxyPath?: string | null;
    proxyStatus?: ProxyStatus;
    metadata?: IAssetMetadata | null;
    lastScannedAt?: number;
  },
): IAsset | null {
  const db = getDatabase();

  const sets: string[] = ['updated_at = unixepoch()'];
  const params: unknown[] = [];

  if (update.name !== undefined) { sets.push('name = ?'); params.push(update.name); }
  if (update.assetType !== undefined) { sets.push('asset_type = ?'); params.push(update.assetType); }
  if (update.fileCount !== undefined) { sets.push('file_count = ?'); params.push(update.fileCount); }
  if (update.totalSize !== undefined) { sets.push('total_size = ?'); params.push(update.totalSize); }
  if (update.primaryFileId !== undefined) { sets.push('primary_file_id = ?'); params.push(update.primaryFileId); }
  if (update.thumbnailPath !== undefined) { sets.push('thumbnail_path = ?'); params.push(update.thumbnailPath); }
  if (update.proxyPath !== undefined) { sets.push('proxy_path = ?'); params.push(update.proxyPath); }
  if (update.proxyStatus !== undefined) { sets.push('proxy_status = ?'); params.push(update.proxyStatus); }
  if (update.metadata !== undefined) {
    sets.push('metadata = ?');
    params.push(update.metadata ? JSON.stringify(update.metadata) : null);
  }
  if (update.lastScannedAt !== undefined) { sets.push('last_scanned_at = ?'); params.push(update.lastScannedAt); }

  params.push(id);

  const stmt = db.prepare(`UPDATE assets SET ${sets.join(', ')} WHERE id = ?`);
  const result = stmt.run(...params);

  if (result.changes === 0) return null;
  return getAsset(id);
}

export function deleteAsset(id: number): boolean {
  const db = getDatabase();
  // asset_files are cascaded via ON DELETE CASCADE
  const stmt = db.prepare(`DELETE FROM assets WHERE id = ?`);
  const result = stmt.run(id);
  if (result.changes > 0) {
    logger.info({ assetId: id }, 'Asset deleted');
  }
  return result.changes > 0;
}

export function getAssetBySpaceAndDir(
  spaceName: string,
  directoryPath: string,
  name: string,
): IAsset | null {
  const db = getDatabase();
  const stmt = db.prepare(
    `SELECT * FROM assets WHERE space_name = ? AND directory_path = ? AND name = ?`,
  );
  const row = stmt.get(spaceName, directoryPath, name) as AssetRow | undefined;
  return row ? rowToAsset(row) : null;
}

export function getAssetsBySpace(spaceName: string): IAsset[] {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM assets WHERE space_name = ? ORDER BY directory_path, name`);
  return (stmt.all(spaceName) as AssetRow[]).map(rowToAsset);
}

export function queryAssets(query: IAssetCatalogQuery): IAssetCatalogResult {
  const db = getDatabase();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.spaceName) { conditions.push('a.space_name = ?'); params.push(query.spaceName); }
  if (query.directoryPath) {
    conditions.push('(a.directory_path = ? OR a.directory_path LIKE ?)');
    params.push(query.directoryPath, query.directoryPath + '/%');
  }
  if (query.assetType) { conditions.push('a.asset_type = ?'); params.push(query.assetType); }
  if (query.proxyStatus) { conditions.push('a.proxy_status = ?'); params.push(query.proxyStatus); }
  if (query.searchTerm) {
    conditions.push('(a.name LIKE ? OR a.directory_path LIKE ?)');
    params.push(`%${query.searchTerm}%`, `%${query.searchTerm}%`);
  }

  // Archive status filter — computed from asset_files.is_archive_stub
  if (query.archiveStatus === 'archived') {
    conditions.push('(SELECT COUNT(*) FROM asset_files af WHERE af.asset_id = a.id AND af.is_archive_stub = 1) = a.file_count');
    conditions.push('a.file_count > 0');
  } else if (query.archiveStatus === 'partial') {
    conditions.push('(SELECT COUNT(*) FROM asset_files af WHERE af.asset_id = a.id AND af.is_archive_stub = 1) > 0');
    conditions.push('(SELECT COUNT(*) FROM asset_files af WHERE af.asset_id = a.id AND af.is_archive_stub = 1) < a.file_count');
  } else if (query.archiveStatus === 'online') {
    conditions.push('(SELECT COUNT(*) FROM asset_files af WHERE af.asset_id = a.id AND af.is_archive_stub = 1) = 0');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM assets a ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  // Fetch page
  const limit = query.limit || 50;
  const offset = query.offset || 0;

  const dataStmt = db.prepare(`
    SELECT a.*,
      CASE
        WHEN a.file_count > 0 AND (SELECT COUNT(*) FROM asset_files af WHERE af.asset_id = a.id AND af.is_archive_stub = 1) = a.file_count
          THEN 'archived'
        WHEN (SELECT COUNT(*) FROM asset_files af WHERE af.asset_id = a.id AND af.is_archive_stub = 1) > 0
          THEN 'partial'
        ELSE 'online'
      END as archive_status
    FROM assets a
    ${whereClause}
    ORDER BY a.directory_path, a.name
    LIMIT ? OFFSET ?
  `);
  const rows = dataStmt.all(...params, limit, offset) as AssetRow[];

  return {
    assets: rows.map(rowToAsset),
    total,
  };
}

/**
 * Delete all assets (and cascade files) for a given space and directory.
 * Used by scanner to clean up removed directories.
 */
export function deleteAssetsBySpaceDir(spaceName: string, directoryPath: string): number {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM assets WHERE space_name = ? AND directory_path = ?`);
  const result = stmt.run(spaceName, directoryPath);
  return result.changes;
}

// ──────────────────────────────────────────────
// Asset Files CRUD
// ──────────────────────────────────────────────

export function createAssetFile(file: {
  assetId: number;
  spaceName: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileMtime: number;
  fileType?: AssetFileType;
  role?: AssetFileRole;
  checksum?: string;
  isArchiveStub?: boolean;
  inode?: number;
}): IAssetFile {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO asset_files (
      asset_id, space_name, file_path, file_name, file_size, file_mtime,
      file_type, role, checksum, is_archive_stub, inode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    file.assetId,
    file.spaceName,
    file.filePath,
    file.fileName,
    file.fileSize,
    file.fileMtime,
    file.fileType ?? 'unknown',
    file.role ?? 'component',
    file.checksum ?? null,
    file.isArchiveStub ? 1 : 0,
    file.inode ?? null,
  );

  const fileId = Number(result.lastInsertRowid);
  return getAssetFile(fileId)!;
}

export function upsertAssetFile(file: {
  assetId: number;
  spaceName: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileMtime: number;
  fileType?: AssetFileType;
  role?: AssetFileRole;
  checksum?: string;
  isArchiveStub?: boolean;
  inode?: number;
}): IAssetFile {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO asset_files (
      asset_id, space_name, file_path, file_name, file_size, file_mtime,
      file_type, role, checksum, is_archive_stub, inode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(space_name, file_path) DO UPDATE SET
      asset_id = excluded.asset_id,
      file_name = excluded.file_name,
      file_size = excluded.file_size,
      file_mtime = excluded.file_mtime,
      file_type = excluded.file_type,
      role = excluded.role,
      is_archive_stub = excluded.is_archive_stub,
      inode = excluded.inode,
      updated_at = unixepoch()
  `);

  stmt.run(
    file.assetId,
    file.spaceName,
    file.filePath,
    file.fileName,
    file.fileSize,
    file.fileMtime,
    file.fileType ?? 'unknown',
    file.role ?? 'component',
    file.checksum ?? null,
    file.isArchiveStub ? 1 : 0,
    file.inode ?? null,
  );

  // Retrieve by unique path
  return getAssetFileByPath(file.spaceName, file.filePath)!;
}

export function getAssetFile(id: number): IAssetFile | null {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM asset_files WHERE id = ?`);
  const row = stmt.get(id) as AssetFileRow | undefined;
  return row ? rowToAssetFile(row) : null;
}

export function getAssetFileByPath(spaceName: string, filePath: string): IAssetFile | null {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM asset_files WHERE space_name = ? AND file_path = ?`);
  const row = stmt.get(spaceName, filePath) as AssetFileRow | undefined;
  return row ? rowToAssetFile(row) : null;
}

export function getAssetFiles(assetId: number): IAssetFile[] {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM asset_files WHERE asset_id = ? ORDER BY role, file_name`);
  return (stmt.all(assetId) as AssetFileRow[]).map(rowToAssetFile);
}

export function getAssetFilesBySpace(spaceName: string): IAssetFile[] {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM asset_files WHERE space_name = ? ORDER BY file_path`);
  return (stmt.all(spaceName) as AssetFileRow[]).map(rowToAssetFile);
}

export function updateAssetFile(
  id: number,
  update: {
    assetId?: number;
    fileSize?: number;
    fileMtime?: number;
    fileType?: AssetFileType;
    role?: AssetFileRole;
    checksum?: string | null;
    checksumComputedAt?: number;
    isArchiveStub?: boolean;
    inode?: number;
  },
): void {
  const db = getDatabase();

  const sets: string[] = ['updated_at = unixepoch()'];
  const params: unknown[] = [];

  if (update.assetId !== undefined) { sets.push('asset_id = ?'); params.push(update.assetId); }
  if (update.fileSize !== undefined) { sets.push('file_size = ?'); params.push(update.fileSize); }
  if (update.fileMtime !== undefined) { sets.push('file_mtime = ?'); params.push(update.fileMtime); }
  if (update.fileType !== undefined) { sets.push('file_type = ?'); params.push(update.fileType); }
  if (update.role !== undefined) { sets.push('role = ?'); params.push(update.role); }
  if (update.checksum !== undefined) { sets.push('checksum = ?'); params.push(update.checksum); }
  if (update.checksumComputedAt !== undefined) { sets.push('checksum_computed_at = ?'); params.push(update.checksumComputedAt); }
  if (update.isArchiveStub !== undefined) { sets.push('is_archive_stub = ?'); params.push(update.isArchiveStub ? 1 : 0); }
  if (update.inode !== undefined) { sets.push('inode = ?'); params.push(update.inode); }

  params.push(id);

  const stmt = db.prepare(`UPDATE asset_files SET ${sets.join(', ')} WHERE id = ?`);
  stmt.run(...params);
}

export function deleteAssetFile(id: number): boolean {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM asset_files WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Remove all asset_files for a given space that are NOT in the provided set of file paths.
 * Returns the number of deleted rows. Used by the scanner to clean up removed files.
 */
export function removeStaleAssetFiles(spaceName: string, activeFilePaths: Set<string>): number {
  const db = getDatabase();

  if (activeFilePaths.size === 0) {
    // Remove all files for this space
    const stmt = db.prepare(`DELETE FROM asset_files WHERE space_name = ?`);
    const result = stmt.run(spaceName);
    return result.changes;
  }

  // SQLite doesn't support large IN clauses well, so we use a temp table approach
  const allFiles = db.prepare(
    `SELECT id, file_path FROM asset_files WHERE space_name = ?`,
  ).all(spaceName) as { id: number; file_path: string }[];

  const toDelete = allFiles.filter((f) => !activeFilePaths.has(f.file_path));
  if (toDelete.length === 0) return 0;

  const deleteStmt = db.prepare(`DELETE FROM asset_files WHERE id = ?`);
  const deleteMany = db.transaction((ids: number[]) => {
    for (const id of ids) {
      deleteStmt.run(id);
    }
  });

  deleteMany(toDelete.map((f) => f.id));
  return toDelete.length;
}

/**
 * Get files that need checksum computation (have no checksum and are not archive stubs).
 */
export function getFilesNeedingChecksum(spaceName: string, limit: number): IAssetFile[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM asset_files
    WHERE space_name = ? AND checksum IS NULL AND is_archive_stub = 0
    ORDER BY file_size ASC
    LIMIT ?
  `);
  return (stmt.all(spaceName, limit) as AssetFileRow[]).map(rowToAssetFile);
}

// ──────────────────────────────────────────────
// Scan Log CRUD
// ──────────────────────────────────────────────

export function createScanLog(log: {
  spaceName: string;
  scanType: ScanType;
}): IAssetScanLog {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO asset_scan_log (space_name, scan_type, status)
    VALUES (?, ?, 'running')
  `);

  const result = stmt.run(log.spaceName, log.scanType);
  const logId = Number(result.lastInsertRowid);
  return getScanLog(logId)!;
}

export function getScanLog(id: number): IAssetScanLog | null {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM asset_scan_log WHERE id = ?`);
  const row = stmt.get(id) as ScanLogRow | undefined;
  return row ? rowToScanLog(row) : null;
}

export function updateScanLog(
  id: number,
  update: {
    status?: ScanStatus;
    filesDiscovered?: number;
    filesNew?: number;
    filesUpdated?: number;
    filesRemoved?: number;
    assetsCreated?: number;
    assetsUpdated?: number;
    errorMessage?: string | null;
    jobsQueued?: number;
    completedAt?: number;
  },
): void {
  const db = getDatabase();

  const sets: string[] = [];
  const params: unknown[] = [];

  if (update.status !== undefined) { sets.push('status = ?'); params.push(update.status); }
  if (update.filesDiscovered !== undefined) { sets.push('files_discovered = ?'); params.push(update.filesDiscovered); }
  if (update.filesNew !== undefined) { sets.push('files_new = ?'); params.push(update.filesNew); }
  if (update.filesUpdated !== undefined) { sets.push('files_updated = ?'); params.push(update.filesUpdated); }
  if (update.filesRemoved !== undefined) { sets.push('files_removed = ?'); params.push(update.filesRemoved); }
  if (update.assetsCreated !== undefined) { sets.push('assets_created = ?'); params.push(update.assetsCreated); }
  if (update.assetsUpdated !== undefined) { sets.push('assets_updated = ?'); params.push(update.assetsUpdated); }
  if (update.errorMessage !== undefined) { sets.push('error_message = ?'); params.push(update.errorMessage); }
  if (update.jobsQueued !== undefined) { sets.push('jobs_queued = ?'); params.push(update.jobsQueued); }
  if (update.completedAt !== undefined) { sets.push('completed_at = ?'); params.push(update.completedAt); }

  if (sets.length === 0) return;

  params.push(id);
  const stmt = db.prepare(`UPDATE asset_scan_log SET ${sets.join(', ')} WHERE id = ?`);
  stmt.run(...params);
}

export function getRecentScanLogs(spaceName?: string, limit = 20): IAssetScanLog[] {
  const db = getDatabase();

  if (spaceName) {
    const stmt = db.prepare(
      `SELECT * FROM asset_scan_log WHERE space_name = ? ORDER BY started_at DESC LIMIT ?`,
    );
    return (stmt.all(spaceName, limit) as ScanLogRow[]).map(rowToScanLog);
  }

  const stmt = db.prepare(`SELECT * FROM asset_scan_log ORDER BY started_at DESC LIMIT ?`);
  return (stmt.all(limit) as ScanLogRow[]).map(rowToScanLog);
}

/**
 * Check if a scan is already running for a space.
 */
export function isSpaceScanRunning(spaceName: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare(
    `SELECT COUNT(*) as count FROM asset_scan_log WHERE space_name = ? AND status = 'running'`,
  );
  const { count } = stmt.get(spaceName) as { count: number };
  return count > 0;
}

// ──────────────────────────────────────────────
// Scan Config CRUD
// ──────────────────────────────────────────────

export function getScanConfig(spaceName: string): IAssetScanConfig | null {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM asset_scan_config WHERE space_name = ?`);
  const row = stmt.get(spaceName) as ScanConfigRow | undefined;
  return row ? rowToScanConfig(row) : null;
}

export function listScanConfigs(): IAssetScanConfig[] {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT * FROM asset_scan_config ORDER BY space_name`);
  return (stmt.all() as ScanConfigRow[]).map(rowToScanConfig);
}

export function upsertScanConfig(config: {
  spaceName: string;
  enabled: boolean;
  intervalHours: number;
}): IAssetScanConfig {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO asset_scan_config (space_name, enabled, interval_hours)
    VALUES (?, ?, ?)
    ON CONFLICT(space_name) DO UPDATE SET
      enabled = excluded.enabled,
      interval_hours = excluded.interval_hours,
      updated_at = unixepoch()
  `);

  stmt.run(config.spaceName, config.enabled ? 1 : 0, config.intervalHours);
  return getScanConfig(config.spaceName)!;
}

export function updateScanConfigTimestamps(
  spaceName: string,
  lastScanAt: number,
  nextScanAt: number,
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE asset_scan_config SET
      last_scan_at = ?,
      next_scan_at = ?,
      updated_at = unixepoch()
    WHERE space_name = ?
  `);
  stmt.run(lastScanAt, nextScanAt, spaceName);
}

export function getDueScanConfigs(): IAssetScanConfig[] {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare(`
    SELECT * FROM asset_scan_config
    WHERE enabled = 1 AND (next_scan_at IS NULL OR next_scan_at <= ?)
    ORDER BY space_name
  `);
  return (stmt.all(now) as ScanConfigRow[]).map(rowToScanConfig);
}

// ──────────────────────────────────────────────
// Manual Grouping
// ──────────────────────────────────────────────

/**
 * Group multiple existing asset_files into a single new asset.
 * Removes them from their current asset(s) and cleans up empty assets.
 */
export function groupFilesIntoAsset(
  spaceName: string,
  filePaths: string[],
  assetName: string,
): IAsset {
  const db = getDatabase();

  const doGroup = db.transaction(() => {
    // Find the asset_file rows
    const placeholders = filePaths.map(() => '?').join(', ');
    const files = db.prepare(
      `SELECT * FROM asset_files WHERE space_name = ? AND file_path IN (${placeholders})`,
    ).all(spaceName, ...filePaths) as AssetFileRow[];

    if (files.length === 0) {
      throw new Error('No matching files found to group');
    }

    // Determine directory and asset type from the files
    const dirPath = files[0].file_path.substring(0, files[0].file_path.lastIndexOf('/'));
    const hasVideo = files.some((f) => f.file_type === 'video');
    const hasAudio = files.some((f) => f.file_type === 'audio');
    const assetType: AssetType = hasVideo ? 'video' : hasAudio ? 'audio' : 'generic';

    // Create the new asset
    const totalSize = files.reduce((sum, f) => sum + f.file_size, 0);
    const primaryFile = files.reduce((best, f) =>
      f.file_type === 'video' && f.file_size > (best?.file_size ?? 0) ? f : best,
      files[0],
    );

    const insertAsset = db.prepare(`
      INSERT INTO assets (space_name, directory_path, name, asset_type, file_count, total_size, primary_file_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insertAsset.run(
      spaceName, dirPath, assetName, assetType,
      files.length, totalSize, primaryFile.id,
    );
    const newAssetId = Number(result.lastInsertRowid);

    // Track old assets that lose files
    const oldAssetIds = new Set(files.map((f) => f.asset_id));

    // Move files to new asset, set role
    const updateFile = db.prepare(
      `UPDATE asset_files SET asset_id = ?, role = ?, updated_at = unixepoch() WHERE id = ?`,
    );
    for (const file of files) {
      const role: AssetFileRole = file.id === primaryFile.id ? 'primary' : 'component';
      updateFile.run(newAssetId, role, file.id);
    }

    // Clean up empty old assets
    for (const oldId of oldAssetIds) {
      const remaining = db.prepare(
        `SELECT COUNT(*) as count FROM asset_files WHERE asset_id = ?`,
      ).get(oldId) as { count: number };

      if (remaining.count === 0) {
        db.prepare(`DELETE FROM assets WHERE id = ?`).run(oldId);
      } else {
        // Recalculate stats for the old asset
        recalculateAssetStats(oldId);
      }
    }

    return newAssetId;
  });

  const newAssetId = doGroup();
  return getAssetWithFiles(newAssetId)!;
}

/**
 * Ungroup an asset: split into individual single-file assets.
 */
export function ungroupAsset(assetId: number): IAsset[] {
  const db = getDatabase();

  const doUngroup = db.transaction(() => {
    const asset = db.prepare(`SELECT * FROM assets WHERE id = ?`).get(assetId) as AssetRow | undefined;
    if (!asset) throw new Error(`Asset ${assetId} not found`);

    const files = db.prepare(`SELECT * FROM asset_files WHERE asset_id = ?`).all(assetId) as AssetFileRow[];
    if (files.length <= 1) {
      throw new Error('Cannot ungroup asset with 1 or fewer files');
    }

    const newAssetIds: number[] = [];

    for (const file of files) {
      const fileType = file.file_type as AssetFileType;
      const assetType: AssetType = (fileType === 'video' || fileType === 'audio' || fileType === 'image')
        ? fileType
        : 'generic';

      const insertResult = db.prepare(`
        INSERT INTO assets (
          space_name, directory_path, name, asset_type,
          file_count, total_size, primary_file_id,
          thumbnail_path, proxy_path, proxy_status, metadata
        ) VALUES (?, ?, ?, ?, 1, ?, ?, NULL, NULL, 'none', NULL)
      `).run(
        asset.space_name,
        asset.directory_path,
        file.file_name,
        assetType,
        file.file_size,
        file.id,
      );

      const newId = Number(insertResult.lastInsertRowid);
      newAssetIds.push(newId);

      // Move file to new asset as primary
      db.prepare(
        `UPDATE asset_files SET asset_id = ?, role = 'primary', updated_at = unixepoch() WHERE id = ?`,
      ).run(newId, file.id);
    }

    // Delete the old (now empty) asset
    db.prepare(`DELETE FROM assets WHERE id = ?`).run(assetId);

    return newAssetIds;
  });

  const newIds = doUngroup();
  return newIds.map((id) => getAsset(id)!);
}

// ──────────────────────────────────────────────
// Stats & Utilities
// ──────────────────────────────────────────────

/**
 * Recalculate file_count, total_size, and primary_file_id for an asset.
 */
export function recalculateAssetStats(assetId: number): void {
  const db = getDatabase();

  const stats = db.prepare(`
    SELECT
      COUNT(*) as file_count,
      COALESCE(SUM(file_size), 0) as total_size
    FROM asset_files WHERE asset_id = ?
  `).get(assetId) as { file_count: number; total_size: number };

  // Pick largest video file as primary, or largest overall
  const primary = db.prepare(`
    SELECT id FROM asset_files
    WHERE asset_id = ?
    ORDER BY
      CASE WHEN file_type = 'video' THEN 0 ELSE 1 END,
      file_size DESC
    LIMIT 1
  `).get(assetId) as { id: number } | undefined;

  db.prepare(`
    UPDATE assets SET
      file_count = ?,
      total_size = ?,
      primary_file_id = ?,
      updated_at = unixepoch()
    WHERE id = ?
  `).run(stats.file_count, stats.total_size, primary?.id ?? null, assetId);
}

/**
 * Get catalog-wide stats.
 */
export function getCatalogStats(): IAssetCatalogStats {
  const db = getDatabase();

  // Totals
  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_assets,
      COALESCE(SUM(file_count), 0) as total_files,
      COALESCE(SUM(total_size), 0) as total_size
    FROM assets
  `).get() as { total_assets: number; total_files: number; total_size: number };

  // By type
  const byType = db.prepare(`
    SELECT
      asset_type,
      COUNT(*) as count,
      COALESCE(SUM(total_size), 0) as total_size
    FROM assets
    GROUP BY asset_type
    ORDER BY count DESC
  `).all() as { asset_type: string; count: number; total_size: number }[];

  // By space
  const bySpace = db.prepare(`
    SELECT
      space_name,
      COUNT(*) as asset_count,
      COALESCE(SUM(file_count), 0) as file_count,
      COALESCE(SUM(total_size), 0) as total_size
    FROM assets
    GROUP BY space_name
    ORDER BY space_name
  `).all() as { space_name: string; asset_count: number; file_count: number; total_size: number }[];

  // Recent scans
  const recentScans = getRecentScanLogs(undefined, 10);

  return {
    totalAssets: totals.total_assets,
    totalFiles: totals.total_files,
    totalSize: totals.total_size,
    byType: byType.map((t) => ({
      assetType: t.asset_type as AssetType,
      count: t.count,
      totalSize: t.total_size,
    })),
    bySpace: bySpace.map((s) => ({
      spaceName: s.space_name,
      assetCount: s.asset_count,
      fileCount: s.file_count,
      totalSize: s.total_size,
    })),
    recentScans,
  };
}

/**
 * Batch update within a transaction for scanner efficiency.
 * Wraps the provided function in a SQLite transaction.
 */
export function runInTransaction<T>(fn: () => T): T {
  const db = getDatabase();
  return db.transaction(fn)();
}
