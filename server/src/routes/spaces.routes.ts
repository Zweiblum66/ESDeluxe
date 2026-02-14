import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as spacesController from '../controllers/spaces.controller.js';
import * as goalsController from '../controllers/goals.controller.js';
import filesRoutes from './files.routes.js';
import { requireAdmin } from '../middleware/admin.js';
import { requireSpaceAccess } from '../middleware/space-access.js';
import { requireSpaceManagement } from '../middleware/space-management.js';

const router = Router();

// Mount file browser routes under /:name/files (space read access checked at mount)
router.use('/:name/files', requireSpaceAccess('read'), filesRoutes);

// GET / — list spaces (filtered by user access in controller)
router.get('/', asyncHandler(spacesController.listSpaces));

// GET /:name — view space detail (read access for regular users, full for managers)
router.get('/:name', requireSpaceAccess('read'), asyncHandler(spacesController.getSpace));

// POST / — create space (admin only)
router.post('/', requireAdmin, asyncHandler(spacesController.createSpace));

// PUT /:name — update space / quota (admin or space manager with quota capability)
router.put('/:name', requireSpaceManagement('manage_quota'), asyncHandler(spacesController.updateSpace));

// POST /:name/clone — clone/duplicate space (admin only)
router.post('/:name/clone', requireAdmin, asyncHandler(spacesController.cloneSpace));

// DELETE /:name — delete space (admin only)
router.delete('/:name', requireAdmin, asyncHandler(spacesController.deleteSpace));

// Space user management — admin or space manager with manage_users capability
router.get('/:name/users', requireSpaceManagement(), asyncHandler(spacesController.getSpaceUsers));
router.post('/:name/users', requireSpaceManagement('manage_users'), asyncHandler(spacesController.addUserToSpace));
router.put('/:name/users/:username', requireSpaceManagement('manage_users'), asyncHandler(spacesController.setUserAccess));
router.delete('/:name/users/:username', requireSpaceManagement('manage_users'), asyncHandler(spacesController.removeUserFromSpace));

// Space group management — admin or space manager with manage_groups capability
router.get('/:name/groups', requireSpaceManagement(), asyncHandler(spacesController.getSpaceGroups));
router.post('/:name/groups', requireSpaceManagement('manage_groups'), asyncHandler(spacesController.addGroupToSpace));
router.put('/:name/groups/:groupName', requireSpaceManagement('manage_groups'), asyncHandler(spacesController.setGroupAccess));
router.delete('/:name/groups/:groupName', requireSpaceManagement('manage_groups'), asyncHandler(spacesController.removeGroupFromSpace));

// Permission overrides — admin or space manager with manage_users capability
router.get('/:name/permission-overrides', requireSpaceManagement(), asyncHandler(spacesController.getPermissionOverrides));
router.delete('/:name/users/:username/override', requireSpaceManagement('manage_users'), asyncHandler(spacesController.removePermissionOverride));

// GET /:name/goal — get space-level storage goal (read access)
router.get('/:name/goal', requireSpaceAccess('read'), asyncHandler(goalsController.getSpaceGoal));

// PUT /:name/goal — set space-level storage goal (admin or space manager)
router.put('/:name/goal', requireSpaceManagement(), asyncHandler(goalsController.setSpaceGoal));

export default router;
