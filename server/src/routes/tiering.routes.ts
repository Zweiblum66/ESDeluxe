import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as tieringController from '../controllers/tiering.controller.js';

const router = Router();

// Scheduler status & progress
router.get('/status', asyncHandler(tieringController.getSchedulerStatus));
router.get('/progress', asyncHandler(tieringController.getProgress));

// Recent logs across all rules
router.get('/logs', asyncHandler(tieringController.getRecentLogs));

// Rules CRUD
router.get('/rules', asyncHandler(tieringController.listRules));
router.post('/rules', asyncHandler(tieringController.createRule));
router.get('/rules/:id', asyncHandler(tieringController.getRule));
router.put('/rules/:id', asyncHandler(tieringController.updateRule));
router.delete('/rules/:id', asyncHandler(tieringController.deleteRule));

// Manual execution
router.post('/rules/:id/run', asyncHandler(tieringController.triggerRule));

// Rule execution logs
router.get('/rules/:id/logs', asyncHandler(tieringController.getRuleLogs));

export default router;
