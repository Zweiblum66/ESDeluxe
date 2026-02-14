import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import { logger } from '../utils/logger.js';
import type { IGuardianBatchClaim } from '../../../shared/types/guardian.js';

// ──────────────────────────────────────────────
// Enqueue
// ──────────────────────────────────────────────

export function enqueue(rawPayload: string, protocol: string, estimateCount: number): string {
  const db = getDatabase();
  const batchId = randomUUID();

  db.prepare(`
    INSERT INTO guardian_event_queue (batch_id, raw_payload, source_protocol, event_count_estimate)
    VALUES (?, ?, ?, ?)
  `).run(batchId, rawPayload, protocol, estimateCount);

  return batchId;
}

// ──────────────────────────────────────────────
// Claim
// ──────────────────────────────────────────────

interface QueueRow {
  id: number;
  batch_id: string;
  raw_payload: string;
  source_protocol: string;
  event_count_estimate: number;
}

export function claimBatch(workerId: string): IGuardianBatchClaim | null {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  // Atomic: find oldest pending and mark as claimed
  const row = db.prepare(`
    UPDATE guardian_event_queue
    SET status = 'claimed', claimed_by = ?, claimed_at = ?
    WHERE id = (
      SELECT id FROM guardian_event_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
    )
    RETURNING batch_id, raw_payload, source_protocol, event_count_estimate
  `).get(workerId, now) as QueueRow | undefined;

  if (!row) return null;

  return {
    batchId: row.batch_id,
    rawPayload: row.raw_payload,
    sourceProtocol: row.source_protocol,
    eventCountEstimate: row.event_count_estimate,
  };
}

// ──────────────────────────────────────────────
// Complete / Fail / Heartbeat
// ──────────────────────────────────────────────

export function completeBatch(batchId: string, workerId: string, eventsProcessed: number): boolean {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  const result = db.prepare(`
    UPDATE guardian_event_queue
    SET status = 'completed', completed_at = ?, events_processed = ?
    WHERE batch_id = ? AND claimed_by = ? AND status = 'claimed'
  `).run(now, eventsProcessed, batchId, workerId);

  return result.changes > 0;
}

export function failBatch(batchId: string, workerId: string, error: string): boolean {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  const result = db.prepare(`
    UPDATE guardian_event_queue
    SET status = 'failed', completed_at = ?, error_message = ?
    WHERE batch_id = ? AND claimed_by = ? AND status = 'claimed'
  `).run(now, error, batchId, workerId);

  return result.changes > 0;
}

export function heartbeat(batchId: string, workerId: string): boolean {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  const result = db.prepare(`
    UPDATE guardian_event_queue
    SET claimed_at = ?
    WHERE batch_id = ? AND claimed_by = ? AND status = 'claimed'
  `).run(now, batchId, workerId);

  return result.changes > 0;
}

// ──────────────────────────────────────────────
// Maintenance
// ──────────────────────────────────────────────

export function expireStale(timeoutSeconds: number): number {
  const db = getDatabase();
  const cutoff = Math.floor(Date.now() / 1000) - timeoutSeconds;

  const result = db.prepare(`
    UPDATE guardian_event_queue
    SET status = 'pending', claimed_by = NULL, claimed_at = NULL
    WHERE status = 'claimed' AND claimed_at < ?
  `).run(cutoff);

  if (result.changes > 0) {
    logger.info({ expired: result.changes, timeoutSeconds }, 'Expired stale Guardian queue batches');
  }

  return result.changes;
}

export function cleanCompleted(retentionHours: number): number {
  const db = getDatabase();
  const cutoff = Math.floor(Date.now() / 1000) - retentionHours * 3600;

  const result = db.prepare(`
    DELETE FROM guardian_event_queue
    WHERE status IN ('completed', 'failed') AND completed_at < ?
  `).run(cutoff);

  return result.changes;
}

// ──────────────────────────────────────────────
// Stats
// ──────────────────────────────────────────────

export function getStats(): { pending: number; claimed: number; completed: number; failed: number } {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM guardian_event_queue
    GROUP BY status
  `).all() as Array<{ status: string; count: number }>;

  const stats = { pending: 0, claimed: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    if (row.status in stats) {
      stats[row.status as keyof typeof stats] = row.count;
    }
  }

  return stats;
}
