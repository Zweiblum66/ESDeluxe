import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as groupsController from '../controllers/groups.controller.js';

const router = Router();

// GET /
router.get('/', asyncHandler(groupsController.listGroups));

// GET /:name
router.get('/:name', asyncHandler(groupsController.getGroup));

// POST /
router.post('/', asyncHandler(groupsController.createGroup));

// DELETE /:name
router.delete('/:name', asyncHandler(groupsController.deleteGroup));

// POST /:name/rename
router.post('/:name/rename', asyncHandler(groupsController.renameGroup));

// GET /:name/users
router.get('/:name/users', asyncHandler(groupsController.getGroupUsers));

// POST /:name/users/bulk — MUST come before /:name/users/:username
router.post('/:name/users/bulk', asyncHandler(groupsController.bulkAddUsersToGroup));

// POST /:name/users
router.post('/:name/users', asyncHandler(groupsController.addUserToGroup));

// DELETE /:name/users/:username
router.delete('/:name/users/:username', asyncHandler(groupsController.removeUserFromGroup));

// GET /:name/spaces
router.get('/:name/spaces', asyncHandler(groupsController.getGroupSpaces));

export default router;
