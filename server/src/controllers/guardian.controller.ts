import type { Request, Response } from 'express';
import { ValidationError } from '../utils/errors.js';
import * as eventsStore from '../services/guardian-events.store.js';
import { getGuardianReceiverStatus } from '../services/guardian-receiver.service.js';

/**
 * GET /api/v1/guardian/status
 * Returns the Guardian log receiver status
 */
export async function getStatus(_req: Request, res: Response): Promise<void> {
  const status = getGuardianReceiverStatus();
  const totalEvents = eventsStore.getTotalCount();
  res.json({ data: { ...status, totalStoredEvents: totalEvents } });
}

/**
 * GET /api/v1/guardian/events
 * Query Guardian events with optional filters.
 * Query params: eventType, eventAction, username, spaceName, from, to, limit, offset
 */
export async function listEvents(req: Request, res: Response): Promise<void> {
  const { eventType, eventAction, username, spaceName, from, to, limit, offset } = req.query;

  const events = eventsStore.queryEvents({
    eventType: typeof eventType === 'string' ? eventType as eventsStore.GuardianEventType : undefined,
    eventAction: typeof eventAction === 'string' ? eventAction : undefined,
    username: typeof username === 'string' ? username : undefined,
    spaceName: typeof spaceName === 'string' ? spaceName : undefined,
    from: from ? Number(from) : undefined,
    to: to ? Number(to) : undefined,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });

  res.json({ data: events });
}

/**
 * GET /api/v1/guardian/stats
 * Get event count statistics grouped by type.
 * Query params: from, to (optional, unix timestamps)
 */
export async function getStats(req: Request, res: Response): Promise<void> {
  const { from, to } = req.query;

  const stats = eventsStore.getEventStats(
    from ? Number(from) : undefined,
    to ? Number(to) : undefined,
  );

  res.json({ data: stats });
}

/**
 * GET /api/v1/guardian/timeline
 * Get event counts bucketed by time interval for timeline chart.
 * Query params: from, to (unix timestamps, required), buckets (default 24)
 */
export async function getTimeline(req: Request, res: Response): Promise<void> {
  const { from, to, buckets } = req.query;

  const now = Math.floor(Date.now() / 1000);
  const fromTs = from ? Number(from) : now - 86400; // Default: last 24h
  const toTs = to ? Number(to) : now;
  const bucketCount = buckets ? Math.min(Number(buckets), 100) : 24;

  const timeline = eventsStore.getEventTimeline(fromTs, toTs, bucketCount);
  res.json({ data: timeline });
}

/**
 * POST /api/v1/guardian/ingest
 * HTTP-based event ingestion endpoint (alternative to TCP receiver).
 * Accepts a single event or array of events.
 * Body: { events: [...] } or a single event object
 */
export async function ingestEvents(req: Request, res: Response): Promise<void> {
  const body = req.body;

  let rawEvents: unknown[];
  if (Array.isArray(body.events)) {
    rawEvents = body.events;
  } else if (Array.isArray(body)) {
    rawEvents = body;
  } else if (typeof body === 'object' && body !== null) {
    rawEvents = [body];
  } else {
    throw new ValidationError('Request body must be an event object, array, or { events: [...] }');
  }

  if (rawEvents.length > 1000) {
    throw new ValidationError('Maximum 1000 events per batch');
  }

  const events: eventsStore.InsertGuardianEvent[] = [];

  for (const raw of rawEvents) {
    if (typeof raw !== 'object' || raw === null) continue;

    const r = raw as Record<string, unknown>;
    const eventType = (typeof r.eventType === 'string' ? r.eventType : 'system') as eventsStore.GuardianEventType;

    events.push({
      eventType,
      eventAction: typeof r.eventAction === 'string' ? r.eventAction : undefined,
      timestamp: typeof r.timestamp === 'string' ? r.timestamp : undefined,
      sourceHost: typeof r.sourceHost === 'string' ? r.sourceHost : undefined,
      username: typeof r.username === 'string' ? r.username : undefined,
      spaceName: typeof r.spaceName === 'string' ? r.spaceName : undefined,
      poolName: typeof r.poolName === 'string' ? r.poolName : undefined,
      storageNodeGroup: typeof r.storageNodeGroup === 'string' ? r.storageNodeGroup : undefined,
      filePath: typeof r.filePath === 'string' ? r.filePath : undefined,
      bytesTransferred: typeof r.bytesTransferred === 'number' ? r.bytesTransferred : undefined,
      clientIp: typeof r.clientIp === 'string' ? r.clientIp : undefined,
      detailsJson: typeof r.details === 'object' ? JSON.stringify(r.details) : undefined,
      severity: typeof r.severity === 'string' ? r.severity : 'info',
    });
  }

  const inserted = eventsStore.insertEvents(events);
  res.json({ data: { inserted } });
}
