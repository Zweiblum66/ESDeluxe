import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import * as qosController from '../controllers/qos.controller.js';

const router = Router();

// ── Config ───────────────────────────────────
router.get('/config', asyncHandler(qosController.getQosConfig));
router.put('/config/:storageNodeGroup', asyncHandler(qosController.setQosConfig));

// ── Usage ────────────────────────────────────
router.get('/usage', asyncHandler(qosController.getQosUsage));
router.get('/client-pools', asyncHandler(qosController.getClientPools));

// ── History ──────────────────────────────────
router.get('/history', asyncHandler(qosController.getHistory));
router.get('/scheduler-status', asyncHandler(qosController.getSchedulerStatus));

// ── Profiles ─────────────────────────────────
router.get('/profiles', asyncHandler(qosController.listProfiles));
router.post('/profiles/from-current', asyncHandler(qosController.createProfileFromCurrent));
router.post('/profiles', asyncHandler(qosController.createProfile));
router.get('/profiles/:id', asyncHandler(qosController.getProfile));
router.put('/profiles/:id', asyncHandler(qosController.updateProfile));
router.delete('/profiles/:id', asyncHandler(qosController.deleteProfile));

// ── Schedules ────────────────────────────────
router.get('/schedules', asyncHandler(qosController.listSchedules));
router.post('/schedules', asyncHandler(qosController.createSchedule));
router.put('/schedules/:id', asyncHandler(qosController.updateSchedule));
router.delete('/schedules/:id', asyncHandler(qosController.deleteSchedule));

// ── Alert Thresholds ─────────────────────────
router.get('/alerts/thresholds', asyncHandler(qosController.listAlertThresholds));
router.post('/alerts/thresholds', asyncHandler(qosController.createAlertThreshold));
router.put('/alerts/thresholds/:id', asyncHandler(qosController.updateAlertThreshold));
router.delete('/alerts/thresholds/:id', asyncHandler(qosController.deleteAlertThreshold));

// ── Alert Events ─────────────────────────────
router.get('/alerts/events', asyncHandler(qosController.listAlertEvents));
router.post('/alerts/events/acknowledge', asyncHandler(qosController.acknowledgeAlertEvents));
router.get('/alerts/unacknowledged-count', asyncHandler(qosController.getUnacknowledgedAlertCount));

export default router;
