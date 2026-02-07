import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as spacesController from '../controllers/spaces.controller.js';

const router = Router();

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

export default router;
