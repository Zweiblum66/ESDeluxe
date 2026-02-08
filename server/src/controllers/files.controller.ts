import type { Request, Response } from 'express';
import { Readable } from 'stream';
import { lookup } from 'mime-types';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import * as fsService from '../services/filesystem.service.js';

/** Extract :name param safely (Express v5 params can be string | string[]) */
function getSpaceName(req: Request): string {
  const val = req.params.name;
  return Array.isArray(val) ? val[0] : val;
}

/**
 * Extract the file path from the wildcard param.
 * Express captures wildcard (*) routes differently — we use req.params[0] or req.params['0'].
 */
function getFilePath(req: Request): string {
  // Express wildcard params
  const wildcard = req.params[0] || req.params['0'] || '';
  const val = Array.isArray(wildcard) ? wildcard[0] : wildcard;
  // Strip leading slash
  return val.startsWith('/') ? val.slice(1) : val;
}

// ──────────────────────────────────────────────
// Subdirectory listing (for tree sidebar)
// ──────────────────────────────────────────────

/**
 * GET /api/v1/spaces/:name/files/dirs
 * GET /api/v1/spaces/:name/files/dirs/*
 * List subdirectories only (for tree lazy-loading).
 */
export async function listDirs(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const filePath = getFilePath(req);
  const dirs = await fsService.listSubdirectories(spaceName, filePath || '');
  res.json({ data: dirs });
}

// ──────────────────────────────────────────────
// Move
// ──────────────────────────────────────────────

/**
 * PUT /api/v1/spaces/:name/files/move/*
 * Move a file or folder to another location (same or different space).
 */
export async function movePath(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const filePath = getFilePath(req);
  const { destinationSpace, destinationPath } = req.body;

  if (!filePath) {
    throw new ValidationError('Cannot move the space root');
  }
  if (!destinationSpace) {
    throw new ValidationError('destinationSpace is required');
  }

  const { sourceDeleted } = await fsService.moveEntry(spaceName, filePath, destinationSpace, destinationPath || '');
  const message = sourceDeleted
    ? `Moved to ${destinationSpace}:${destinationPath || '/'}`
    : `Copied to ${destinationSpace}:${destinationPath || '/'} (source could not be deleted — permission denied)`;
  res.json({ message, sourceDeleted });
}

// ──────────────────────────────────────────────
// Directory listing
// ──────────────────────────────────────────────

/**
 * GET /api/v1/spaces/:name/files
 * List the space root directory.
 */
export async function listSpaceRoot(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const listing = await fsService.listDirectory(spaceName);
  res.json({ data: listing });
}

/**
 * GET /api/v1/spaces/:name/files/*
 * List a subdirectory or get file info.
 */
export async function listPath(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const filePath = getFilePath(req);

  if (!filePath) {
    const listing = await fsService.listDirectory(spaceName);
    res.json({ data: listing });
    return;
  }

  const listing = await fsService.listDirectory(spaceName, filePath);
  res.json({ data: listing });
}

// ──────────────────────────────────────────────
// CRUD operations
// ──────────────────────────────────────────────

/**
 * POST /api/v1/spaces/:name/files
 * Create a folder in the space root, or upload a file.
 */
export async function createInRoot(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);

  // Check if this is a file upload (multipart)
  if (req.file) {
    const stream = Readable.from(req.file.buffer);
    await fsService.uploadFile(spaceName, '', req.file.originalname, stream);
    res.status(201).json({ message: `File '${req.file.originalname}' uploaded` });
    return;
  }

  // Otherwise create a directory
  const { name } = req.body;
  if (!name) {
    throw new ValidationError('Name is required');
  }

  await fsService.createDirectory(spaceName, '', name);
  res.status(201).json({ message: `Directory '${name}' created` });
}

/**
 * POST /api/v1/spaces/:name/files/*
 * Create a folder in a subdirectory, or upload a file.
 */
export async function createInPath(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const filePath = getFilePath(req);

  // Check if this is a file upload (multipart)
  if (req.file) {
    const stream = Readable.from(req.file.buffer);
    await fsService.uploadFile(spaceName, filePath, req.file.originalname, stream);
    res.status(201).json({ message: `File '${req.file.originalname}' uploaded to ${filePath}` });
    return;
  }

  // Otherwise create a directory
  const { name } = req.body;
  if (!name) {
    throw new ValidationError('Name is required');
  }

  await fsService.createDirectory(spaceName, filePath, name);
  res.status(201).json({ message: `Directory '${name}' created in ${filePath}` });
}

/**
 * DELETE /api/v1/spaces/:name/files/*
 * Delete a file or folder.
 */
export async function deletePath(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const filePath = getFilePath(req);

  if (!filePath) {
    throw new ValidationError('Cannot delete the space root');
  }

  await fsService.deleteEntry(spaceName, filePath);
  res.json({ message: `Deleted: ${filePath}` });
}

/**
 * PUT /api/v1/spaces/:name/files/rename/*
 * Rename a file or folder.
 */
export async function renamePath(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const filePath = getFilePath(req);
  const { newName } = req.body;

  if (!filePath) {
    throw new ValidationError('Cannot rename the space root');
  }
  if (!newName) {
    throw new ValidationError('newName is required');
  }

  await fsService.renameEntry(spaceName, filePath, newName);
  res.json({ message: `Renamed to: ${newName}` });
}

// ──────────────────────────────────────────────
// Download
// ──────────────────────────────────────────────

/**
 * GET /api/v1/spaces/:name/files/download/*
 * Download a file, streamed through the Node.js backend.
 */
export async function downloadPath(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const filePath = getFilePath(req);

  if (!filePath) {
    throw new ValidationError('File path is required for download');
  }

  const { stream, size, name } = await fsService.downloadFile(spaceName, filePath);

  // Determine MIME type
  const mimeType = lookup(name) || 'application/octet-stream';

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', size);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);

  stream.pipe(res);

  stream.on('error', (err) => {
    logger.error({ err, spaceName, filePath }, 'Error streaming file download');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed' });
    }
    stream.destroy();
  });
}

// ──────────────────────────────────────────────
// ACL operations
// ──────────────────────────────────────────────

/**
 * GET /api/v1/spaces/:name/files/acl/*
 * Get ACL for a file or directory.
 */
export async function getAcl(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const filePath = getFilePath(req);

  const acl = await fsService.getFileAcl(spaceName, filePath || '');
  res.json({ data: acl });
}

/**
 * PUT /api/v1/spaces/:name/files/acl/*
 * Set ACL on a file or directory.
 */
export async function setAcl(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const filePath = getFilePath(req);

  await fsService.setFileAcl(spaceName, filePath || '', req.body);
  res.json({ message: 'ACL updated' });
}

// ──────────────────────────────────────────────
// Goal operations
// ──────────────────────────────────────────────

/**
 * GET /api/v1/spaces/:name/files/goal/*
 * Get storage goal for a file or directory.
 */
export async function getGoal(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const filePath = getFilePath(req);

  const goal = await fsService.getFileGoal(spaceName, filePath || '');
  res.json({ data: { path: filePath || '/', currentGoal: goal } });
}

/**
 * PUT /api/v1/spaces/:name/files/goal/*
 * Set storage goal for a file or directory.
 */
export async function setGoal(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const filePath = getFilePath(req);
  const { goalName, recursive } = req.body;

  if (!goalName) {
    throw new ValidationError('goalName is required');
  }

  await fsService.setFileGoal(spaceName, filePath || '', goalName, recursive);
  res.json({ message: `Goal set to '${goalName}'${recursive ? ' (recursive)' : ''}` });
}

// ──────────────────────────────────────────────
// Directory info
// ──────────────────────────────────────────────

/**
 * GET /api/v1/spaces/:name/files/info/*
 * Get directory usage info.
 */
export async function getDirInfo(req: Request, res: Response): Promise<void> {
  const spaceName = getSpaceName(req);
  const filePath = getFilePath(req);

  const info = await fsService.getDirInfo(spaceName, filePath || '');
  res.json({ data: info });
}
