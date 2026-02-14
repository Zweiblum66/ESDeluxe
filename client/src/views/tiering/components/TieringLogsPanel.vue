<script setup lang="ts">
import { ref } from 'vue';
import type { ITieringExecutionLog } from '@shared/types';

interface Props {
  logs: ITieringExecutionLog[];
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Execution Log',
});

const expandedLogId = ref<number | null>(null);

function toggleErrors(logId: number): void {
  expandedLogId.value = expandedLogId.value === logId ? null : logId;
}

interface ParsedError {
  space: string;
  path: string;
  message: string;
}

function parseErrorEntry(entry: string): ParsedError {
  // Format: "[spaceName] path/to/file: error message"
  const bracketMatch = entry.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (!bracketMatch) {
    return { space: '', path: '', message: entry };
  }
  const space = bracketMatch[1];
  const rest = bracketMatch[2];
  // Split on first ": " to separate path from message
  const colonIdx = rest.indexOf(': ');
  if (colonIdx === -1) {
    return { space, path: rest, message: '' };
  }
  return {
    space,
    path: rest.substring(0, colonIdx),
    message: rest.substring(colonIdx + 2),
  };
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(log: ITieringExecutionLog): string {
  if (!log.completedAt) return 'running...';
  const seconds = log.completedAt - log.startedAt;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'completed': return 'success';
    case 'failed': return 'error';
    case 'running': return 'info';
    case 'cancelled': return 'warning';
    default: return 'grey';
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + sizes[i];
}
</script>

<template>
  <div class="tiering-logs-panel">
    <div class="text-subtitle-2 mb-2">{{ title }}</div>

    <div v-if="props.logs.length === 0" class="text-caption text-medium-emphasis">
      No execution logs yet
    </div>

    <v-table v-else density="compact" class="logs-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Status</th>
          <th class="text-end">Processed</th>
          <th class="text-end">Skipped</th>
          <th class="text-end">Failed</th>
          <th class="text-end">Data</th>
          <th class="text-end">Duration</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="log in props.logs" :key="log.id">
          <tr>
            <td class="text-caption">{{ formatDate(log.startedAt) }}</td>
            <td>
              <v-chip :color="statusColor(log.status)" size="x-small" variant="tonal" label>
                {{ log.status }}
              </v-chip>
            </td>
            <td class="text-end">{{ log.filesProcessed }}</td>
            <td class="text-end">{{ log.filesSkipped }}</td>
            <td class="text-end">
              <span
                v-if="log.filesFailed > 0 && log.errors?.length"
                class="failed-toggle"
                @click="toggleErrors(log.id)"
              >
                {{ log.filesFailed }}
                <v-icon size="14" class="failed-toggle__icon">
                  {{ expandedLogId === log.id ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                </v-icon>
              </span>
              <span v-else :class="{ 'text-error': log.filesFailed > 0 }">
                {{ log.filesFailed }}
              </span>
            </td>
            <td class="text-end text-caption">{{ formatBytes(log.bytesProcessed) }}</td>
            <td class="text-end text-caption">{{ formatDuration(log) }}</td>
          </tr>

          <!-- Expandable error detail row -->
          <tr v-if="expandedLogId === log.id && log.errors?.length" class="error-expansion-row">
            <td colspan="7" class="pa-0">
              <div class="error-details">
                <div class="error-details__header">
                  <v-icon size="14" color="error" class="mr-1">mdi-alert-circle</v-icon>
                  <span>{{ log.errors.length }} error{{ log.errors.length !== 1 ? 's' : '' }}</span>
                  <v-spacer />
                  <v-btn
                    icon="mdi-close"
                    size="x-small"
                    variant="text"
                    density="compact"
                    @click="expandedLogId = null"
                  />
                </div>
                <div class="error-details__list">
                  <div v-for="(err, idx) in log.errors" :key="idx" class="error-details__row">
                    <span v-if="parseErrorEntry(err).space" class="error-details__space">
                      [{{ parseErrorEntry(err).space }}]
                    </span>
                    <span class="error-details__path">{{ parseErrorEntry(err).path }}</span>
                    <span v-if="parseErrorEntry(err).message" class="error-details__message">{{ parseErrorEntry(err).message }}</span>
                    <span v-else class="error-details__message">{{ err }}</span>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </v-table>
  </div>
</template>

<style scoped lang="scss">
.logs-table {
  background: transparent !important;

  :deep(table) {
    background: #22252d;
  }

  :deep(th) {
    font-size: 11px !important;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af !important;
  }

  :deep(td) {
    font-size: 13px;
  }
}

.failed-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: #ef4444;
  cursor: pointer;
  font-weight: 500;
  border-bottom: 1px dashed rgba(239, 68, 68, 0.5);
  padding-bottom: 1px;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.8;
  }

  &__icon {
    color: #ef4444;
    margin-left: 2px;
  }
}

.error-expansion-row {
  :deep(td) {
    border-bottom: none !important;
  }
}

.error-details {
  background-color: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 6px;
  margin: 0 12px 12px;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 500;
    color: #ef4444;
    border-bottom: 1px solid rgba(239, 68, 68, 0.1);
    background-color: rgba(239, 68, 68, 0.05);
  }

  &__list {
    max-height: 240px;
    overflow-y: auto;
    padding: 6px 0;
  }

  &__row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 4px 12px;
    font-size: 12px;
    line-height: 1.5;

    &:hover {
      background-color: rgba(255, 255, 255, 0.03);
    }
  }

  &__space {
    color: #6b7280;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 11px;
    flex-shrink: 0;
  }

  &__path {
    color: #9ca3af;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
    flex-shrink: 1;
    min-width: 0;
  }

  &__message {
    color: #ef4444;
    font-size: 12px;
    flex: 1;
    min-width: 0;
  }
}
</style>
