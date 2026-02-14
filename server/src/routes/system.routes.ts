import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as systemController from '../controllers/system.controller.js';

const router = Router();

// GET /health
router.get('/health', asyncHandler(systemController.health));

// GET /automation — combined status of all background services
router.get('/automation', asyncHandler(systemController.getAutomationStatus));

export default router;
