<script setup lang="ts">
import type { IGuardianReceiverStatus } from '@shared/types/guardian';

defineProps<{
  status: IGuardianReceiverStatus | null;
}>();

function formatTime(ts: number | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString();
}
</script>

<template>
  <v-card class="guardian-status-bar">
    <v-card-text class="d-flex align-center flex-wrap gap-4 py-3">
      <!-- Running indicator -->
      <div class="d-flex align-center gap-2">
        <span
          class="guardian-status-bar__dot"
          :class="status?.running ? 'guardian-status-bar__dot--active' : 'guardian-status-bar__dot--inactive'"
        />
        <span class="text-body-2 font-weight-medium">
          {{ status?.running ? 'Receiver Active' : 'Receiver Stopped' }}
        </span>
      </div>

      <v-divider vertical class="mx-1" />

      <!-- Protocol + Port -->
      <div class="text-body-2 text-medium-emphasis">
        <v-icon size="16" class="mr-1">mdi-ethernet</v-icon>
        {{ status?.protocol || '—' }} : {{ status?.port || '—' }}
      </div>

      <v-divider vertical class="mx-1" />

      <!-- Events received (session) -->
      <div class="text-body-2 text-medium-emphasis">
        <v-icon size="16" class="mr-1">mdi-counter</v-icon>
        {{ (status?.eventsReceived ?? 0).toLocaleString() }} received
      </div>

      <v-divider vertical class="mx-1" />

      <!-- Last event -->
      <div class="text-body-2 text-medium-emphasis">
        <v-icon size="16" class="mr-1">mdi-clock-outline</v-icon>
        Last: {{ formatTime(status?.lastEventAt) }}
      </div>

      <v-divider vertical class="mx-1" />

      <!-- Total stored -->
      <div class="text-body-2 text-medium-emphasis">
        <v-icon size="16" class="mr-1">mdi-database</v-icon>
        {{ (status?.totalStoredEvents ?? 0).toLocaleString() }} stored
      </div>

      <!-- Worker mode badge -->
      <v-chip
        v-if="status?.workerMode === 'queue'"
        size="small"
        color="info"
        variant="tonal"
        class="ml-auto"
      >
        <v-icon start size="14">mdi-server-network</v-icon>
        Queue Mode
      </v-chip>

      <!-- Queue stats (if queue mode) -->
      <template v-if="status?.queueStats">
        <v-chip size="x-small" color="warning" variant="tonal">
          {{ status.queueStats.pending }} pending
        </v-chip>
        <v-chip size="x-small" color="info" variant="tonal">
          {{ status.queueStats.claimed }} claimed
        </v-chip>
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped lang="scss">
.guardian-status-bar {
  background-color: #22252d !important;
  border: 1px solid rgba(55, 65, 81, 0.3);

  &__dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;

    &--active {
      background-color: #22c55e;
      box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
    }

    &--inactive {
      background-color: #6b7280;
    }
  }
}
</style>
