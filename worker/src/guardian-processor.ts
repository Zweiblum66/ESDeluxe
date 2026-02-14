import { logger } from './logger.js';
import { createRequire } from 'module';
import type { InsertGuardianEvent, IGuardianBatchResult } from '../../shared/types/guardian.js';

const require = createRequire(import.meta.url);
const { parseGuardianPayload } = require('../../shared/types/guardian.js') as {
  parseGuardianPayload: (body: string, protocol: 'elasticsearch' | 'logstash') => InsertGuardianEvent[];
};

/**
 * Process a raw Guardian batch payload.
 * Parses the payload using the shared parser and returns structured events.
 */
export function processGuardianBatch(rawPayload: string, sourceProtocol: string): IGuardianBatchResult {
  const protocol = sourceProtocol === 'logstash' ? 'logstash' : 'elasticsearch';
  const totalLines = rawPayload.split('\n').filter((l) => l.trim().length > 0).length;
  let parseErrors = 0;

  let events: InsertGuardianEvent[];
  try {
    events = parseGuardianPayload(rawPayload, protocol);
  } catch (err) {
    logger.error({ err }, 'Guardian batch parse failed completely');
    return { events: [], parseErrors: totalLines, totalLines };
  }

  // Estimate parse errors: for ES bulk, expect ~half the lines to be events
  const expectedEvents = protocol === 'elasticsearch' ? Math.floor(totalLines / 2) : totalLines;
  parseErrors = Math.max(0, expectedEvents - events.length);

  return { events, parseErrors, totalLines };
}
