import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../utils/async-handler.js';
import * as filesController from '../controllers/files.controller.js';

const router = Router({ mergeParams: true });

// Multer for file uploads - stores in memory for streaming to EFS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB max
});

// ──────────────────────────────────────────────
// File operations routes
// These are mounted under /api/v1/spaces/:name/files
//
// IMPORTANT: Action routes (download, acl, goal, rename, info)
// use a prefix before the wildcard to avoid conflicts.
// ──────────────────────────────────────────────

// Subdirectory listing (tree sidebar): GET /:name/files/dirs and /:name/files/dirs/*
router.get('/dirs', asyncHandler(filesController.listDirs));
router.get('/dirs/*', asyncHandler(filesController.listDirs));

// Move: PUT /:name/files/move/*
router.put('/move/*', asyncHandler(filesController.movePath));

// Download: GET /:name/files/download/*
router.get('/download/*', asyncHandler(filesController.downloadPath));

// ACL: GET/PUT /:name/files/acl/*
router.get('/acl', asyncHandler(filesController.getAcl));
router.get('/acl/*', asyncHandler(filesController.getAcl));
router.put('/acl', asyncHandler(filesController.setAcl));
router.put('/acl/*', asyncHandler(filesController.setAcl));

// Goal: GET/PUT /:name/files/goal/*
router.get('/goal', asyncHandler(filesController.getGoal));
router.get('/goal/*', asyncHandler(filesController.getGoal));
router.put('/goal', asyncHandler(filesController.setGoal));
router.put('/goal/*', asyncHandler(filesController.setGoal));

// Rename: PUT /:name/files/rename/*
router.put('/rename/*', asyncHandler(filesController.renamePath));

// Dir info: GET /:name/files/info/*
router.get('/info', asyncHandler(filesController.getDirInfo));
router.get('/info/*', asyncHandler(filesController.getDirInfo));

// Directory listing: GET /:name/files (root) and GET /:name/files/*
router.get('/', asyncHandler(filesController.listSpaceRoot));
router.get('/*', asyncHandler(filesController.listPath));

// Create: POST /:name/files (root) and POST /:name/files/*
router.post('/', upload.single('file'), asyncHandler(filesController.createInRoot));
router.post('/*', upload.single('file'), asyncHandler(filesController.createInPath));

// Delete: DELETE /:name/files/*
router.delete('/*', asyncHandler(filesController.deletePath));

export default router;
