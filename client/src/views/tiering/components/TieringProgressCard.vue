<script setup lang="ts">
import { computed } from 'vue';
import type { ITieringProgress } from '@shared/types';

interface Props {
  progress: ITieringProgress;
}

const props = defineProps<Props>();

const elapsed = computed(() => {
  const now = Math.floor(Date.now() / 1000);
  const secs = Math.max(0, now - props.progress.startedAt);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const barColor = computed(() => {
  if (props.progress.filesFailed > 0) return 'warning';
  return 'info';
});

const statusLabel = computed(() => {
  if (props.progress.status === 'enumerating') return 'Scanning files...';
  return `${props.progress.filesProcessed} / ${props.progress.totalFiles} files`;
});
</script>

<template>
  <div class="progress-card">
    <!-- Header row -->
    <div class="progress-card__header">
      <div class="progress-card__title">
        <v-progress-circular size="16" width="2" indeterminate color="info" class="mr-2" />
        <span class="progress-card__rule-name">{{ progress.ruleName }}</span>
      </div>
      <span class="progress-card__elapsed">{{ elapsed }}</span>
    </div>

    <!-- Progress bar -->
    <v-progress-linear
      :model-value="progress.percentComplete"
      :color="barColor"
      height="6"
      rounded
      class="progress-card__bar"
    />

    <!-- Stats row -->
    <div class="progress-card__stats">
      <span>{{ statusLabel }}</span>
      <span v-if="progress.bytesProcessed > 0">{{ formatBytes(progress.bytesProcessed) }}</span>
      <span v-if="progress.filesFailed > 0" class="progress-card__failed">
        {{ progress.filesFailed }} failed
      </span>
      <span v-if="progress.currentSpace" class="progress-card__space">
        Space: {{ progress.currentSpace }}
      </span>
    </div>

    <!-- Current file -->
    <div v-if="progress.currentFile" class="progress-card__current-file">
      <v-icon size="14" color="grey" class="mr-1">mdi-file-outline</v-icon>
      {{ progress.currentFile }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.progress-card {
  background-color: rgba(59, 130, 246, 0.06);
  border: 1px solid rgba(59, 130, 246, 0.15);
  border-radius: 8px;
  padding: 14px 18px;
  margin-bottom: 16px;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  &__title {
    display: flex;
    align-items: center;
    font-size: 14px;
    font-weight: 500;
    color: #e5e7eb;
  }

  &__rule-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__elapsed {
    font-size: 12px;
    color: #6b7280;
    flex-shrink: 0;
    margin-left: 12px;
  }

  &__bar {
    margin-bottom: 10px;
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 12px;
    color: #9ca3af;
  }

  &__failed {
    color: #ef4444;
  }

  &__space {
    color: #6b7280;
  }

  &__current-file {
    display: flex;
    align-items: center;
    margin-top: 8px;
    padding: 6px 10px;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    font-size: 12px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: #9ca3af;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    direction: rtl;
    text-align: left;
  }
}
</style>
