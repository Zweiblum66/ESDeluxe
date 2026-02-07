import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as systemController from '../controllers/system.controller.js';

const router = Router();

// GET /health
router.get('/health', asyncHandler(systemController.health));

export default router;
