import { Router } from 'express';
import systemRoutes from './system.routes.js';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import groupsRoutes from './groups.routes.js';
import spacesRoutes from './spaces.routes.js';
import qosRoutes from './qos.routes.js';
import goalsRoutes from './goals.routes.js';
import tieringRoutes from './tiering.routes.js';
import archiveRoutes from './archive.routes.js';
import trashRoutes from './trash.routes.js';
import rolesRoutes from './roles.routes.js';
import catalogRoutes from './asset-catalog.routes.js';
import guardianRoutes from './guardian.routes.js';
import workerRoutes from './worker.routes.js';
import { requireAdmin } from '../middleware/admin.js';

const router = Router();

router.use('/system', systemRoutes);
router.use('/auth', authRoutes);

// Admin-only routes
router.use('/users', requireAdmin, usersRoutes);
router.use('/groups', requireAdmin, groupsRoutes);
router.use('/qos', requireAdmin, qosRoutes);
router.use('/tiering', requireAdmin, tieringRoutes);
router.use('/roles', requireAdmin, rolesRoutes);

// Routes with mixed access (space-level filtering handled inside controllers/routes)
router.use('/spaces', spacesRoutes);
router.use('/goals', goalsRoutes);
router.use('/archive', archiveRoutes);
router.use('/trash', trashRoutes);
router.use('/catalog', catalogRoutes);
router.use('/guardian', requireAdmin, guardianRoutes);

// Worker API (uses its own API key auth, not JWT)
router.use('/worker', workerRoutes);

export default router;
