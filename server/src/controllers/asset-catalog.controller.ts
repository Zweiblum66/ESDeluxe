import type { Request, Response } from 'express';
import { createReadStream, statSync } from 'fs';
import { lookup } from 'mime-types';
import * as catalogStore from '../services/asset-catalog/asset-catalog.store.js';
import * as jobStore from '../services/asset-catalog/job.store.js';
import { scanSpace } from '../services/asset-catalog/scanner.service.js';
import { getSchedulerStatus } from '../services/asset-catalog/scan-scheduler.service.js';
import { logger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import type {
  IAssetCatalogQuery,
  AssetType,
  AssetArchiveStatus,
  ProxyStatus,
} from '../../../shared/types/asset-catalog.js';
import { restoreFileByPriority } from '../services/archive/archive.service.js';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function getParamId(req: Request, name: string): number {
  const raw = req.params[name];
  const val = Array.isArray(raw) ? raw[0] : raw;
  const id = parseInt(val, 10);
  if (isNaN(id) || id <= 0) {
    throw new ValidationError(`Invalid ${name}: ${val}`);
  }
  return id;
}

function getParamString(req: Request, name: string): string {
  const raw = req.params[name];
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (!val) {
    throw new ValidationError(`Missing required parameter: ${name}`);
  }
  return val;
}

// ──────────────────────────────────────────────
// Assets
// ──────────────────────────────────────────────

/**
 * GET /catalog/assets — query assets with pagination and filters
 */
export async function queryAssets(req: Request, res: Response): Promise<void> {
  const query: IAssetCatalogQuery = {
    spaceName: req.query.spaceName as string | undefined,
    directoryPath: req.query.directoryPath as string | undefined,
    assetType: req.query.assetType as AssetType | undefined,
    searchTerm: req.query.searchTerm as string | undefined,
    proxyStatus: req.query.proxyStatus as ProxyStatus | undefined,
    archiveStatus: req.query.archiveStatus as AssetArchiveStatus | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
  };

  const result = catalogStore.queryAssets(query);
  res.json({ data: result });
}

/**
 * GET /catalog/assets/:id — get single asset with files
 */
export async function getAsset(req: Request, res: Response): Promise<void> {
  const id = getParamId(req, 'id');
  const asset = catalogStore.getAssetWithFiles(id);

  if (!asset) {
    throw new NotFoundError(`Asset not found: ${id}`);
  }

  res.json({ data: asset });
}

/**
 * DELETE /catalog/assets/:id — remove asset from catalog
 */
export async function deleteAsset(req: Request, res: Response): Promise<void> {
  const id = getParamId(req, 'id');
  const deleted = catalogStore.deleteAsset(id);

  if (!deleted) {
    throw new NotFoundError(`Asset not found: ${id}`);
  }

  res.json({ data: { success: true } });
}

/**
 * POST /catalog/assets/group — manually group files into an asset
 */
export async function groupFiles(req: Request, res: Response): Promise<void> {
  const { spaceName, filePaths, assetName } = req.body;

  if (!spaceName || !Array.isArray(filePaths) || filePaths.length < 2 || !assetName) {
    throw new ValidationError('Requires spaceName, filePaths (array of ≥2), and assetName');
  }

  const asset = catalogStore.groupFilesIntoAsset(spaceName, filePaths, assetName);
  logger.info({ assetId: asset.id, name: assetName, fileCount: filePaths.length }, 'Files manually grouped');
  res.json({ data: asset });
}

/**
 * POST /catalog/assets/:id/ungroup — split asset into single-file assets
 */
export async function ungroupAsset(req: Request, res: Response): Promise<void> {
  const id = getParamId(req, 'id');
  const assets = catalogStore.ungroupAsset(id);
  logger.info({ originalAssetId: id, newAssetCount: assets.length }, 'Asset ungrouped');
  res.json({ data: { assets } });
}

/**
 * POST /catalog/assets/:id/restore — restore all archived files in an asset
 */
export async function restoreAsset(req: Request, res: Response): Promise<void> {
  const id = getParamId(req, 'id');
  const asset = catalogStore.getAssetWithFiles(id);

  if (!asset) {
    throw new NotFoundError(`Asset not found: ${id}`);
  }

  if (!asset.files || asset.files.length === 0) {
    throw new ValidationError('Asset has no files');
  }

  // Find all archive stub files that need restoring
  const stubFiles = asset.files.filter((f) => f.isArchiveStub);
  if (stubFiles.length === 0) {
    throw new ValidationError('No archived files to restore');
  }

  const results: { restored: string[]; failed: { path: string; error: string }[] } = {
    restored: [],
    failed: [],
  };

  for (const file of stubFiles) {
    try {
      await restoreFileByPriority(file.spaceName, file.filePath);
      results.restored.push(file.filePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.failed.push({ path: file.filePath, error: message });
      logger.warn({ err, assetId: id, filePath: file.filePath }, 'Asset restore: file failed');
    }
  }

  logger.info(
    { assetId: id, total: stubFiles.length, restored: results.restored.length, failed: results.failed.length },
    'Asset restore completed',
  );

  res.json({ data: results });
}

// ──────────────────────────────────────────────
// Scanning
// ──────────────────────────────────────────────

/**
 * POST /catalog/scan — trigger a manual scan for a space
 */
export async function triggerScan(req: Request, res: Response): Promise<void> {
  const { spaceName } = req.body;

  if (!spaceName) {
    throw new ValidationError('spaceName is required');
  }

  // Start scan in background (don't await completion)
  const scanLogId = await scanSpace(spaceName, 'manual');
  res.json({ data: { scanLogId, message: `Scan started for space: ${spaceName}` } });
}

/**
 * GET /catalog/scan/status — get scheduler status
 */
export async function getScanStatus(_req: Request, res: Response): Promise<void> {
  const status = getSchedulerStatus();
  res.json({ data: status });
}

/**
 * GET /catalog/scan/logs — get recent scan logs
 */
export async function getScanLogs(req: Request, res: Response): Promise<void> {
  const spaceName = req.query.spaceName as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const logs = catalogStore.getRecentScanLogs(spaceName, limit);
  res.json({ data: logs });
}

// ──────────────────────────────────────────────
// Scan Config
// ──────────────────────────────────────────────

/**
 * GET /catalog/scan/config — list all space scan configs
 */
export async function listScanConfigs(_req: Request, res: Response): Promise<void> {
  const configs = catalogStore.listScanConfigs();
  res.json({ data: configs });
}

/**
 * PUT /catalog/scan/config/:spaceName — update scan config for a space
 */
export async function updateScanConfig(req: Request, res: Response): Promise<void> {
  const spaceName = getParamString(req, 'spaceName');
  const { enabled, intervalHours } = req.body;

  if (typeof enabled !== 'boolean') {
    throw new ValidationError('enabled (boolean) is required');
  }

  const hours = typeof intervalHours === 'number' && intervalHours > 0 ? intervalHours : 24;

  const config = catalogStore.upsertScanConfig({
    spaceName,
    enabled,
    intervalHours: hours,
  });

  logger.info({ spaceName, enabled, intervalHours: hours }, 'Scan config updated');
  res.json({ data: config });
}

// ──────────────────────────────────────────────
// Stats
// ──────────────────────────────────────────────

/**
 * GET /catalog/stats — get catalog-wide statistics
 */
export async function getStats(_req: Request, res: Response): Promise<void> {
  const stats = catalogStore.getCatalogStats();
  res.json({ data: stats });
}

// ──────────────────────────────────────────────
// Media Serving (Thumbnail + Proxy)
// ──────────────────────────────────────────────

/**
 * GET /catalog/assets/:id/thumbnail — stream asset thumbnail image
 */
export async function getAssetThumbnail(req: Request, res: Response): Promise<void> {
  const id = getParamId(req, 'id');
  const asset = catalogStore.getAsset(id);

  if (!asset?.thumbnailPath) {
    throw new NotFoundError(`No thumbnail for asset: ${id}`);
  }

  try {
    const stat = statSync(asset.thumbnailPath);
    const mimeType = lookup(asset.thumbnailPath) || 'image/jpeg';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const stream = createReadStream(asset.thumbnailPath);
    stream.pipe(res);

    stream.on('error', (err) => {
      logger.error({ err, assetId: id }, 'Error streaming thumbnail');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Thumbnail streaming failed' });
      }
      stream.destroy();
    });
  } catch {
    throw new NotFoundError(`Thumbnail file not found for asset: ${id}`);
  }
}

/**
 * GET /catalog/assets/:id/proxy — stream asset proxy file with Range support
 */
export async function getAssetProxy(req: Request, res: Response): Promise<void> {
  const id = getParamId(req, 'id');
  const asset = catalogStore.getAsset(id);

  if (!asset?.proxyPath) {
    throw new NotFoundError(`No proxy for asset: ${id}`);
  }

  try {
    const stat = statSync(asset.proxyPath);
    const fileSize = stat.size;
    const mimeType = lookup(asset.proxyPath) || 'video/mp4';
    const range = req.headers.range;

    if (range) {
      // HTTP Range request for video seeking
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600',
      });

      const stream = createReadStream(asset.proxyPath, { start, end });
      stream.pipe(res);

      stream.on('error', (err) => {
        logger.error({ err, assetId: id }, 'Error streaming proxy (range)');
        stream.destroy();
      });
    } else {
      // Full file request
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      });

      const stream = createReadStream(asset.proxyPath);
      stream.pipe(res);

      stream.on('error', (err) => {
        logger.error({ err, assetId: id }, 'Error streaming proxy');
        stream.destroy();
      });
    }
  } catch {
    throw new NotFoundError(`Proxy file not found for asset: ${id}`);
  }
}

// ──────────────────────────────────────────────
// Job Stats
// ──────────────────────────────────────────────

/**
 * GET /catalog/jobs/stats — get proxy generation job statistics
 */
export async function getJobStats(_req: Request, res: Response): Promise<void> {
  const stats = jobStore.getJobStats();
  res.json({ data: stats });
}
