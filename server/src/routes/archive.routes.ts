import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as archiveController from '../controllers/archive.controller.js';

const router = Router();

// ── Archive Locations ────────────────────────
router.get('/locations', asyncHandler(archiveController.listLocations));
router.post('/locations', asyncHandler(archiveController.createLocation));
router.get('/locations/:id', asyncHandler(archiveController.getLocation));
router.put('/locations/:id', asyncHandler(archiveController.updateLocation));
router.delete('/locations/:id', asyncHandler(archiveController.deleteLocation));
router.post('/locations/:id/test', asyncHandler(archiveController.testLocation));

// ── File Archive / Restore ───────────────────
router.post('/files/archive', asyncHandler(archiveController.archiveFile));
router.post('/files/archive-bulk', asyncHandler(archiveController.bulkArchive));
router.post('/files/restore', asyncHandler(archiveController.restoreFile));
router.post('/files/restore-bulk', asyncHandler(archiveController.bulkRestore));

// ── Catalog ──────────────────────────────────
router.get('/catalog', asyncHandler(archiveController.queryCatalog));
router.get('/catalog/:id', asyncHandler(archiveController.getCatalogEntry));
router.delete('/catalog/:id', asyncHandler(archiveController.deleteCatalogEntry));

// ── Stats ────────────────────────────────────
router.get('/stats', asyncHandler(archiveController.getStats));

export default router;
