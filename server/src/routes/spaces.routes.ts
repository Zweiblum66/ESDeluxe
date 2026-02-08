import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as spacesController from '../controllers/spaces.controller.js';
import * as goalsController from '../controllers/goals.controller.js';
import filesRoutes from './files.routes.js';

const router = Router();

// Mount file browser routes under /:name/files
router.use('/:name/files', filesRoutes);

// GET /
router.get('/', asyncHandler(spacesController.listSpaces));

// GET /:name
router.get('/:name', asyncHandler(spacesController.getSpace));

// POST /
router.post('/', asyncHandler(spacesController.createSpace));

// PUT /:name
router.put('/:name', asyncHandler(spacesController.updateSpace));

// DELETE /:name
router.delete('/:name', asyncHandler(spacesController.deleteSpace));

// GET /:name/users
router.get('/:name/users', asyncHandler(spacesController.getSpaceUsers));

// POST /:name/users
router.post('/:name/users', asyncHandler(spacesController.addUserToSpace));

// PUT /:name/users/:username
router.put('/:name/users/:username', asyncHandler(spacesController.setUserAccess));

// DELETE /:name/users/:username
router.delete('/:name/users/:username', asyncHandler(spacesController.removeUserFromSpace));

// GET /:name/groups
router.get('/:name/groups', asyncHandler(spacesController.getSpaceGroups));

// POST /:name/groups
router.post('/:name/groups', asyncHandler(spacesController.addGroupToSpace));

// PUT /:name/groups/:groupName
router.put('/:name/groups/:groupName', asyncHandler(spacesController.setGroupAccess));

// DELETE /:name/groups/:groupName
router.delete('/:name/groups/:groupName', asyncHandler(spacesController.removeGroupFromSpace));

// GET /:name/permission-overrides
router.get('/:name/permission-overrides', asyncHandler(spacesController.getPermissionOverrides));

// DELETE /:name/users/:username/override
router.delete('/:name/users/:username/override', asyncHandler(spacesController.removePermissionOverride));

// GET /:name/goal — get space-level storage goal
router.get('/:name/goal', asyncHandler(goalsController.getSpaceGoal));

// PUT /:name/goal — set space-level storage goal
router.put('/:name/goal', asyncHandler(goalsController.setSpaceGoal));

export default router;
