/**
 * Abstract interface for archive storage backends.
 * Implementations handle the actual file storage/retrieval
 * for a specific backend type (local filesystem, S3, tape, etc.).
 */

export interface IStoreResult {
  /** Bytes written to archive */
  size: number;
  /** SHA-256 hex digest of the archived file */
  checksum: string;
}

export interface IValidateResult {
  /** Whether the backend is accessible and functional */
  ok: boolean;
  /** Human-readable status or error message */
  message: string;
}

export interface IArchiveBackend {
  /**
   * Copy a file into the archive storage.
   * @param srcAbsPath Absolute path of the source file on the local filesystem
   * @param archiveRelPath Relative path within the archive location (e.g. "spaceName/path/to/file.mxf")
   * @returns Size and checksum of the stored file
   */
  store(srcAbsPath: string, archiveRelPath: string): Promise<IStoreResult>;

  /**
   * Retrieve a file from the archive storage.
   * @param archiveRelPath Relative path within the archive location
   * @param destAbsPath Absolute path where the file should be written
   */
  retrieve(archiveRelPath: string, destAbsPath: string): Promise<void>;

  /**
   * Delete a file from the archive storage.
   * @param archiveRelPath Relative path within the archive location
   */
  delete(archiveRelPath: string): Promise<void>;

  /**
   * Check if a file exists in the archive storage.
   * @param archiveRelPath Relative path within the archive location
   */
  exists(archiveRelPath: string): Promise<boolean>;

  /**
   * Get storage statistics for this archive location.
   */
  getStats(): Promise<{ totalSize: number; fileCount: number }>;

  /**
   * Validate that the backend is accessible and writable.
   * Used for the "Test Connection" feature in the UI.
   */
  validate(): Promise<IValidateResult>;
}
