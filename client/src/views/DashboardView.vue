<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useApi } from '@/composables/useApi';
import type { IHealthStatus } from '@shared/types';

const { data: health, isLoading, error, execute } = useApi<IHealthStatus>('/api/v1/system/health');

const lastChecked = ref<string>('');

async function checkHealth(): Promise<void> {
  await execute();
  lastChecked.value = new Date().toLocaleTimeString();
}

onMounted(() => {
  checkHealth();
});

function statusColor(ok: boolean): string {
  return ok ? 'success' : 'error';
}

function statusIcon(ok: boolean): string {
  return ok ? 'mdi-check-circle' : 'mdi-alert-circle';
}

function statusLabel(ok: boolean): string {
  return ok ? 'Connected' : 'Disconnected';
}
</script>

<template>
  <div class="dashboard-view">
    <div class="dashboard-view__header">
      <h2 class="dashboard-view__title">System Status</h2>
      <v-btn
        variant="outlined"
        size="small"
        color="primary"
        prepend-icon="mdi-refresh"
        :loading="isLoading"
        @click="checkHealth"
      >
        Refresh
      </v-btn>
    </div>

    <p v-if="lastChecked" class="dashboard-view__last-checked">
      Last checked: {{ lastChecked }}
    </p>

    <!-- Error state -->
    <v-alert
      v-if="error"
      type="warning"
      variant="tonal"
      class="mb-4"
    >
      Unable to reach the backend API. Make sure the server is running.
    </v-alert>

    <!-- Status cards -->
    <div class="dashboard-view__grid">
      <!-- Overall status -->
      <v-card class="dashboard-view__card">
        <v-card-text class="d-flex align-center gap-3">
          <v-icon
            :color="health?.status === 'ok' ? 'success' : health?.status === 'degraded' ? 'warning' : 'error'"
            size="40"
          >
            {{ health?.status === 'ok' ? 'mdi-check-circle' : 'mdi-alert-circle' }}
          </v-icon>
          <div>
            <div class="text-caption text-medium-emphasis">Overall Status</div>
            <div class="text-h6">{{ health?.status?.toUpperCase() || 'UNKNOWN' }}</div>
          </div>
        </v-card-text>
      </v-card>

      <!-- EditShare API -->
      <v-card class="dashboard-view__card">
        <v-card-text class="d-flex align-center gap-3">
          <v-icon :color="statusColor(health?.esApiConnected ?? false)" size="40">
            {{ statusIcon(health?.esApiConnected ?? false) }}
          </v-icon>
          <div>
            <div class="text-caption text-medium-emphasis">EditShare API</div>
            <div class="text-h6">{{ statusLabel(health?.esApiConnected ?? false) }}</div>
          </div>
        </v-card-text>
      </v-card>

      <!-- LDAP -->
      <v-card class="dashboard-view__card">
        <v-card-text class="d-flex align-center gap-3">
          <v-icon :color="statusColor(health?.ldapConnected ?? false)" size="40">
            {{ statusIcon(health?.ldapConnected ?? false) }}
          </v-icon>
          <div>
            <div class="text-caption text-medium-emphasis">LDAP / Active Directory</div>
            <div class="text-h6">{{ statusLabel(health?.ldapConnected ?? false) }}</div>
          </div>
        </v-card-text>
      </v-card>

      <!-- EFS Mount -->
      <v-card class="dashboard-view__card">
        <v-card-text class="d-flex align-center gap-3">
          <v-icon :color="statusColor(health?.efsMounted ?? false)" size="40">
            {{ statusIcon(health?.efsMounted ?? false) }}
          </v-icon>
          <div>
            <div class="text-caption text-medium-emphasis">EFS Mount</div>
            <div class="text-h6">{{ statusLabel(health?.efsMounted ?? false) }}</div>
          </div>
        </v-card-text>
      </v-card>

      <!-- Version -->
      <v-card class="dashboard-view__card">
        <v-card-text class="d-flex align-center gap-3">
          <v-icon color="info" size="40">mdi-information</v-icon>
          <div>
            <div class="text-caption text-medium-emphasis">Version</div>
            <div class="text-h6">{{ health?.version || 'N/A' }}</div>
          </div>
        </v-card-text>
      </v-card>

      <!-- Uptime -->
      <v-card class="dashboard-view__card">
        <v-card-text class="d-flex align-center gap-3">
          <v-icon color="info" size="40">mdi-clock-outline</v-icon>
          <div>
            <div class="text-caption text-medium-emphasis">Uptime</div>
            <div class="text-h6">
              {{ health?.uptime ? Math.floor(health.uptime / 3600) + 'h ' + Math.floor((health.uptime % 3600) / 60) + 'm' : 'N/A' }}
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dashboard-view {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  &__title {
    font-size: 22px;
    font-weight: 600;
    color: #e5e7eb;
    margin: 0;
  }

  &__last-checked {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 24px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;

    @include phone {
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }

  &__card {
    background-color: #22252d !important;
    border: 1px solid rgba(55, 65, 81, 0.3);
  }
}
</style>
