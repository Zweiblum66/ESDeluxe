<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAutomationStore } from '@/stores/automation.store';

const router = useRouter();
const store = useAutomationStore();

const status = computed(() => store.status);

// ── Helpers ────────────────────────────────────

function formatTimestamp(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function relativeTime(ts?: number): string {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function navigate(path: string): void {
  router.push(path);
}

// ── Tiering card computed ─────────────────────

const tieringStatus = computed(() => {
  const t = status.value?.tiering;
  if (!t) return null;
  return {
    isRunning: t.scheduler.isRunning,
    activeRules: t.scheduler.activeRuleCount,
    interval: t.scheduler.intervalMinutes,
    lastCheck: t.scheduler.lastCheckAt,
    nextCheck: t.scheduler.nextCheckAt,
    progress: t.progress,
  };
});

// ── Catalog scan card computed ────────────────

const catalogStatus = computed(() => {
  const c = status.value?.catalogScan;
  if (!c) return null;
  return {
    isRunning: c.scheduler.isRunning,
    enabledSpaces: c.scheduler.enabledSpaceCount,
    lastCheck: c.scheduler.lastCheckAt,
    nextCheck: c.scheduler.nextCheckAt,
  };
});

// ── Proxy generation card computed ────────────

const proxyStats = computed(() => {
  const c = status.value?.catalogScan;
  if (!c) return null;
  return c.jobs;
});

// ── Trash purge card computed ─────────────────

const trashStatus = computed(() => {
  const t = status.value?.trashPurge;
  if (!t) return null;
  return {
    isRunning: t.isRunning,
    retentionDays: t.retentionDays,
    intervalMinutes: t.purgeIntervalMinutes,
    lastPurge: t.lastPurgeAt,
    nextPurge: t.nextPurgeAt,
    lastPurgeCount: t.lastPurgeCount,
  };
});

// ── QoS card computed ─────────────────────────

const qosStatus = computed(() => {
  const q = status.value?.qos;
  if (!q) return null;
  return {
    enabled: q.enabled,
    running: q.running,
    pollInterval: q.pollIntervalSeconds,
    pollCount: q.pollCount,
    errorCount: q.errorCount,
    lastPoll: q.lastPollAt,
    nextPoll: q.nextPollAt,
  };
});

// ── Guardian card computed ────────────────────

const guardianStatus = computed(() => {
  const g = status.value?.guardian;
  if (!g) return null;
  return {
    enabled: g.enabled,
    running: g.running,
    protocol: g.protocol,
    port: g.port,
    eventsReceived: g.eventsReceived,
    totalStored: g.totalStoredEvents,
    lastEvent: g.lastEventAt,
    workerMode: g.workerMode,
  };
});

// ── Lifecycle ─────────────────────────────────

onMounted(() => {
  store.startPolling(5000);
});

onUnmounted(() => {
  store.stopPolling();
});
</script>

<template>
  <div class="automation-view">
    <div class="automation-view__header">
      <h2 class="automation-view__title">Automation</h2>
      <v-btn
        variant="outlined"
        size="small"
        color="primary"
        prepend-icon="mdi-refresh"
        :loading="store.isLoading"
        @click="store.fetchStatus"
      >
        Refresh
      </v-btn>
    </div>
    <p class="automation-view__subtitle">Background task monitoring — auto-refreshes every 5 seconds</p>

    <v-alert
      v-if="store.error"
      type="warning"
      variant="tonal"
      class="mb-4"
    >
      {{ store.error }}
    </v-alert>

    <!-- Loading skeleton -->
    <div v-if="!status && store.isLoading" class="automation-view__cards">
      <v-card v-for="i in 6" :key="i" class="automation-view__card">
        <v-card-text>
          <v-skeleton-loader type="list-item-three-line" />
        </v-card-text>
      </v-card>
    </div>

    <!-- Cards -->
    <div v-else class="automation-view__cards">

      <!-- ═══ 1. Tiering ═══ -->
      <v-card class="automation-view__card" @click="navigate('/tiering')">
        <v-card-text>
          <div class="automation-view__card-header">
            <v-icon size="28" color="amber-lighten-1">mdi-swap-vertical-bold</v-icon>
            <span class="automation-view__card-title">Automated Tiering</span>
            <v-chip
              v-if="tieringStatus"
              :color="tieringStatus.progress ? 'info' : tieringStatus.isRunning ? 'success' : 'grey'"
              size="x-small"
              variant="flat"
            >
              {{ tieringStatus.progress ? 'Processing' : tieringStatus.isRunning ? 'Active' : 'Stopped' }}
            </v-chip>
          </div>

          <div v-if="tieringStatus" class="automation-view__metrics">
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Active Rules</span>
              <span class="automation-view__metric-value">{{ tieringStatus.activeRules }}</span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Check Interval</span>
              <span class="automation-view__metric-value">{{ tieringStatus.interval }}m</span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Last Check</span>
              <span class="automation-view__metric-value" :title="formatTimestamp(tieringStatus.lastCheck)">
                {{ relativeTime(tieringStatus.lastCheck) || '—' }}
              </span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Next Check</span>
              <span class="automation-view__metric-value" :title="formatTimestamp(tieringStatus.nextCheck)">
                {{ formatTimestamp(tieringStatus.nextCheck) }}
              </span>
            </div>
          </div>

          <!-- Progress bar when running -->
          <div v-if="tieringStatus?.progress" class="automation-view__progress">
            <div class="automation-view__progress-label">
              {{ tieringStatus.progress.ruleName }} — {{ tieringStatus.progress.filesProcessed }}/{{ tieringStatus.progress.totalFiles }} files
            </div>
            <v-progress-linear
              :model-value="tieringStatus.progress.totalFiles ? (tieringStatus.progress.filesProcessed / tieringStatus.progress.totalFiles) * 100 : 0"
              color="info"
              height="6"
              rounded
            />
          </div>

          <div class="automation-view__card-link">Manage Rules <v-icon size="16">mdi-arrow-right</v-icon></div>
        </v-card-text>
      </v-card>

      <!-- ═══ 2. Catalog Scanning ═══ -->
      <v-card class="automation-view__card" @click="navigate('/catalog')">
        <v-card-text>
          <div class="automation-view__card-header">
            <v-icon size="28" color="teal-lighten-2">mdi-filmstrip-box-multiple</v-icon>
            <span class="automation-view__card-title">Asset Catalog Scanning</span>
            <v-chip
              v-if="catalogStatus"
              :color="catalogStatus.isRunning ? 'success' : 'grey'"
              size="x-small"
              variant="flat"
            >
              {{ catalogStatus.isRunning ? 'Active' : 'Stopped' }}
            </v-chip>
          </div>

          <div v-if="catalogStatus" class="automation-view__metrics">
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Enabled Spaces</span>
              <span class="automation-view__metric-value">{{ catalogStatus.enabledSpaces }}</span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Last Scan</span>
              <span class="automation-view__metric-value" :title="formatTimestamp(catalogStatus.lastCheck)">
                {{ relativeTime(catalogStatus.lastCheck) || '—' }}
              </span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Next Scan</span>
              <span class="automation-view__metric-value" :title="formatTimestamp(catalogStatus.nextCheck)">
                {{ formatTimestamp(catalogStatus.nextCheck) }}
              </span>
            </div>
          </div>

          <div class="automation-view__card-link">View Catalog <v-icon size="16">mdi-arrow-right</v-icon></div>
        </v-card-text>
      </v-card>

      <!-- ═══ 3. Proxy Generation ═══ -->
      <v-card class="automation-view__card" @click="navigate('/catalog')">
        <v-card-text>
          <div class="automation-view__card-header">
            <v-icon size="28" color="deep-purple-lighten-2">mdi-movie-open-outline</v-icon>
            <span class="automation-view__card-title">Proxy Generation</span>
            <v-chip
              v-if="proxyStats"
              :color="(proxyStats.processing + proxyStats.claimed) > 0 ? 'info' : proxyStats.pending > 0 ? 'warning' : 'grey'"
              size="x-small"
              variant="flat"
            >
              {{ (proxyStats.processing + proxyStats.claimed) > 0 ? 'Processing' : proxyStats.pending > 0 ? 'Queued' : 'Idle' }}
            </v-chip>
          </div>

          <div v-if="proxyStats" class="automation-view__metrics automation-view__metrics--chips">
            <v-chip size="small" variant="tonal" color="warning" prepend-icon="mdi-clock-outline">
              Pending: {{ proxyStats.pending }}
            </v-chip>
            <v-chip size="small" variant="tonal" color="info" prepend-icon="mdi-cog-outline">
              Processing: {{ proxyStats.processing + proxyStats.claimed }}
            </v-chip>
            <v-chip size="small" variant="tonal" color="success" prepend-icon="mdi-check">
              Completed: {{ proxyStats.completed }}
            </v-chip>
            <v-chip size="small" variant="tonal" color="error" prepend-icon="mdi-alert">
              Failed: {{ proxyStats.failed }}
            </v-chip>
          </div>

          <div class="automation-view__card-link">View Details <v-icon size="16">mdi-arrow-right</v-icon></div>
        </v-card-text>
      </v-card>

      <!-- ═══ 4. Trash Auto-Purge ═══ -->
      <v-card class="automation-view__card" @click="navigate('/trash')">
        <v-card-text>
          <div class="automation-view__card-header">
            <v-icon size="28" color="red-lighten-1">mdi-delete-clock</v-icon>
            <span class="automation-view__card-title">Trash Auto-Purge</span>
            <v-chip
              v-if="trashStatus"
              :color="trashStatus.isRunning ? 'success' : 'grey'"
              size="x-small"
              variant="flat"
            >
              {{ trashStatus.isRunning ? 'Active' : 'Stopped' }}
            </v-chip>
          </div>

          <div v-if="trashStatus" class="automation-view__metrics">
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Retention</span>
              <span class="automation-view__metric-value">{{ trashStatus.retentionDays }} days</span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Purge Interval</span>
              <span class="automation-view__metric-value">{{ trashStatus.intervalMinutes }}m</span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Last Purge</span>
              <span class="automation-view__metric-value" :title="formatTimestamp(trashStatus.lastPurge)">
                {{ relativeTime(trashStatus.lastPurge) || '—' }}
              </span>
            </div>
            <div v-if="trashStatus.lastPurgeCount != null" class="automation-view__metric">
              <span class="automation-view__metric-label">Last Purge Count</span>
              <span class="automation-view__metric-value">{{ trashStatus.lastPurgeCount }}</span>
            </div>
          </div>

          <div class="automation-view__card-link">Manage Trash <v-icon size="16">mdi-arrow-right</v-icon></div>
        </v-card-text>
      </v-card>

      <!-- ═══ 5. QoS Monitoring ═══ -->
      <v-card class="automation-view__card" @click="navigate('/qos')">
        <v-card-text>
          <div class="automation-view__card-header">
            <v-icon size="28" color="light-blue-lighten-1">mdi-speedometer</v-icon>
            <span class="automation-view__card-title">QoS Monitoring</span>
            <v-chip
              v-if="qosStatus"
              :color="qosStatus.enabled ? (qosStatus.running ? 'success' : 'warning') : 'grey'"
              size="x-small"
              variant="flat"
            >
              {{ qosStatus.enabled ? (qosStatus.running ? 'Running' : 'Paused') : 'Disabled' }}
            </v-chip>
          </div>

          <div v-if="qosStatus" class="automation-view__metrics">
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Poll Interval</span>
              <span class="automation-view__metric-value">{{ qosStatus.pollInterval }}s</span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Poll Count</span>
              <span class="automation-view__metric-value">{{ qosStatus.pollCount }}</span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Errors</span>
              <span class="automation-view__metric-value" :class="{ 'text-error': qosStatus.errorCount > 0 }">
                {{ qosStatus.errorCount }}
              </span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Last Poll</span>
              <span class="automation-view__metric-value" :title="formatTimestamp(qosStatus.lastPoll)">
                {{ relativeTime(qosStatus.lastPoll) || '—' }}
              </span>
            </div>
          </div>

          <div class="automation-view__card-link">View QoS <v-icon size="16">mdi-arrow-right</v-icon></div>
        </v-card-text>
      </v-card>

      <!-- ═══ 6. Guardian / Auditing ═══ -->
      <v-card class="automation-view__card" @click="navigate('/guardian')">
        <v-card-text>
          <div class="automation-view__card-header">
            <v-icon size="28" color="green-lighten-1">mdi-shield-search</v-icon>
            <span class="automation-view__card-title">Auditing &amp; Monitoring</span>
            <v-chip
              v-if="guardianStatus"
              :color="guardianStatus.enabled ? (guardianStatus.running ? 'success' : 'warning') : 'grey'"
              size="x-small"
              variant="flat"
            >
              {{ guardianStatus.enabled ? (guardianStatus.running ? 'Running' : 'Starting') : 'Disabled' }}
            </v-chip>
          </div>

          <div v-if="guardianStatus" class="automation-view__metrics">
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Protocol</span>
              <span class="automation-view__metric-value">{{ guardianStatus.protocol }} :{{ guardianStatus.port }}</span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Events Received</span>
              <span class="automation-view__metric-value">{{ guardianStatus.eventsReceived.toLocaleString() }}</span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Total Stored</span>
              <span class="automation-view__metric-value">{{ guardianStatus.totalStored.toLocaleString() }}</span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Worker Mode</span>
              <span class="automation-view__metric-value">{{ guardianStatus.workerMode }}</span>
            </div>
            <div class="automation-view__metric">
              <span class="automation-view__metric-label">Last Event</span>
              <span class="automation-view__metric-value" :title="formatTimestamp(guardianStatus.lastEvent)">
                {{ relativeTime(guardianStatus.lastEvent) || '—' }}
              </span>
            </div>
          </div>

          <div class="automation-view__card-link">View Auditing <v-icon size="16">mdi-arrow-right</v-icon></div>
        </v-card-text>
      </v-card>

    </div>
  </div>
</template>

<style scoped lang="scss">
.automation-view {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
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
    margin-bottom: 24px;
  }

  &__cards {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__card {
    background-color: #22252d !important;
    border: 1px solid rgba(55, 65, 81, 0.3);
    cursor: pointer;
    transition: border-color 150ms ease, background-color 150ms ease;

    &:hover {
      border-color: rgba(59, 130, 246, 0.4);
      background-color: #262a33 !important;
    }
  }

  &__card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  &__card-title {
    font-size: 16px;
    font-weight: 600;
    color: #e5e7eb;
    flex: 1;
  }

  &__metrics {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px 24px;
    margin-bottom: 12px;

    &--chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  }

  &__metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__metric-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6b7280;
  }

  &__metric-value {
    font-size: 14px;
    font-weight: 500;
    color: #d1d5db;
  }

  &__progress {
    margin-bottom: 12px;
  }

  &__progress-label {
    font-size: 12px;
    color: #9ca3af;
    margin-bottom: 6px;
  }

  &__card-link {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 500;
    color: #3b82f6;
    margin-top: 4px;
  }
}
</style>
