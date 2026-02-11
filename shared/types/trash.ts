/** A trashed file or directory entry */
export interface ITrashEntry {
  id: number;
  /** Space the item was deleted from */
  spaceName: string;
  /** Original relative path within the space Content dir */
  originalPath: string;
  /** Original filename */
  originalName: string;
  /** 'file' or 'directory' */
  entryType: 'file' | 'directory';
  /** Size in bytes at time of deletion */
  sizeBytes: number;
  /** Path to the snapshot in the .trash directory (relative to space Content root) */
  trashPath: string;
  /** Unix timestamp (seconds) when deleted */
  deletedAt: number;
  /** Username that performed the deletion */
  deletedBy: string;
  /** Unix timestamp (seconds) when this trash entry expires and can be purged */
  expiresAt: number;
  /** Status: 'active' = in trash, 'restoring' = restore in progress, 'purging' = permanent delete in progress */
  status: 'active' | 'restoring' | 'purging';
}

/** Summary statistics for the trash dashboard */
export interface ITrashStats {
  /** Total number of items in trash */
  totalItems: number;
  /** Total size of all trashed items in bytes */
  totalSizeBytes: number;
  /** Number of items per space */
  perSpace: {
    spaceName: string;
    itemCount: number;
    sizeBytes: number;
  }[];
  /** Number of items expiring within the next 24 hours */
  expiringWithin24h: number;
  /** Oldest item timestamp */
  oldestItemAt: number | null;
}

/** Trash configuration settings */
export interface ITrashConfig {
  /** Whether trash (snapshot before delete) is enabled */
  enabled: boolean;
  /** Retention period in days before auto-purge */
  retentionDays: number;
  /** How often the purge scheduler checks (minutes) */
  purgeIntervalMinutes: number;
  /** Maximum trash size in bytes (0 = unlimited) */
  maxTrashSizeBytes: number;
}

/** Request to restore a trash entry */
export interface ITrashRestoreRequest {
  /** Restore to original location (true) or specify alternative */
  restoreToOriginal: boolean;
  /** Alternative space name (if not restoring to original) */
  targetSpaceName?: string;
  /** Alternative path (if not restoring to original) */
  targetPath?: string;
}

/** Result of a trash operation */
export interface ITrashOperationResult {
  success: boolean;
  message: string;
  /** Number of items affected */
  itemCount: number;
  /** Bytes affected */
  bytesAffected: number;
}

/** Trash scheduler status */
export interface ITrashSchedulerStatus {
  /** Whether the purge scheduler is running */
  isRunning: boolean;
  /** Retention period in days */
  retentionDays: number;
  /** Purge interval in minutes */
  purgeIntervalMinutes: number;
  /** Last purge check timestamp */
  lastPurgeAt?: number;
  /** Next scheduled purge timestamp */
  nextPurgeAt?: number;
  /** Items purged in last run */
  lastPurgeCount?: number;
}
