import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

// POST /login
router.post('/login', asyncHandler(authController.login));

// GET /me
router.get('/me', asyncHandler(authController.me));

// GET /backends
router.get('/backends', asyncHandler(authController.backends));

export default router;
