<script setup lang="ts">
import type { ITieringExecutionLog } from '@shared/types';

interface Props {
  logs: ITieringExecutionLog[];
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Execution Log',
});

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
        <tr v-for="log in props.logs" :key="log.id">
          <td class="text-caption">{{ formatDate(log.startedAt) }}</td>
          <td>
            <v-chip :color="statusColor(log.status)" size="x-small" variant="tonal" label>
              {{ log.status }}
            </v-chip>
          </td>
          <td class="text-end">{{ log.filesProcessed }}</td>
          <td class="text-end">{{ log.filesSkipped }}</td>
          <td class="text-end">
            <span :class="{ 'text-error': log.filesFailed > 0 }">
              {{ log.filesFailed }}
            </span>
          </td>
          <td class="text-end text-caption">{{ formatBytes(log.bytesProcessed) }}</td>
          <td class="text-end text-caption">{{ formatDuration(log) }}</td>
        </tr>
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
</style>
