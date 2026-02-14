<script setup lang="ts">
import { computed } from 'vue';
import type { ITieringSchedulerStatus, ITieringProgress, ITieringExecutionLog } from '@shared/types';

interface Props {
  schedulerStatus: ITieringSchedulerStatus | null;
  progress: ITieringProgress | null;
  lastLog: ITieringExecutionLog | null;
}

const props = defineProps<Props>();

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const nextCheckLabel = computed(() => {
  if (!props.schedulerStatus?.nextCheckAt) return null;
  const secs = props.schedulerStatus.nextCheckAt - Math.floor(Date.now() / 1000);
  if (secs <= 0) return 'now';
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m`;
});

const lastRunLabel = computed(() => {
  if (!props.lastLog) return null;
  const d = new Date(props.lastLog.startedAt * 1000);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
});

const elapsed = computed(() => {
  if (!props.progress) return '';
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - props.progress.startedAt);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
});
</script>

<template>
  <div class="tiering-summary">
    <!-- Running state -->
    <template v-if="progress">
      <div class="tiering-summary__header">
        <div class="tiering-summary__title">
          <v-progress-circular size="16" width="2" indeterminate color="info" class="mr-2" />
          <span>Tiering: {{ progress.ruleName }}</span>
        </div>
        <span class="tiering-summary__elapsed">{{ elapsed }}</span>
      </div>

      <v-progress-linear
        :model-value="progress.percentComplete"
        :color="progress.filesFailed > 0 ? 'warning' : 'info'"
        height="5"
        rounded
        class="tiering-summary__bar"
      />

      <div class="tiering-summary__stats">
        <span>{{ progress.filesProcessed }} / {{ progress.totalFiles }} files</span>
        <span v-if="progress.bytesProcessed > 0">{{ formatBytes(progress.bytesProcessed) }}</span>
        <span v-if="progress.filesFailed > 0" class="text-error">{{ progress.filesFailed }} failed</span>
      </div>

      <div v-if="progress.currentFile" class="tiering-summary__file">
        {{ progress.currentFile }}
      </div>
    </template>

    <!-- Idle state -->
    <template v-else>
      <div class="tiering-summary__header">
        <div class="tiering-summary__title">
          <v-icon size="20" color="grey" class="mr-2">mdi-swap-vertical-bold</v-icon>
          <span>Automated Tiering</span>
        </div>
        <v-chip
          v-if="schedulerStatus?.isRunning"
          size="x-small"
          variant="tonal"
          color="success"
          label
        >
          Active
        </v-chip>
        <v-chip v-else size="x-small" variant="tonal" color="grey" label>
          Stopped
        </v-chip>
      </div>

      <div class="tiering-summary__info">
        <div v-if="schedulerStatus" class="tiering-summary__row">
          <span class="tiering-summary__label">Active rules</span>
          <span>{{ schedulerStatus.activeRuleCount }}</span>
        </div>
        <div v-if="lastLog" class="tiering-summary__row">
          <span class="tiering-summary__label">Last run</span>
          <span>
            {{ lastRunLabel }} &mdash;
            {{ lastLog.filesProcessed }} files
            <span v-if="lastLog.filesFailed > 0" class="text-error">, {{ lastLog.filesFailed }} failed</span>
          </span>
        </div>
        <div v-if="nextCheckLabel" class="tiering-summary__row">
          <span class="tiering-summary__label">Next check</span>
          <span>in {{ nextCheckLabel }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.tiering-summary {
  background-color: #22252d;
  border: 1px solid rgba(55, 65, 81, 0.3);
  border-radius: 8px;
  padding: 16px 20px;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  &__title {
    display: flex;
    align-items: center;
    font-size: 14px;
    font-weight: 500;
    color: #e5e7eb;
  }

  &__elapsed {
    font-size: 12px;
    color: #6b7280;
  }

  &__bar {
    margin-bottom: 8px;
  }

  &__stats {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #9ca3af;
  }

  &__file {
    margin-top: 6px;
    padding: 4px 8px;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
    font-size: 11px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: #6b7280;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    direction: rtl;
    text-align: left;
  }

  &__info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #9ca3af;
  }

  &__label {
    color: #6b7280;
    min-width: 80px;
    flex-shrink: 0;
  }
}
</style>
