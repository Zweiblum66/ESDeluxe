<script setup lang="ts">
import type { ITieringSchedulerStatus } from '@shared/types';

interface Props {
  status: ITieringSchedulerStatus | null;
}

const props = defineProps<Props>();

function formatDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}
</script>

<template>
  <v-card class="scheduler-status-card mb-4" variant="outlined">
    <v-card-text class="d-flex align-center gap-4 py-3">
      <div class="d-flex align-center gap-2">
        <v-icon
          :color="props.status?.isRunning ? 'success' : 'grey'"
          size="20"
        >
          {{ props.status?.isRunning ? 'mdi-play-circle' : 'mdi-pause-circle' }}
        </v-icon>
        <span class="text-body-2 font-weight-medium">
          Scheduler: {{ props.status?.isRunning ? 'Active' : 'Stopped' }}
        </span>
      </div>

      <v-divider vertical class="mx-2" />

      <div class="text-caption text-medium-emphasis">
        Interval: {{ props.status?.intervalMinutes || '—' }} min
      </div>

      <div class="text-caption text-medium-emphasis">
        Active rules: {{ props.status?.activeRuleCount ?? '—' }}
      </div>

      <div class="text-caption text-medium-emphasis">
        Last check: {{ formatDate(props.status?.lastCheckAt) }}
      </div>

      <div class="text-caption text-medium-emphasis">
        Next check: {{ formatDate(props.status?.nextCheckAt) }}
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped lang="scss">
.scheduler-status-card {
  background-color: rgba(30, 33, 40, 0.6) !important;
}
</style>
