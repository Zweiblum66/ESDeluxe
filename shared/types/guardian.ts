// ──────────────────────────────────────────────
// Guardian Event Types — shared between server and worker
// ──────────────────────────────────────────────

export type GuardianEventType = 'storage' | 'system' | 'file_audit';

export interface IGuardianEvent {
  id: number;
  receivedAt: number;
  eventType: GuardianEventType;
  eventAction: string | null;
  timestamp: string | null;
  sourceHost: string | null;
  username: string | null;
  spaceName: string | null;
  poolName: string | null;
  storageNodeGroup: string | null;
  filePath: string | null;
  bytesTransferred: number | null;
  clientIp: string | null;
  detailsJson: string | null;
  severity: string;
}

export interface InsertGuardianEvent {
  eventType: GuardianEventType;
  eventAction?: string;
  timestamp?: string;
  sourceHost?: string;
  username?: string;
  spaceName?: string;
  poolName?: string;
  storageNodeGroup?: string;
  filePath?: string;
  bytesTransferred?: number;
  clientIp?: string;
  detailsJson?: string;
  severity?: string;
}

// ──────────────────────────────────────────────
// Frontend / API response types
// ──────────────────────────────────────────────

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
  totalStoredEvents: number;
  queueStats?: { pending: number; claimed: number; completed: number; failed: number };
}

export interface IGuardianEventStats {
  eventType: string;
  count: number;
}

export interface IGuardianTimelineBucket {
  bucket: number;
  file_audit: number;
  storage: number;
  system: number;
}

// ──────────────────────────────────────────────
// Worker queue types
// ──────────────────────────────────────────────

export interface IGuardianBatchClaim {
  batchId: string;
  rawPayload: string;
  sourceProtocol: string;
  eventCountEstimate: number;
}

export interface IGuardianBatchResult {
  events: InsertGuardianEvent[];
  parseErrors: number;
  totalLines: number;
}

// ──────────────────────────────────────────────
// Guardian Event Parser — pure functions, no dependencies
// Used by both server (local mode) and worker
// ──────────────────────────────────────────────

/**
 * Parse an ES bulk payload body into Guardian events.
 * Handles both Elasticsearch bulk format (action + document pairs)
 * and Logstash-style JSON (single objects, arrays, or newline-delimited).
 */
export function parseGuardianPayload(body: string, protocol: 'elasticsearch' | 'logstash'): InsertGuardianEvent[] {
  if (protocol === 'elasticsearch') {
    return parseEsBulkPayload(body);
  }
  return parseLogstashPayload(body);
}

/**
 * Parse an Elasticsearch bulk API body.
 * Format: alternating lines of {create:{_index:...}} and {document}.
 */
function parseEsBulkPayload(body: string): InsertGuardianEvent[] {
  const events: InsertGuardianEvent[] = [];
  const lines = body.split('\n').filter((l) => l.trim().length > 0);
  let i = 0;

  while (i < lines.length) {
    try {
      const parsed = JSON.parse(lines[i]) as Record<string, unknown>;
      const bulkAction = parsed.index || parsed.create;

      if (bulkAction) {
        // Extract index name for classification hint
        const indexName =
          typeof bulkAction === 'object' && bulkAction !== null
            ? ((bulkAction as Record<string, unknown>)._index as string | undefined)
            : undefined;
        i++;
        if (i < lines.length) {
          const doc = JSON.parse(lines[i]) as Record<string, unknown>;
          if (indexName) doc._sourceIndex = indexName;
          const event = parseGuardianEvent(doc);
          if (event) events.push(event);
        }
      } else {
        const event = parseGuardianEvent(parsed);
        if (event) events.push(event);
      }
    } catch {
      // Skip unparseable lines
    }
    i++;
  }

  return events;
}

/**
 * Parse a Logstash-style payload (JSON array, single object, or newline-delimited JSON).
 */
function parseLogstashPayload(body: string): InsertGuardianEvent[] {
  const events: InsertGuardianEvent[] = [];

  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === 'object' && item !== null) {
          const event = parseGuardianEvent(item as Record<string, unknown>);
          if (event) events.push(event);
        }
      }
      return events;
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const event = parseGuardianEvent(parsed as Record<string, unknown>);
      if (event) events.push(event);
      return events;
    }
  } catch {
    // Not a single JSON blob — try newline-delimited JSON
  }

  const lines = body.split('\n').filter((l) => l.trim().length > 0);
  for (const line of lines) {
    try {
      const payload = JSON.parse(line) as Record<string, unknown>;
      const event = parseGuardianEvent(payload);
      if (event) events.push(event);
    } catch {
      // Skip unparseable lines
    }
  }

  return events;
}

/**
 * Parse a single raw Guardian event object into an InsertGuardianEvent.
 */
export function parseGuardianEvent(raw: Record<string, unknown>): InsertGuardianEvent | null {
  try {
    const eventType = classifyEventType(raw);
    if (!eventType) return null;

    const event: InsertGuardianEvent = {
      eventType,
      timestamp: extractString(raw, '@timestamp', 'timestamp', 'time', 'date'),
      sourceHost: extractString(raw, 'host.name', 'agent.hostname', 'host', 'hostname', 'source_host', 'beat.hostname'),
      username: extractString(raw, 'efs.user', 'user', 'username', 'user.name', 'client_user'),
      spaceName: extractString(raw, 'efs.space_name', 'space', 'space_name', 'media_space', 'volume'),
      poolName: extractString(raw, 'efs.pool_name', 'pool', 'pool_name', 'qos_pool'),
      storageNodeGroup: extractString(raw, 'efs.storage_node_group', 'storage_node_group', 'sng', 'node_group'),
      filePath: extractString(raw, 'efs.path', 'path', 'file_path', 'file', 'filename', 'file.path'),
      clientIp: extractString(raw, 'efs.client_ip', 'client_ip', 'src_ip', 'source.ip', 'ip', 'remote_addr'),
      bytesTransferred: extractNumber(raw, 'efs.bytes', 'bytes', 'bytes_transferred', 'size', 'file_size', 'bytes_read', 'bytes_written'),
      severity: extractString(raw, 'level', 'severity', 'log.level', 'priority') ?? 'info',
      detailsJson: JSON.stringify(raw),
    };

    // Extract action — Guardian EFS audit uses efs.event for the action
    event.eventAction = extractString(raw, 'efs.event', 'action', 'event_type', 'event.action', 'operation', 'op');

    // Strip internal _sourceIndex tag from stored JSON
    if ('_sourceIndex' in raw) {
      const { _sourceIndex, ...cleanRaw } = raw;
      void _sourceIndex;
      event.detailsJson = JSON.stringify(cleanRaw);
    }

    return event;
  } catch {
    return null;
  }
}

/**
 * Classify an event as storage, file_audit, or system.
 */
function classifyEventType(raw: Record<string, unknown>): GuardianEventType | null {
  // Check the ES index name for classification
  const sourceIndex = extractString(raw, '_sourceIndex');
  if (sourceIndex) {
    if (sourceIndex.startsWith('efs-audit')) return 'file_audit';
    if (sourceIndex.startsWith('storage-stats')) return 'storage';
    if (sourceIndex.startsWith('health-events')) return 'system';
  }

  // Check explicit type fields
  const typeField = extractString(raw, 'event_category', 'category', 'log_type', 'event.category');
  if (typeField) {
    const lower = typeField.toLowerCase();
    if (lower.includes('storage') || lower.includes('bandwidth') || lower.includes('qos') || lower.includes('pool')) {
      return 'storage';
    }
    if (lower.includes('file') || lower.includes('audit')) {
      return 'file_audit';
    }
    if (lower.includes('system') || lower.includes('auth') || lower.includes('login')) {
      return 'system';
    }
  }

  // Guardian EFS audit events have an efs.event field
  const efsEvent = extractString(raw, 'efs.event');
  if (efsEvent) {
    if (/read-file|write|delete|rename|create|copy|move|find|mkdir|rmdir|link|chmod|chown|setxattr/.test(efsEvent)) {
      return 'file_audit';
    }
    if (/login|logout|auth|session|mount|unmount/.test(efsEvent)) {
      return 'system';
    }
    return 'file_audit';
  }

  // Heuristic classification based on available fields
  const hasFilePath = !!extractString(raw, 'efs.path', 'path', 'file_path', 'file', 'filename', 'file.path');
  const hasPoolName = !!extractString(raw, 'efs.pool_name', 'pool', 'pool_name', 'qos_pool');
  const hasBytes = extractNumber(raw, 'efs.bytes', 'bytes', 'bytes_transferred', 'size', 'bytes_read', 'bytes_written') !== undefined;
  const action = extractString(raw, 'action', 'operation', 'op') ?? '';

  if (hasPoolName || action.includes('bandwidth') || action.includes('qos')) return 'storage';
  if (hasFilePath && (hasBytes || /read|write|delete|rename|create|copy|move/.test(action))) return 'file_audit';
  if (hasBytes || /transfer|upload|download|copy/.test(action)) return 'storage';
  if (/login|logout|auth|session|config|restart|shutdown|startup/.test(action)) return 'system';

  return 'system';
}

/**
 * Extract a string value trying multiple field names (supports dot-path notation).
 */
function extractString(raw: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (key.includes('.')) {
      const val = getNestedValue(raw, key);
      if (typeof val === 'string' && val.length > 0) return val;
    } else {
      const val = raw[key];
      if (typeof val === 'string' && val.length > 0) return val;
    }
  }
  return undefined;
}

/**
 * Extract a number value trying multiple field names.
 */
function extractNumber(raw: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const val = key.includes('.') ? getNestedValue(raw, key) : raw[key];
    if (typeof val === 'number' && !isNaN(val)) return val;
    if (typeof val === 'string') {
      const n = Number(val);
      if (!isNaN(n)) return n;
    }
  }
  return undefined;
}

/**
 * Resolve a dot-notation path like "agent.hostname" on an object.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
