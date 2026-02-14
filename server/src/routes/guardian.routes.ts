import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as guardianController from '../controllers/guardian.controller.js';

const router = Router();

// GET /status — receiver status + event count
router.get('/status', asyncHandler(guardianController.getStatus));

// GET /events — query stored events
router.get('/events', asyncHandler(guardianController.listEvents));

// GET /stats — event count stats grouped by type
router.get('/stats', asyncHandler(guardianController.getStats));

// GET /timeline — bucketed event counts for timeline chart
router.get('/timeline', asyncHandler(guardianController.getTimeline));

// POST /ingest — HTTP event ingestion (alternative to TCP receiver)
router.post('/ingest', asyncHandler(guardianController.ingestEvents));

export default router;
