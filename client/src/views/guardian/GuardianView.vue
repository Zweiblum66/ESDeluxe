<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useGuardianStore } from '@/stores/guardian.store';
import type { TimeRange } from '@/stores/guardian.store';
import type { IGuardianEvent } from '@shared/types/guardian';
import GuardianStatusBar from './GuardianStatusBar.vue';
import GuardianStatsCards from './GuardianStatsCards.vue';
import GuardianTimeline from './GuardianTimeline.vue';
import GuardianEventsTable from './GuardianEventsTable.vue';
import GuardianEventDetail from './GuardianEventDetail.vue';

const store = useGuardianStore();

const selectedEvent = ref<IGuardianEvent | null>(null);
const showDetail = ref(false);
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const timeRangeOptions: Array<{ label: string; value: TimeRange }> = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
];

function startAutoRefresh(): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    store.refreshOverview();
  }, 30_000);
}

function stopAutoRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function handleEventClick(event: IGuardianEvent): void {
  selectedEvent.value = event;
  showDetail.value = true;
}

onMounted(() => {
  store.fetchAll();
  startAutoRefresh();
});

onUnmounted(() => {
  stopAutoRefresh();
});
</script>

<template>
  <div class="guardian-view">
    <!-- Header -->
    <div class="guardian-view__header">
      <div>
        <h2 class="guardian-view__title">Auditing & Monitoring</h2>
        <p class="guardian-view__subtitle">Guardian event stream from EditShare</p>
      </div>

      <div class="d-flex align-center gap-2">
        <!-- Time range selector -->
        <v-btn-toggle
          :model-value="store.timeRange"
          mandatory
          density="compact"
          variant="outlined"
          color="primary"
          divided
          @update:model-value="store.setTimeRange($event as TimeRange)"
        >
          <v-btn
            v-for="opt in timeRangeOptions"
            :key="opt.value"
            :value="opt.value"
            size="small"
          >
            {{ opt.label }}
          </v-btn>
        </v-btn-toggle>

        <!-- Refresh -->
        <v-btn
          variant="outlined"
          size="small"
          color="primary"
          prepend-icon="mdi-refresh"
          :loading="store.isLoading"
          @click="store.fetchAll()"
        >
          Refresh
        </v-btn>
      </div>
    </div>

    <!-- Error -->
    <v-alert
      v-if="store.error"
      type="warning"
      variant="tonal"
      closable
      class="mb-4"
    >
      {{ store.error }}
    </v-alert>

    <!-- Loading -->
    <v-progress-linear
      v-if="store.isLoading"
      indeterminate
      color="primary"
      class="mb-4"
    />

    <!-- Status Bar -->
    <GuardianStatusBar :status="store.status" class="mb-4" />

    <!-- Stats Cards -->
    <GuardianStatsCards :stats="store.stats" class="mb-4" />

    <!-- Timeline -->
    <GuardianTimeline :buckets="store.timeline" class="mb-4" />

    <!-- Events Table -->
    <GuardianEventsTable @click:event="handleEventClick" />

    <!-- Event Detail Dialog -->
    <GuardianEventDetail
      v-model="showDetail"
      :event="selectedEvent"
    />
  </div>
</template>

<style scoped lang="scss">
.guardian-view {
  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
  }

  &__title {
    font-size: 22px;
    font-weight: 600;
    color: #e5e7eb;
    margin: 0;
  }

  &__subtitle {
    font-size: 13px;
    color: #6b7280;
    margin: 4px 0 0;
  }
}
</style>
