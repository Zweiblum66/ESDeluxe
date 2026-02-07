import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as usersController from '../controllers/users.controller.js';

const router = Router();

// GET /
router.get('/', asyncHandler(usersController.listUsers));

// GET /:username
router.get('/:username', asyncHandler(usersController.getUser));

// POST /
router.post('/', asyncHandler(usersController.createUser));

// DELETE /:username
router.delete('/:username', asyncHandler(usersController.deleteUser));

// PUT /:username/password
router.put('/:username/password', asyncHandler(usersController.updatePassword));

// GET /:username/spaces
router.get('/:username/spaces', asyncHandler(usersController.getUserSpaces));

// GET /:username/groups
router.get('/:username/groups', asyncHandler(usersController.getUserGroups));

// POST /:username/groups
router.post('/:username/groups', asyncHandler(usersController.addUserToGroups));

export default router;
