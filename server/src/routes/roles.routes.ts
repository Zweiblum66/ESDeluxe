import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as rolesController from '../controllers/roles.controller.js';

const router = Router();

// List all space manager assignments (admin only — guarded at mount)
router.get('/', asyncHandler(rolesController.listAll));

// Get managers for a specific space
router.get('/spaces/:name', asyncHandler(rolesController.getSpaceManagersHandler));

// Assign a user or group as space manager
router.post('/spaces/:name', asyncHandler(rolesController.assignManager));

// Remove a user or group as space manager
router.delete('/spaces/:name', asyncHandler(rolesController.removeManager));

// Update capabilities for a specific user manager on a space
router.put('/spaces/:name/users/:username/capabilities', asyncHandler(rolesController.updateCapabilities));

export default router;
