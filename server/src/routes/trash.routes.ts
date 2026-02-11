import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as trashController from '../controllers/trash.controller.js';
import { requireAdmin } from '../middleware/admin.js';

const router = Router();

// List & Stats (filtered by user's spaces in controller)
router.get('/', asyncHandler(trashController.listEntries));
router.get('/stats', asyncHandler(trashController.getStats));

// Configuration & Scheduler (admin only for config changes)
router.get('/config', asyncHandler(trashController.getConfig));
router.put('/config', requireAdmin, asyncHandler(trashController.updateConfig));

// Restore (allowed for users who have access to the entry's space)
router.post('/:id/restore', asyncHandler(trashController.restoreEntry));

// Purge single entry (admin or space manager — checked in controller)
router.delete('/:id', asyncHandler(trashController.purgeEntry));

// Purge all (admin or space manager for filtered space — checked in controller)
router.delete('/', asyncHandler(trashController.purgeAll));

export default router;
