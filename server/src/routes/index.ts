import { Router } from 'express';
import systemRoutes from './system.routes.js';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import groupsRoutes from './groups.routes.js';
import spacesRoutes from './spaces.routes.js';
import qosRoutes from './qos.routes.js';

const router = Router();

router.use('/system', systemRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/groups', groupsRoutes);
router.use('/spaces', spacesRoutes);
router.use('/qos', qosRoutes);

export default router;
