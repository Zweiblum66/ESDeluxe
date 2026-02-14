<script setup lang="ts">
import { useGuardianStore } from '@/stores/guardian.store';
import type { IGuardianEvent, GuardianEventType } from '@shared/types/guardian';

const store = useGuardianStore();

const emit = defineEmits<{
  'click:event': [event: IGuardianEvent];
}>();

const eventTypeOptions = [
  { title: 'All Types', value: '' },
  { title: 'File Audit', value: 'file_audit' },
  { title: 'Storage', value: 'storage' },
  { title: 'System', value: 'system' },
];

const severityOptions = [
  { title: 'All', value: '' },
  { title: 'Info', value: 'info' },
  { title: 'Warn', value: 'warn' },
  { title: 'Error', value: 'error' },
];

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function typeColor(type: string): string {
  switch (type) {
    case 'file_audit': return 'blue';
    case 'storage': return 'green';
    case 'system': return 'orange';
    default: return 'grey';
  }
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'error': return 'error';
    case 'warn': return 'warning';
    case 'debug': return 'grey';
    default: return 'info';
  }
}

function truncatePath(path: string | null, maxLen = 50): string {
  if (!path) return '—';
  if (path.length <= maxLen) return path;
  return '...' + path.slice(-(maxLen - 3));
}

function handleRowClick(event: IGuardianEvent): void {
  emit('click:event', event);
}

function applyFilter(): void {
  store.applyFilters();
}
</script>

<template>
  <v-card class="guardian-events-table">
    <v-card-text>
      <!-- Filter bar -->
      <div class="guardian-events-table__filters">
        <v-select
          v-model="store.filterEventType"
          :items="eventTypeOptions"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          class="guardian-events-table__filter"
          style="max-width: 160px"
          @update:model-value="applyFilter"
        />
        <v-text-field
          v-model="store.filterUsername"
          placeholder="Username"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          prepend-inner-icon="mdi-account"
          class="guardian-events-table__filter"
          style="max-width: 180px"
          @keyup.enter="applyFilter"
          @click:clear="applyFilter"
        />
        <v-text-field
          v-model="store.filterSpaceName"
          placeholder="Space"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          prepend-inner-icon="mdi-folder"
          class="guardian-events-table__filter"
          style="max-width: 180px"
          @keyup.enter="applyFilter"
          @click:clear="applyFilter"
        />
        <v-btn
          size="small"
          variant="tonal"
          color="primary"
          @click="applyFilter"
        >
          <v-icon start>mdi-filter</v-icon>
          Filter
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          @click="store.clearFilters()"
        >
          Clear
        </v-btn>
      </div>

      <!-- Loading bar -->
      <v-progress-linear
        v-if="store.isLoadingEvents"
        indeterminate
        color="primary"
        class="mb-2"
      />

      <!-- Events table -->
      <v-table density="compact" hover class="guardian-events-table__table">
        <thead>
          <tr>
            <th style="width: 160px">Time</th>
            <th style="width: 100px">Type</th>
            <th style="width: 120px">Action</th>
            <th>User</th>
            <th>Space</th>
            <th>File Path</th>
            <th style="width: 120px">Client IP</th>
            <th style="width: 80px">Severity</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="event in store.events"
            :key="event.id"
            class="guardian-events-table__row"
            @click="handleRowClick(event)"
          >
            <td class="text-no-wrap">{{ formatTime(event.receivedAt) }}</td>
            <td>
              <v-chip size="x-small" :color="typeColor(event.eventType)" variant="tonal">
                {{ event.eventType }}
              </v-chip>
            </td>
            <td>{{ event.eventAction || '—' }}</td>
            <td>{{ event.username || '—' }}</td>
            <td>{{ event.spaceName || '—' }}</td>
            <td class="guardian-events-table__path">{{ truncatePath(event.filePath) }}</td>
            <td>{{ event.clientIp || '—' }}</td>
            <td>
              <v-chip size="x-small" :color="severityColor(event.severity)" variant="tonal">
                {{ event.severity }}
              </v-chip>
            </td>
          </tr>
          <tr v-if="store.events.length === 0 && !store.isLoadingEvents">
            <td colspan="8" class="text-center text-medium-emphasis py-8">
              No events found for the selected time range and filters.
            </td>
          </tr>
        </tbody>
      </v-table>

      <!-- Load more -->
      <div v-if="store.hasMore" class="d-flex justify-center mt-4">
        <v-btn
          variant="outlined"
          size="small"
          :loading="store.isLoadingEvents"
          @click="store.loadMore()"
        >
          Load More
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped lang="scss">
.guardian-events-table {
  background-color: #22252d !important;
  border: 1px solid rgba(55, 65, 81, 0.3);

  &__filters {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  &__row {
    cursor: pointer;
  }

  &__path {
    font-family: monospace;
    font-size: 12px;
    color: #93c5fd;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__table {
    background-color: transparent !important;
  }
}
</style>
