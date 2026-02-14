import { join } from 'path';
import { readFile } from 'fs/promises';
import { resolveSpacePath } from '../../utils/path-security.js';
import { getSpaceInfo } from '../filesystem.service.js';
import { getDatabase } from '../../db/index.js';
import * as efsCli from '../efs-cli/commands.js';
import * as catalogStore from './asset-catalog.store.js';
import * as jobStore from './job.store.js';
import { groupFilesIntoAssets } from './grouping.js';
import { computePartialChecksum } from './checksum.js';
import { extractMetadata, isFfprobeAvailable } from './metadata.service.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { FileEntry } from './grouping.js';
import type { IAssetMetadata, ScanType } from '../../../../shared/types/asset-catalog.js';

// ──────────────────────────────────────────────
// Scanner Service
// ──────────────────────────────────────────────

/**
 * Scan a space and populate the asset catalog.
 *
 * Flow:
 * 1. Walk space using efs-find
 * 2. Group files into assets by name pattern + card structure
 * 3. Diff against DB: detect new/changed/removed
 * 4. Upsert assets + asset_files
 * 5. Compute checksums for new/changed files (throttled)
 * 6. Extract metadata for new/changed primary files
 * 7. Detect archive stubs
 * 8. Log results to asset_scan_log
 */
export async function scanSpace(
  spaceName: string,
  scanType: ScanType = 'manual',
): Promise<number> {
  // Prevent duplicate scans
  if (catalogStore.isSpaceScanRunning(spaceName)) {
    logger.warn({ spaceName }, 'Scan already running for space, skipping');
    throw new Error(`Scan already running for space: ${spaceName}`);
  }

  // Create scan log
  const scanLog = catalogStore.createScanLog({ spaceName, scanType });
  const scanLogId = scanLog.id;

  logger.info({ spaceName, scanLogId, scanType }, `Starting asset catalog scan for space: ${spaceName}`);

  try {
    // 1. Resolve space path
    const space = await getSpaceInfo(spaceName);
    const contentRoot = resolveSpacePath(spaceName, space.type);

    // 2. Walk space filesystem
    const rawEntries = await efsCli.findEntries(contentRoot, contentRoot);

    // Filter to files only (not directories)
    const fileEntries = rawEntries.filter((e) => e.type === 'file');

    catalogStore.updateScanLog(scanLogId, {
      filesDiscovered: fileEntries.length,
    });

    logger.info(
      { spaceName, fileCount: fileEntries.length },
      `Discovered ${fileEntries.length} files in space ${spaceName}`,
    );

    // 3. Convert to FileEntry format for grouping
    const entries: FileEntry[] = [];
    const archiveStubPaths = new Set<string>();

    for (const raw of fileEntries) {
      // Detect archive stubs (small files that might be JSON stubs)
      let isStub = false;
      if (raw.size > 0 && raw.size < 4096) {
        try {
          const absPath = join(contentRoot, raw.path);
          const content = await readFile(absPath, 'utf-8');
          const parsed = JSON.parse(content);
          if (parsed && parsed.esarchive === true) {
            isStub = true;
            archiveStubPaths.add(raw.path);
          }
        } catch {
          // Not a JSON file or not an archive stub — ignore
        }
      }

      entries.push({
        path: raw.path,
        name: raw.name,
        size: raw.size,
        mtime: raw.mtime,
        inode: raw.inode,
        isArchiveStub: isStub,
      });
    }

    // 4. Group files into assets
    const assetGroups = groupFilesIntoAssets(entries);

    logger.info(
      { spaceName, assetCount: assetGroups.length },
      `Grouped into ${assetGroups.length} assets`,
    );

    // 5. Diff against DB and upsert
    const existingFiles = catalogStore.getAssetFilesBySpace(spaceName);
    const existingFileMap = new Map(existingFiles.map((f) => [f.filePath, f]));

    let filesNew = 0;
    let filesUpdated = 0;
    let assetsCreated = 0;
    let assetsUpdated = 0;

    // Track all active file paths for stale cleanup
    const activeFilePaths = new Set<string>();

    // Process each asset group in a transaction for efficiency
    catalogStore.runInTransaction(() => {
      for (const group of assetGroups) {
        // Find or create the asset
        let asset = catalogStore.getAssetBySpaceAndDir(
          spaceName,
          group.directoryPath,
          group.baseName,
        );

        const totalSize = group.files.reduce((sum, f) => sum + f.entry.size, 0);

        // Build card structure metadata
        const cardMeta: Partial<IAssetMetadata> = {};
        if (group.cardStructure) {
          cardMeta.cardStructure = group.cardStructure;
        }

        if (!asset) {
          // Create new asset
          asset = catalogStore.createAsset({
            spaceName,
            directoryPath: group.directoryPath,
            name: group.baseName,
            assetType: group.assetType,
            fileCount: group.files.length,
            totalSize,
            metadata: Object.keys(cardMeta).length > 0 ? cardMeta as IAssetMetadata : undefined,
          });
          assetsCreated++;
        } else {
          // Update existing asset
          catalogStore.updateAsset(asset.id, {
            assetType: group.assetType,
            fileCount: group.files.length,
            totalSize,
            lastScannedAt: Math.floor(Date.now() / 1000),
          });
          assetsUpdated++;
        }

        // Upsert each file in the group
        let primaryFileId: number | null = null;

        for (const gf of group.files) {
          activeFilePaths.add(gf.entry.path);

          const existing = existingFileMap.get(gf.entry.path);
          const isChanged = existing && (
            existing.fileSize !== gf.entry.size ||
            existing.fileMtime !== gf.entry.mtime
          );

          const assetFile = catalogStore.upsertAssetFile({
            assetId: asset.id,
            spaceName,
            filePath: gf.entry.path,
            fileName: gf.entry.name,
            fileSize: gf.entry.size,
            fileMtime: gf.entry.mtime,
            fileType: gf.fileType,
            role: gf.role,
            isArchiveStub: gf.entry.isArchiveStub ?? false,
            inode: gf.entry.inode,
          });

          if (gf.role === 'primary') {
            primaryFileId = assetFile.id;
          }

          if (!existing) {
            filesNew++;
          } else if (isChanged) {
            filesUpdated++;
            // Clear checksum if file changed
            if (existing.checksum) {
              catalogStore.updateAssetFile(assetFile.id, {
                checksum: null,
              });
            }
          }
        }

        // Update primary file reference
        if (primaryFileId && asset.primaryFileId !== primaryFileId) {
          catalogStore.updateAsset(asset.id, { primaryFileId });
        }
      }
    });

    // 6. Remove stale files (files no longer on disk)
    const filesRemoved = catalogStore.removeStaleAssetFiles(spaceName, activeFilePaths);
    if (filesRemoved > 0) {
      logger.info({ spaceName, filesRemoved }, `Removed ${filesRemoved} stale file entries`);

      // Clean up empty assets after file removal
      cleanupEmptyAssets(spaceName);
    }

    // 7. Compute checksums for files without them (throttled)
    const maxChecksumFiles = config.CATALOG_MAX_CHECKSUM_FILES_PER_SCAN ?? 200;
    await computeChecksums(spaceName, contentRoot, maxChecksumFiles);

    // 8. Extract metadata for primary files that don't have it yet
    await extractAssetMetadata(spaceName, contentRoot);

    // 8.5 Queue proxy generation jobs for assets without proxies
    let jobsQueued = 0;
    try {
      jobsQueued = jobStore.queueJobsForSpace(spaceName);
      if (jobsQueued > 0) {
        logger.info({ spaceName, jobsQueued }, `Queued ${jobsQueued} proxy generation jobs`);
      }
    } catch (err) {
      logger.warn({ err, spaceName }, 'Failed to queue proxy generation jobs');
    }

    // 9. Update scan log with final results
    catalogStore.updateScanLog(scanLogId, {
      status: 'completed',
      filesNew,
      filesUpdated,
      filesRemoved,
      assetsCreated,
      assetsUpdated,
      jobsQueued,
      completedAt: Math.floor(Date.now() / 1000),
    });

    // Update scan config timestamps
    const now = Math.floor(Date.now() / 1000);
    const scanConfig = catalogStore.getScanConfig(spaceName);
    if (scanConfig) {
      const nextScanAt = now + (scanConfig.intervalHours * 3600);
      catalogStore.updateScanConfigTimestamps(spaceName, now, nextScanAt);
    }

    logger.info(
      {
        spaceName, scanLogId,
        filesDiscovered: fileEntries.length, filesNew, filesUpdated, filesRemoved,
        assetsCreated, assetsUpdated, jobsQueued,
      },
      `Scan completed for space: ${spaceName}`,
    );

    return scanLogId;
  } catch (err) {
    // Mark scan as failed
    catalogStore.updateScanLog(scanLogId, {
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
      completedAt: Math.floor(Date.now() / 1000),
    });

    logger.error({ err, spaceName, scanLogId }, `Scan failed for space: ${spaceName}`);
    throw err;
  }
}

// ──────────────────────────────────────────────
// Internal Helpers
// ──────────────────────────────────────────────

/**
 * Remove assets that have no remaining files.
 */
function cleanupEmptyAssets(spaceName: string): void {
  const db = getDatabase();

  const emptyAssets = db.prepare(`
    SELECT a.id FROM assets a
    LEFT JOIN asset_files af ON af.asset_id = a.id
    WHERE a.space_name = ?
    GROUP BY a.id
    HAVING COUNT(af.id) = 0
  `).all(spaceName) as { id: number }[];

  if (emptyAssets.length > 0) {
    const deleteStmt = db.prepare(`DELETE FROM assets WHERE id = ?`);
    for (const asset of emptyAssets) {
      deleteStmt.run(asset.id);
    }
    logger.info(
      { spaceName, count: emptyAssets.length },
      `Cleaned up ${emptyAssets.length} empty assets`,
    );
  }
}

/**
 * Compute partial checksums for files that don't have them yet.
 * Processes smaller files first, limited to maxFiles per scan.
 */
async function computeChecksums(
  spaceName: string,
  contentRoot: string,
  maxFiles: number,
): Promise<void> {
  const files = catalogStore.getFilesNeedingChecksum(spaceName, maxFiles);
  if (files.length === 0) return;

  logger.info(
    { spaceName, count: files.length },
    `Computing checksums for ${files.length} files`,
  );

  let computed = 0;
  for (const file of files) {
    try {
      const absPath = join(contentRoot, file.filePath);
      const checksum = await computePartialChecksum(absPath, file.fileSize);

      catalogStore.updateAssetFile(file.id, {
        checksum,
        checksumComputedAt: Math.floor(Date.now() / 1000),
      });
      computed++;
    } catch (err) {
      logger.debug(
        { err, fileId: file.id, path: file.filePath },
        'Failed to compute checksum for file',
      );
    }
  }

  logger.info(
    { spaceName, computed, total: files.length },
    `Computed ${computed}/${files.length} checksums`,
  );
}

/**
 * Extract metadata for assets whose primary file has no metadata yet.
 * Only runs if ffprobe is available.
 */
async function extractAssetMetadata(
  spaceName: string,
  contentRoot: string,
): Promise<void> {
  if (!isFfprobeAvailable()) return;

  const db = getDatabase();

  // Find assets that have no metadata and have a primary file
  const assetsNeedingMeta = db.prepare(`
    SELECT a.id, a.primary_file_id, af.file_path
    FROM assets a
    JOIN asset_files af ON af.id = a.primary_file_id
    WHERE a.space_name = ?
      AND (a.metadata IS NULL OR a.metadata = '{}')
      AND af.is_archive_stub = 0
    LIMIT 50
  `).all(spaceName) as { id: number; primary_file_id: number; file_path: string }[];

  if (assetsNeedingMeta.length === 0) return;

  logger.info(
    { spaceName, count: assetsNeedingMeta.length },
    `Extracting metadata for ${assetsNeedingMeta.length} assets`,
  );

  let extracted = 0;
  for (const item of assetsNeedingMeta) {
    try {
      const absPath = join(contentRoot, item.file_path);
      const metadata = await extractMetadata(absPath);

      // Merge with existing metadata (e.g., card structure from grouping)
      const existing = catalogStore.getAsset(item.id);
      const merged: IAssetMetadata = {
        ...existing?.metadata,
        ...metadata,
      };

      catalogStore.updateAsset(item.id, { metadata: merged });
      extracted++;
    } catch (err) {
      logger.debug(
        { err, assetId: item.id, path: item.file_path },
        'Failed to extract metadata for asset',
      );
    }
  }

  logger.info(
    { spaceName, extracted, total: assetsNeedingMeta.length },
    `Extracted metadata for ${extracted}/${assetsNeedingMeta.length} assets`,
  );
}
