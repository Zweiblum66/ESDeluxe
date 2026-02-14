import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { workerAuth } from '../middleware/worker-auth.js';
import * as workerCtrl from '../controllers/worker.controller.js';

const router = Router();

// All worker routes require worker API key auth
router.use(workerAuth);

// GET /status — worker API status + queue depth
router.get('/status', asyncHandler(workerCtrl.getStatus));

// ──────────────────────────────────────────────
// Guardian batch processing
// ──────────────────────────────────────────────

router.post('/guardian/claim', asyncHandler(workerCtrl.claimGuardianBatch));
router.put('/guardian/:batchId/complete', asyncHandler(workerCtrl.completeGuardianBatch));
router.put('/guardian/:batchId/fail', asyncHandler(workerCtrl.failGuardianBatch));
router.put('/guardian/:batchId/heartbeat', asyncHandler(workerCtrl.heartbeatGuardianBatch));

// ──────────────────────────────────────────────
// Asset catalog job processing (existing worker)
// ──────────────────────────────────────────────

router.post('/jobs/claim', asyncHandler(workerCtrl.claimJob));
router.put('/jobs/:jobId/progress', asyncHandler(workerCtrl.reportJobProgress));
router.put('/jobs/:jobId/complete', asyncHandler(workerCtrl.reportJobComplete));
router.put('/jobs/:jobId/fail', asyncHandler(workerCtrl.reportJobFail));
router.put('/jobs/:jobId/heartbeat', asyncHandler(workerCtrl.heartbeatJob));

export default router;
