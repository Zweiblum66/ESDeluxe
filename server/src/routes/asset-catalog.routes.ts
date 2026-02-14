import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as catalogCtrl from '../controllers/asset-catalog.controller.js';

const router = Router();

// ──────────────────────────────────────────────
// Assets
// ──────────────────────────────────────────────

router.get('/assets', asyncHandler(catalogCtrl.queryAssets));
router.get('/assets/:id', asyncHandler(catalogCtrl.getAsset));
router.delete('/assets/:id', asyncHandler(catalogCtrl.deleteAsset));
router.post('/assets/group', asyncHandler(catalogCtrl.groupFiles));
router.post('/assets/:id/ungroup', asyncHandler(catalogCtrl.ungroupAsset));
router.post('/assets/:id/restore', asyncHandler(catalogCtrl.restoreAsset));
router.get('/assets/:id/thumbnail', asyncHandler(catalogCtrl.getAssetThumbnail));
router.get('/assets/:id/proxy', asyncHandler(catalogCtrl.getAssetProxy));

// ──────────────────────────────────────────────
// Scanning
// ──────────────────────────────────────────────

router.post('/scan', asyncHandler(catalogCtrl.triggerScan));
router.get('/scan/status', asyncHandler(catalogCtrl.getScanStatus));
router.get('/scan/logs', asyncHandler(catalogCtrl.getScanLogs));

// ──────────────────────────────────────────────
// Scan Config
// ──────────────────────────────────────────────

router.get('/scan/config', asyncHandler(catalogCtrl.listScanConfigs));
router.put('/scan/config/:spaceName', asyncHandler(catalogCtrl.updateScanConfig));

// ──────────────────────────────────────────────
// Stats
// ──────────────────────────────────────────────

router.get('/stats', asyncHandler(catalogCtrl.getStats));

// ──────────────────────────────────────────────
// Jobs
// ──────────────────────────────────────────────

router.get('/jobs/stats', asyncHandler(catalogCtrl.getJobStats));

export default router;
