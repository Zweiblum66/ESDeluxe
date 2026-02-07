import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as qosController from '../controllers/qos.controller.js';

const router = Router();

// GET /config
router.get('/config', asyncHandler(qosController.getQosConfig));

// PUT /config/:storageNodeGroup
router.put('/config/:storageNodeGroup', asyncHandler(qosController.setQosConfig));

// GET /usage
router.get('/usage', asyncHandler(qosController.getQosUsage));

// GET /client-pools
router.get('/client-pools', asyncHandler(qosController.getClientPools));

export default router;
