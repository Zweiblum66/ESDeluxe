<script setup lang="ts">
import { computed } from 'vue';
import type { IGuardianEvent } from '@shared/types/guardian';

const props = defineProps<{
  event: IGuardianEvent | null;
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const parsedJson = computed(() => {
  if (!props.event?.detailsJson) return null;
  try {
    return JSON.stringify(JSON.parse(props.event.detailsJson), null, 2);
  } catch {
    return props.event.detailsJson;
  }
});

function formatTimestamp(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

function close(): void {
  emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="700"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card v-if="event" class="guardian-event-detail">
      <v-card-title class="d-flex align-center gap-2">
        <v-icon size="20">mdi-text-box-search</v-icon>
        Event Detail
        <v-spacer />
        <v-btn icon size="small" variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text>
        <div class="guardian-event-detail__grid">
          <div class="guardian-event-detail__field">
            <span class="text-caption text-medium-emphasis">ID</span>
            <span>{{ event.id }}</span>
          </div>
          <div class="guardian-event-detail__field">
            <span class="text-caption text-medium-emphasis">Received</span>
            <span>{{ formatTimestamp(event.receivedAt) }}</span>
          </div>
          <div class="guardian-event-detail__field">
            <span class="text-caption text-medium-emphasis">Type</span>
            <v-chip size="small" :color="typeColor(event.eventType)" variant="tonal">
              {{ event.eventType }}
            </v-chip>
          </div>
          <div class="guardian-event-detail__field">
            <span class="text-caption text-medium-emphasis">Action</span>
            <span>{{ event.eventAction || '—' }}</span>
          </div>
          <div class="guardian-event-detail__field">
            <span class="text-caption text-medium-emphasis">Severity</span>
            <v-chip size="small" :color="severityColor(event.severity)" variant="tonal">
              {{ event.severity }}
            </v-chip>
          </div>
          <div class="guardian-event-detail__field">
            <span class="text-caption text-medium-emphasis">Original Timestamp</span>
            <span>{{ event.timestamp || '—' }}</span>
          </div>
          <div class="guardian-event-detail__field">
            <span class="text-caption text-medium-emphasis">Source Host</span>
            <span>{{ event.sourceHost || '—' }}</span>
          </div>
          <div class="guardian-event-detail__field">
            <span class="text-caption text-medium-emphasis">Username</span>
            <span>{{ event.username || '—' }}</span>
          </div>
          <div class="guardian-event-detail__field">
            <span class="text-caption text-medium-emphasis">Space</span>
            <span>{{ event.spaceName || '—' }}</span>
          </div>
          <div class="guardian-event-detail__field">
            <span class="text-caption text-medium-emphasis">Pool</span>
            <span>{{ event.poolName || '—' }}</span>
          </div>
          <div class="guardian-event-detail__field">
            <span class="text-caption text-medium-emphasis">Client IP</span>
            <span>{{ event.clientIp || '—' }}</span>
          </div>
          <div class="guardian-event-detail__field">
            <span class="text-caption text-medium-emphasis">Bytes</span>
            <span>{{ event.bytesTransferred?.toLocaleString() ?? '—' }}</span>
          </div>
          <div v-if="event.filePath" class="guardian-event-detail__field guardian-event-detail__field--full">
            <span class="text-caption text-medium-emphasis">File Path</span>
            <span class="guardian-event-detail__path">{{ event.filePath }}</span>
          </div>
        </div>

        <!-- Raw JSON -->
        <div v-if="parsedJson" class="mt-4">
          <div class="text-caption text-medium-emphasis mb-2">Raw Event Payload</div>
          <pre class="guardian-event-detail__json">{{ parsedJson }}</pre>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
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
</script>

<style scoped lang="scss">
.guardian-event-detail {
  background-color: #1a1d23 !important;

  &__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px 24px;

    @media (max-width: 600px) {
      grid-template-columns: 1fr;
    }
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 2px;

    &--full {
      grid-column: 1 / -1;
    }
  }

  &__path {
    font-family: monospace;
    font-size: 13px;
    word-break: break-all;
    color: #93c5fd;
  }

  &__json {
    background-color: #0d1117;
    border: 1px solid rgba(55, 65, 81, 0.3);
    border-radius: 6px;
    padding: 12px;
    font-size: 12px;
    font-family: 'Fira Code', 'Cascadia Code', monospace;
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
    color: #c9d1d9;
    white-space: pre;
    margin: 0;
  }
}
</style>
