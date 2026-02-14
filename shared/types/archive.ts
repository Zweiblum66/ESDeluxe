// ──────────────────────────────────────────────
// Archive Location Types
// ──────────────────────────────────────────────

export type ArchiveLocationType = 'local' | 'smb' | 's3' | 'tape';

/** Config for a local/NAS filesystem archive location */
export interface ILocalArchiveConfig {
  basePath: string;
}

/** Config for an S3-compatible archive location (future) */
export interface IS3ArchiveConfig {
  bucket: string;
  region: string;
  prefix?: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Config for an SMB/CIFS network share archive location */
export interface ISmbArchiveConfig {
  /** UNC-style share path, e.g. //192.168.1.50/archive */
  sharePath: string;
  /** SMB username */
  username: string;
  /** SMB password */
  password: string;
  /** Optional SMB domain/workgroup */
  domain?: string;
  /** Additional CIFS mount options, e.g. vers=3.0 */
  mountOptions?: string;
  /** Auto-computed mount point on the server (set by backend, read-only for client) */
  mountPoint?: string;
}

export type ArchiveLocationConfig = ILocalArchiveConfig | ISmbArchiveConfig | IS3ArchiveConfig;

/** An archive storage location definition */
export interface IArchiveLocation {
  id: number;
  name: string;
  type: ArchiveLocationType;
  config: ArchiveLocationConfig;
  description?: string;
  enabled: boolean;
  totalSize: number;
  fileCount: number;
  priority: number;
  lastActivityAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Request to create an archive location */
export interface ICreateArchiveLocationRequest {
  name: string;
  type: ArchiveLocationType;
  config: ArchiveLocationConfig;
  description?: string;
  priority?: number;
}

/** Request to update an archive location */
export interface IUpdateArchiveLocationRequest {
  name?: string;
  config?: ArchiveLocationConfig;
  description?: string;
  enabled?: boolean;
  priority?: number;
}

// ──────────────────────────────────────────────
// Archive Catalog Types
// ──────────────────────────────────────────────

export type ArchiveCatalogStatus =
  | 'archiving'
  | 'archived'
  | 'restoring'
  | 'restored'
  | 'failed'
  | 'deleted';

/** A tracked archive catalog entry */
export interface IArchiveCatalogEntry {
  id: number;
  originalSpace: string;
  originalPath: string;
  originalSize: number;
  originalMtime?: number;
  checksum: string;
  archiveLocationId: number;
  archiveLocationName?: string; // Joined from location table for display
  archivePath: string;
  status: ArchiveCatalogStatus;
  archivedAt: number;
  archivedBy?: string;
  restoredAt?: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

// ──────────────────────────────────────────────
// Stub File Format
// ──────────────────────────────────────────────

/** JSON structure written as a stub placeholder when a file is archived */
export interface IArchiveStub {
  esarchive: true;
  version: 1;
  originalName: string;
  originalSize: number;
  archiveLocationId: number;
  archiveLocationName: string;
  archivePath: string;
  checksum: string;
  archivedAt: number;
  archivedBy?: string;
  catalogEntryId: number;
}

// ──────────────────────────────────────────────
// Archive Operation Requests
// ──────────────────────────────────────────────

export interface IArchiveFileRequest {
  spaceName: string;
  filePath: string;
  archiveLocationId: number;
}

export interface IBulkArchiveRequest {
  spaceName: string;
  filePaths: string[];
  archiveLocationId: number;
}

export interface IRestoreFileRequest {
  catalogEntryId: number;
}

export interface IBulkRestoreRequest {
  catalogEntryIds: number[];
}

// ──────────────────────────────────────────────
// Archive Stats
// ──────────────────────────────────────────────

export interface IArchiveStats {
  totalFiles: number;
  totalSize: number;
  locationBreakdown: {
    locationId: number;
    locationName: string;
    locationType: ArchiveLocationType;
    fileCount: number;
    totalSize: number;
    enabled: boolean;
  }[];
  recentActivity: IArchiveCatalogEntry[];
}

// ──────────────────────────────────────────────
// Archive Catalog Query
// ──────────────────────────────────────────────

export interface IArchiveCatalogQuery {
  spaceName?: string;
  locationId?: number;
  status?: ArchiveCatalogStatus;
  searchTerm?: string;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
}

export interface IArchiveCatalogResult {
  entries: IArchiveCatalogEntry[];
  total: number;
}
