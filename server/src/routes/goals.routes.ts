import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as goalsController from '../controllers/goals.controller.js';

const router = Router();

// GET /api/v1/goals — list all available storage goals
router.get('/', asyncHandler(goalsController.listGoals));

export default router;
