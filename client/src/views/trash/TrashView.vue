<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useTrashStore } from '@/stores/trash.store';
import { useAuthStore } from '@/stores/auth.store';
import PageHeader from '@/components/common/PageHeader.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import type { ITrashEntry } from '@shared/types';

const store = useTrashStore();
const authStore = useAuthStore();

// ── Dialogs ──
const showPurgeAllConfirm = ref(false);
const showPurgeEntryConfirm = ref(false);
const showRestoreConfirm = ref(false);
const showSettingsDialog = ref(false);
const targetEntry = ref<ITrashEntry | null>(null);

// ── Settings form ──
const settingsForm = ref({
  enabled: true,
  retentionDays: 30,
  purgeIntervalMinutes: 60,
});

// ── Table ──
const selectedEntries = ref<number[]>([]);
const search = ref('');

const columns = [
  { key: 'originalName', title: 'Name', sortable: true },
  { key: 'spaceName', title: 'Space', sortable: true, width: '140px' },
  { key: 'entryType', title: 'Type', sortable: true, width: '90px' },
  { key: 'sizeBytes', title: 'Size', sortable: true, width: '100px', align: 'end' as const },
  { key: 'deletedAt', title: 'Deleted', sortable: true, width: '170px' },
  { key: 'expiresAt', title: 'Expires', sortable: true, width: '170px' },
  { key: 'deletedBy', title: 'By', sortable: true, width: '90px' },
  { key: 'actions', title: '', sortable: false, width: '120px', align: 'end' as const },
];

// ── Computed ──
const filteredEntries = computed(() => {
  let items = store.entries;
  if (search.value) {
    const q = search.value.toLowerCase();
    items = items.filter(
      (e) =>
        e.originalName.toLowerCase().includes(q) ||
        e.originalPath.toLowerCase().includes(q) ||
        e.spaceName.toLowerCase().includes(q),
    );
  }
  return items;
});

const spaceOptions = computed(() => {
  if (!store.stats) return [];
  return store.stats.perSpace.map((s) => ({
    title: `${s.spaceName} (${s.itemCount})`,
    value: s.spaceName,
  }));
});

const timeUntilExpiry = computed(() => {
  return (expiresAt: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = expiresAt - now;
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((diff % 3600) / 60);
    return `${hours}h ${mins}m`;
  };
});

// ── Formatters ──
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function expiryColor(expiresAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = expiresAt - now;
  if (diff <= 0) return 'error';
  if (diff < 86400) return 'warning';
  if (diff < 7 * 86400) return 'info';
  return 'default';
}

// ── Actions ──
function openRestore(entry: ITrashEntry): void {
  targetEntry.value = entry;
  showRestoreConfirm.value = true;
}

function openPurgeEntry(entry: ITrashEntry): void {
  targetEntry.value = entry;
  showPurgeEntryConfirm.value = true;
}

async function handleRestore(): Promise<void> {
  if (!targetEntry.value) return;
  await store.restoreEntry(targetEntry.value.id);
  showRestoreConfirm.value = false;
  targetEntry.value = null;
}

async function handlePurgeEntry(): Promise<void> {
  if (!targetEntry.value) return;
  await store.purgeEntry(targetEntry.value.id);
  showPurgeEntryConfirm.value = false;
  targetEntry.value = null;
}

async function handlePurgeAll(): Promise<void> {
  await store.purgeAll(store.filterSpace || undefined);
  showPurgeAllConfirm.value = false;
}

function openSettings(): void {
  if (store.config) {
    settingsForm.value = {
      enabled: store.config.enabled,
      retentionDays: store.config.retentionDays,
      purgeIntervalMinutes: store.config.purgeIntervalMinutes,
    };
  }
  showSettingsDialog.value = true;
}

async function handleSaveSettings(): Promise<void> {
  await store.updateConfig(settingsForm.value);
  showSettingsDialog.value = false;
}

// ── Lifecycle ──
watch(
  () => store.filterSpace,
  (spaceName) => {
    store.fetchEntries(spaceName || undefined);
  },
);

onMounted(async () => {
  await store.refresh();
});
</script>

<template>
  <div class="trash-view">
    <PageHeader
      title="Trash"
      subtitle="Recover deleted files or permanently purge them"
      icon="mdi-delete"
    />

    <!-- Error banner -->
    <v-alert v-if="store.error" type="error" variant="tonal" closable class="mx-4 mb-4" @click:close="store.error = null">
      {{ store.error }}
    </v-alert>

    <!-- Stats cards -->
    <div class="trash-view__stats mx-4 mb-4">
      <v-row dense>
        <v-col cols="12" sm="6" md="3">
          <v-card variant="tonal" color="primary" class="trash-view__stat-card">
            <v-card-text class="d-flex align-center justify-space-between">
              <div>
                <div class="text-h5 font-weight-bold">{{ store.totalItems }}</div>
                <div class="text-caption text-medium-emphasis">Items in Trash</div>
              </div>
              <v-icon size="40" color="primary" class="opacity-40">mdi-delete-outline</v-icon>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" sm="6" md="3">
          <v-card variant="tonal" color="info" class="trash-view__stat-card">
            <v-card-text class="d-flex align-center justify-space-between">
              <div>
                <div class="text-h5 font-weight-bold">{{ formatBytes(store.totalSizeBytes) }}</div>
                <div class="text-caption text-medium-emphasis">Total Size</div>
              </div>
              <v-icon size="40" color="info" class="opacity-40">mdi-database</v-icon>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" sm="6" md="3">
          <v-card variant="tonal" color="warning" class="trash-view__stat-card">
            <v-card-text class="d-flex align-center justify-space-between">
              <div>
                <div class="text-h5 font-weight-bold">{{ store.stats?.expiringWithin24h ?? 0 }}</div>
                <div class="text-caption text-medium-emphasis">Expiring in 24h</div>
              </div>
              <v-icon size="40" color="warning" class="opacity-40">mdi-clock-alert-outline</v-icon>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" sm="6" md="3">
          <v-card variant="tonal" :color="store.trashEnabled ? 'success' : 'error'" class="trash-view__stat-card">
            <v-card-text class="d-flex align-center justify-space-between">
              <div>
                <div class="text-h5 font-weight-bold">{{ store.trashEnabled ? 'ON' : 'OFF' }}</div>
                <div class="text-caption text-medium-emphasis">
                  Trash {{ store.trashEnabled ? 'Enabled' : 'Disabled' }}
                </div>
              </div>
              <v-icon size="40" :color="store.trashEnabled ? 'success' : 'error'" class="opacity-40">
                {{ store.trashEnabled ? 'mdi-shield-check' : 'mdi-shield-off' }}
              </v-icon>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <!-- Scheduler info bar -->
    <div v-if="store.scheduler" class="mx-4 mb-4">
      <v-alert variant="tonal" density="compact" color="secondary" class="trash-view__scheduler">
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <div class="d-flex align-center ga-3">
            <v-icon size="18">mdi-timer-cog-outline</v-icon>
            <span class="text-body-2">
              Auto-purge: <strong>{{ store.scheduler.retentionDays }}d</strong> retention,
              checks every <strong>{{ store.scheduler.purgeIntervalMinutes }}m</strong>
            </span>
            <v-chip v-if="store.scheduler.lastPurgeCount !== undefined" size="x-small" variant="tonal" label>
              Last purge: {{ store.scheduler.lastPurgeCount }} items
            </v-chip>
          </div>
          <v-btn v-if="authStore.isAdmin" size="small" variant="text" prepend-icon="mdi-cog" @click="openSettings">
            Settings
          </v-btn>
        </div>
      </v-alert>
    </div>

    <!-- Per-space breakdown -->
    <div v-if="store.stats && store.stats.perSpace.length > 0" class="mx-4 mb-4">
      <div class="d-flex flex-wrap ga-2">
        <v-chip
          v-for="sp in store.stats.perSpace"
          :key="sp.spaceName"
          :variant="store.filterSpace === sp.spaceName ? 'elevated' : 'tonal'"
          :color="store.filterSpace === sp.spaceName ? 'primary' : 'default'"
          label
          size="small"
          @click="store.filterSpace = store.filterSpace === sp.spaceName ? '' : sp.spaceName"
        >
          <v-icon start size="16">mdi-folder</v-icon>
          {{ sp.spaceName }}
          <span class="ml-1 text-medium-emphasis">({{ sp.itemCount }} · {{ formatBytes(sp.sizeBytes) }})</span>
        </v-chip>
        <v-chip
          v-if="store.filterSpace"
          variant="text"
          size="small"
          @click="store.filterSpace = ''"
        >
          <v-icon start size="16">mdi-close</v-icon>
          Clear filter
        </v-chip>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="trash-view__toolbar mx-4 mb-2">
      <div class="d-flex align-center ga-2">
        <v-text-field
          v-model="search"
          density="compact"
          variant="outlined"
          placeholder="Search trash..."
          prepend-inner-icon="mdi-magnify"
          hide-details
          single-line
          clearable
          class="trash-view__search"
        />
        <v-spacer />
        <v-btn
          v-if="authStore.isAdmin || (store.filterSpace && authStore.canManageSpace(store.filterSpace))"
          size="small"
          variant="tonal"
          color="error"
          prepend-icon="mdi-delete-forever"
          :disabled="store.entries.length === 0 || store.isPurging"
          :loading="store.isPurging"
          @click="showPurgeAllConfirm = true"
        >
          {{ store.filterSpace ? `Empty ${store.filterSpace}` : 'Empty All' }}
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          icon="mdi-refresh"
          :loading="store.isLoading"
          @click="store.refresh()"
        />
      </div>
    </div>

    <!-- Trash entries table -->
    <div class="mx-4">
      <v-data-table
        :headers="columns"
        :items="filteredEntries"
        :loading="store.isLoading"
        density="compact"
        hover
        items-per-page="50"
        class="trash-view__table"
        :no-data-text="store.filterSpace ? `No trash items for ${store.filterSpace}` : 'Trash is empty'"
      >
        <!-- Name column -->
        <template #item.originalName="{ item }">
          <div class="d-flex align-center ga-2">
            <v-icon size="18" :color="(item as any).entryType === 'directory' ? 'primary' : 'grey'">
              {{ (item as any).entryType === 'directory' ? 'mdi-folder' : 'mdi-file' }}
            </v-icon>
            <div class="trash-view__name-cell">
              <span class="trash-view__name" :title="(item as any).originalPath">
                {{ (item as any).originalName }}
              </span>
              <span class="text-caption text-medium-emphasis d-block" style="font-size: 11px;">
                {{ (item as any).originalPath }}
              </span>
            </div>
          </div>
        </template>

        <!-- Type column -->
        <template #item.entryType="{ item }">
          <v-chip size="x-small" variant="tonal" :color="(item as any).entryType === 'directory' ? 'primary' : 'default'" label>
            {{ (item as any).entryType === 'directory' ? 'Folder' : 'File' }}
          </v-chip>
        </template>

        <!-- Size column -->
        <template #item.sizeBytes="{ item }">
          <span class="text-medium-emphasis">{{ formatBytes((item as any).sizeBytes) }}</span>
        </template>

        <!-- Deleted column -->
        <template #item.deletedAt="{ item }">
          <span class="text-medium-emphasis">{{ formatDate((item as any).deletedAt) }}</span>
        </template>

        <!-- Expires column -->
        <template #item.expiresAt="{ item }">
          <v-chip
            size="x-small"
            variant="tonal"
            :color="expiryColor((item as any).expiresAt)"
            label
          >
            {{ timeUntilExpiry((item as any).expiresAt) }}
          </v-chip>
        </template>

        <!-- Actions column -->
        <template #item.actions="{ item }">
          <div class="d-flex ga-1 justify-end">
            <v-btn
              size="x-small"
              variant="tonal"
              color="success"
              icon="mdi-restore"
              :loading="store.isRestoring"
              @click.stop="openRestore(item as any)"
            />
            <v-btn
              v-if="authStore.isAdmin || authStore.canManageSpace((item as any).spaceName)"
              size="x-small"
              variant="tonal"
              color="error"
              icon="mdi-delete-forever"
              :loading="store.isPurging"
              @click.stop="openPurgeEntry(item as any)"
            />
          </div>
        </template>
      </v-data-table>
    </div>

    <!-- Restore Confirm Dialog -->
    <ConfirmDialog
      v-model="showRestoreConfirm"
      title="Restore Item"
      :message="`Restore '${targetEntry?.originalName}' to its original location?\n\nSpace: ${targetEntry?.spaceName}\nPath: ${targetEntry?.originalPath}`"
      confirm-text="Restore"
      confirm-color="success"
      @confirm="handleRestore"
    />

    <!-- Purge Entry Confirm Dialog -->
    <ConfirmDialog
      v-model="showPurgeEntryConfirm"
      title="Permanently Delete"
      :message="`Permanently delete '${targetEntry?.originalName}'? This cannot be undone.`"
      confirm-text="Delete Forever"
      confirm-color="error"
      @confirm="handlePurgeEntry"
    />

    <!-- Purge All Confirm Dialog -->
    <ConfirmDialog
      v-model="showPurgeAllConfirm"
      title="Empty Trash"
      :message="store.filterSpace
        ? `Permanently delete all ${store.entries.length} item(s) from ${store.filterSpace}? This cannot be undone.`
        : `Permanently delete all ${store.totalItems} item(s) in trash? This cannot be undone.`"
      confirm-text="Empty Trash"
      confirm-color="error"
      @confirm="handlePurgeAll"
    />

    <!-- Settings Dialog -->
    <v-dialog v-model="showSettingsDialog" max-width="480">
      <v-card>
        <v-card-title>
          <v-icon class="mr-2">mdi-cog</v-icon>
          Trash Settings
        </v-card-title>

        <v-card-text>
          <v-switch
            v-model="settingsForm.enabled"
            label="Enable trash (snapshot before delete)"
            color="primary"
            density="compact"
            hide-details
            class="mb-4"
          />

          <v-text-field
            v-model.number="settingsForm.retentionDays"
            label="Retention period (days)"
            type="number"
            variant="outlined"
            density="compact"
            min="1"
            max="365"
            hint="Items older than this are auto-purged"
            persistent-hint
            class="mb-3"
          />

          <v-text-field
            v-model.number="settingsForm.purgeIntervalMinutes"
            label="Purge check interval (minutes)"
            type="number"
            variant="outlined"
            density="compact"
            min="1"
            max="1440"
            hint="How often the scheduler checks for expired items"
            persistent-hint
          />

          <v-alert variant="tonal" density="compact" color="info" class="mt-4">
            <v-icon start size="16">mdi-information</v-icon>
            When trash is enabled, deleted files are snapshotted using EFS lazy copy (zero additional
            storage) before being removed. They can be recovered within the retention period.
          </v-alert>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn @click="showSettingsDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="handleSaveSettings">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped lang="scss">
.trash-view {
  &__stat-card {
    .v-card-text {
      padding: 16px;
    }
  }

  &__scheduler {
    .v-alert__content {
      width: 100%;
    }
  }

  &__search {
    max-width: 320px;
  }

  &__table {
    background: transparent;

    :deep(.v-data-table__td) {
      font-size: 13px;
      padding-top: 6px;
      padding-bottom: 6px;
    }
  }

  &__name-cell {
    min-width: 0;
    overflow: hidden;
  }

  &__name {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
  }
}

.opacity-40 {
  opacity: 0.4;
}
</style>
