import { createServer, Server, Socket } from 'net';
import { createServer as createHttpServer, IncomingMessage, ServerResponse, Server as HttpServer } from 'http';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import * as eventsStore from './guardian-events.store.js';
import * as historyStore from './qos-history.store.js';
import * as alertsStore from './qos-alerts.store.js';
import * as guardianQueue from './guardian-queue.store.js';
import { parseGuardianPayload, parseGuardianEvent } from '../../../shared/types/guardian.js';
import type { InsertGuardianEvent } from '../../../shared/types/guardian.js';

// ──────────────────────────────────────────────
// State
// ──────────────────────────────────────────────

let server: Server | HttpServer | null = null;
let eventsReceived = 0;
let lastEventAt: number | undefined;
let startedAt: number | undefined;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let queueSweepTimer: ReturnType<typeof setInterval> | null = null;

// ──────────────────────────────────────────────
// Process events locally (inline) — store + QoS feed + alerts
// ──────────────────────────────────────────────

/**
 * Process parsed events: store in DB, feed bandwidth history, check alerts.
 * Used by both local mode processing and worker result ingestion.
 */
export function processEvents(events: InsertGuardianEvent[]): void {
  if (events.length === 0) return;

  eventsStore.insertEvents(events);
  for (const event of events) {
    maybeFeedBandwidthHistory(event);
    maybeCheckAlerts(event);
  }
  eventsReceived += events.length;
  lastEventAt = Date.now();
}

function maybeFeedBandwidthHistory(event: InsertGuardianEvent): void {
  if (
    event.eventType === 'storage' &&
    event.poolName &&
    event.storageNodeGroup &&
    event.bytesTransferred !== undefined &&
    event.bytesTransferred !== null
  ) {
    try {
      historyStore.insertSamples(event.storageNodeGroup, [
        { poolName: event.poolName, bytesPerSecond: event.bytesTransferred },
      ]);
    } catch {
      // Non-critical — don't break event ingestion
    }
  }
}

function maybeCheckAlerts(event: InsertGuardianEvent): void {
  if (
    event.eventType === 'storage' &&
    event.poolName &&
    event.storageNodeGroup &&
    event.bytesTransferred !== undefined &&
    event.bytesTransferred !== null
  ) {
    try {
      alertsStore.checkThresholds([
        {
          storageNodeGroup: event.storageNodeGroup,
          poolName: event.poolName,
          bytesPerSecond: event.bytesTransferred,
        },
      ]);
    } catch {
      // Non-critical
    }
  }
}

// ──────────────────────────────────────────────
// Handle incoming payload — local vs queue mode
// ──────────────────────────────────────────────

const QUEUE_FALLBACK_THRESHOLD = 500;

function handlePayload(body: string, protocol: 'elasticsearch' | 'logstash'): { received: number } {
  if (config.GUARDIAN_WORKER_MODE === 'queue') {
    // Check if queue is overloaded — fall back to local processing
    const stats = guardianQueue.getStats();
    if (stats.pending >= QUEUE_FALLBACK_THRESHOLD) {
      logger.warn(
        { pending: stats.pending, threshold: QUEUE_FALLBACK_THRESHOLD },
        'Guardian queue overloaded — falling back to local processing',
      );
      return handlePayloadLocal(body, protocol);
    }

    // Estimate event count from body size
    const lineCount = body.split('\n').filter((l) => l.trim().length > 0).length;
    const estimate = protocol === 'elasticsearch' ? Math.floor(lineCount / 2) : lineCount;

    guardianQueue.enqueue(body, protocol, estimate);
    eventsReceived += estimate;
    lastEventAt = Date.now();

    return { received: estimate };
  }

  return handlePayloadLocal(body, protocol);
}

function handlePayloadLocal(body: string, protocol: 'elasticsearch' | 'logstash'): { received: number } {
  const events = parseGuardianPayload(body, protocol);
  processEvents(events);
  return { received: events.length };
}

// ──────────────────────────────────────────────
// Basic Auth helper
// ──────────────────────────────────────────────

function checkBasicAuth(req: IncomingMessage): boolean {
  const expectedUser = config.GUARDIAN_RECEIVER_USER;
  const expectedPass = config.GUARDIAN_RECEIVER_PASSWORD;

  // If no credentials configured, skip auth
  if (!expectedUser && !expectedPass) return true;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;

  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const colonIdx = decoded.indexOf(':');
  if (colonIdx === -1) return false;

  const user = decoded.slice(0, colonIdx);
  const pass = decoded.slice(colonIdx + 1);
  return user === expectedUser && pass === expectedPass;
}

function rejectUnauthorized(res: ServerResponse): void {
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Guardian Receiver"', 'Content-Type': 'text/plain' });
  res.end('Unauthorized');
}

// ──────────────────────────────────────────────
// Protocol: Logstash HTTP JSON
// ──────────────────────────────────────────────

function startLogstashReceiver(port: number): void {
  const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    // Health check (no auth needed)
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', eventsReceived, protocol: 'logstash' }));
      return;
    }

    if (req.method !== 'POST' && req.method !== 'PUT') {
      res.writeHead(405);
      res.end();
      return;
    }

    if (!checkBasicAuth(req)) {
      logger.warn('Guardian receiver: auth rejected');
      rejectUnauthorized(res);
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));

    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      const result = handlePayload(body, 'logstash');

      logger.debug({ eventsReceived: result.received, total: eventsReceived }, 'Guardian receiver: request processed');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, received: result.received }));
    });

    req.on('error', (err) => {
      logger.error({ err }, 'Guardian logstash receiver: request error');
      res.writeHead(500);
      res.end();
    });
  });

  httpServer.listen(port, '0.0.0.0', () => {
    logger.info({ port, protocol: 'logstash/http', workerMode: config.GUARDIAN_WORKER_MODE }, 'Guardian log receiver listening');
  });

  httpServer.on('error', (err) => {
    logger.error({ err, port }, 'Guardian receiver: server error');
  });

  server = httpServer;
}

// ──────────────────────────────────────────────
// Protocol: Elasticsearch HTTP (JSON bulk or single)
// ──────────────────────────────────────────────

function startElasticsearchReceiver(port: number): void {
  const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    // Health check for GET (no auth needed)
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', eventsReceived, protocol: 'elasticsearch' }));
      return;
    }

    if (req.method !== 'POST' && req.method !== 'PUT') {
      res.writeHead(405);
      res.end();
      return;
    }

    if (!checkBasicAuth(req)) {
      logger.warn('Guardian ES receiver: auth rejected');
      rejectUnauthorized(res);
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));

    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      const result = handlePayload(body, 'elasticsearch');

      logger.debug({ eventsReceived: result.received, total: eventsReceived }, 'Guardian ES receiver: request processed');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ took: 0, errors: false, items: result.received }));
    });

    req.on('error', (err) => {
      logger.error({ err }, 'Guardian ES receiver: request error');
      res.writeHead(500);
      res.end();
    });
  });

  httpServer.listen(port, '0.0.0.0', () => {
    logger.info({ port, protocol: 'elasticsearch/http', workerMode: config.GUARDIAN_WORKER_MODE }, 'Guardian log receiver listening');
  });

  httpServer.on('error', (err) => {
    logger.error({ err, port }, 'Guardian ES receiver: server error');
  });

  server = httpServer;
}

// ──────────────────────────────────────────────
// Protocol: Syslog over TCP (RFC 5424 / RFC 3164)
// Note: Syslog always processes locally (no queue mode)
// ──────────────────────────────────────────────

function startSyslogReceiver(port: number): void {
  const tcpServer = createServer((socket: Socket) => {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.debug({ remote }, 'Guardian syslog receiver: client connected');

    let buffer = '';

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);

        if (line.length === 0) continue;

        // Try parsing as JSON first (structured syslog)
        const jsonStart = line.indexOf('{');
        if (jsonStart !== -1) {
          try {
            const jsonPart = line.slice(jsonStart);
            const payload = JSON.parse(jsonPart) as Record<string, unknown>;
            const event = parseGuardianEvent(payload);
            if (event) {
              eventsStore.insertEvent(event);
              maybeFeedBandwidthHistory(event);
              maybeCheckAlerts(event);
              eventsReceived++;
              lastEventAt = Date.now();
              continue;
            }
          } catch {
            // Not valid JSON, treat as plain syslog
          }
        }

        // Plain syslog message — store as system event with raw message
        const event: InsertGuardianEvent = {
          eventType: 'system',
          eventAction: 'syslog',
          timestamp: new Date().toISOString(),
          detailsJson: JSON.stringify({ raw: line }),
          severity: 'info',
        };

        // Try to extract severity from syslog priority
        const priorityMatch = line.match(/^<(\d+)>/);
        if (priorityMatch) {
          const severity = parseInt(priorityMatch[1], 10) & 0x07;
          if (severity <= 3) event.severity = 'error';
          else if (severity <= 4) event.severity = 'warn';
          else event.severity = 'info';
        }

        eventsStore.insertEvent(event);
        eventsReceived++;
        lastEventAt = Date.now();
      }
    });

    socket.on('error', (err) => {
      logger.debug({ err, remote }, 'Guardian syslog receiver: socket error');
    });
  });

  tcpServer.listen(port, '0.0.0.0', () => {
    logger.info({ port, protocol: 'syslog/tcp' }, 'Guardian log receiver listening');
  });

  server = tcpServer;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export function startGuardianReceiver(): void {
  if (!config.GUARDIAN_RECEIVER_ENABLED) {
    logger.info('Guardian log receiver is disabled (GUARDIAN_RECEIVER_ENABLED=false)');
    return;
  }

  if (server) {
    logger.warn('Guardian log receiver already running');
    return;
  }

  const port = config.GUARDIAN_RECEIVER_PORT;
  const protocol = config.GUARDIAN_RECEIVER_PROTOCOL;
  startedAt = Date.now();

  switch (protocol) {
    case 'logstash':
      startLogstashReceiver(port);
      break;
    case 'elasticsearch':
      startElasticsearchReceiver(port);
      break;
    case 'syslog':
      startSyslogReceiver(port);
      break;
  }

  // Periodic cleanup of old events
  const retentionDays = config.GUARDIAN_EVENT_RETENTION_DAYS;
  cleanupTimer = setInterval(() => {
    eventsStore.cleanOldEvents(retentionDays);
  }, 6 * 60 * 60 * 1000); // Every 6 hours

  // Queue mode: periodic sweep for stale claimed batches + cleanup completed
  if (config.GUARDIAN_WORKER_MODE === 'queue') {
    queueSweepTimer = setInterval(() => {
      guardianQueue.expireStale(300); // 5 minute timeout for claimed batches
      guardianQueue.cleanCompleted(config.GUARDIAN_QUEUE_RETENTION_HOURS);
    }, 60_000); // Every minute
  }
}

export function stopGuardianReceiver(): void {
  if (server) {
    server.close();
    server = null;
    logger.info('Guardian log receiver stopped');
  }

  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  if (queueSweepTimer) {
    clearInterval(queueSweepTimer);
    queueSweepTimer = null;
  }
}

export interface IGuardianReceiverStatus {
  enabled: boolean;
  running: boolean;
  protocol: string;
  port: number;
  eventsReceived: number;
  lastEventAt: number | undefined;
  startedAt: number | undefined;
  retentionDays: number;
  workerMode: string;
  queueStats?: { pending: number; claimed: number; completed: number; failed: number };
}

export function getGuardianReceiverStatus(): IGuardianReceiverStatus {
  const status: IGuardianReceiverStatus = {
    enabled: config.GUARDIAN_RECEIVER_ENABLED,
    running: server !== null,
    protocol: config.GUARDIAN_RECEIVER_PROTOCOL,
    port: config.GUARDIAN_RECEIVER_PORT,
    eventsReceived,
    lastEventAt,
    startedAt,
    retentionDays: config.GUARDIAN_EVENT_RETENTION_DAYS,
    workerMode: config.GUARDIAN_WORKER_MODE,
  };

  if (config.GUARDIAN_WORKER_MODE === 'queue') {
    status.queueStats = guardianQueue.getStats();
  }

  return status;
}
