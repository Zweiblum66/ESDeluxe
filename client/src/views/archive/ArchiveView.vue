<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useArchiveStore } from '@/stores/archive.store';
import PageHeader from '@/components/common/PageHeader.vue';
import ArchiveLocationsPanel from './components/ArchiveLocationsPanel.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import { useResponsive } from '@/composables/useResponsive';
import type { IArchiveCatalogEntry, ArchiveCatalogStatus } from '@shared/types';

const store = useArchiveStore();
const responsive = useResponsive();

const activeTab = ref('overview');

// --- Catalog filters ---
const catalogSearch = ref('');
const catalogLocationFilter = ref<number | null>(null);
const catalogStatusFilter = ref<ArchiveCatalogStatus | ''>('');
const catalogPage = ref(1);
const catalogPageSize = 25;

// --- Delete ---
const showDeleteConfirm = ref(false);
const deleteTarget = ref<IArchiveCatalogEntry | null>(null);
const isRestoring = ref<number | null>(null);

// --- Formatting ---
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusColor(status: string): string {
  switch (status) {
    case 'archived': return 'deep-purple';
    case 'archiving': return 'info';
    case 'restoring': return 'warning';
    case 'restored': return 'success';
    case 'failed': return 'error';
    case 'deleted': return 'grey';
    default: return 'grey';
  }
}

function fileName(path: string): string {
  return path.split('/').pop() || path;
}

// --- Catalog table ---
const catalogHeaders = computed(() => {
  const headers = [
    { title: 'File', key: 'originalPath', sortable: true },
    { title: 'Space', key: 'originalSpace', sortable: true, width: '120px' },
    { title: 'Size', key: 'originalSize', sortable: true, width: '100px' },
    { title: 'Location', key: 'archiveLocationName', sortable: true, width: '140px' },
    { title: 'Date', key: 'archivedAt', sortable: true, width: '150px' },
    { title: 'Status', key: 'status', sortable: true, width: '110px' },
    { title: '', key: 'actions', sortable: false, width: '100px' },
  ];
  if (responsive.isPhone.value) {
    // Only show file, status, actions on phone
    return headers.filter(h => ['originalPath', 'status', 'actions'].includes(h.key));
  }
  if (responsive.isMobile.value) {
    return headers.filter(h => h.key !== 'archiveLocationName');
  }
  return headers;
});

const catalogEntries = computed(() => store.catalogResult?.entries || []);
const catalogTotal = computed(() => store.catalogResult?.total || 0);
const catalogPageCount = computed(() => Math.ceil(catalogTotal.value / catalogPageSize));

// --- Stats computed ---
const totalFilesFormatted = computed(() => (store.stats?.totalFiles || 0).toLocaleString());
const totalSizeFormatted = computed(() => formatSize(store.stats?.totalSize || 0));

// --- Load catalog with filters ---
async function loadCatalog(): Promise<void> {
  await store.fetchCatalog({
    search: catalogSearch.value || undefined,
    locationId: catalogLocationFilter.value || undefined,
    status: (catalogStatusFilter.value as ArchiveCatalogStatus) || undefined,
    limit: catalogPageSize,
    offset: (catalogPage.value - 1) * catalogPageSize,
  });
}

// Watch filters for auto-reload
watch([catalogSearch, catalogLocationFilter, catalogStatusFilter], () => {
  catalogPage.value = 1;
  loadCatalog();
});

watch(catalogPage, () => loadCatalog());

// --- Actions ---
async function handleRestore(entry: IArchiveCatalogEntry): Promise<void> {
  isRestoring.value = entry.id;
  const ok = await store.restoreFile(entry.id);
  isRestoring.value = null;
  if (ok) {
    await loadCatalog();
    await store.fetchStats();
  }
}

function confirmDelete(entry: IArchiveCatalogEntry): void {
  deleteTarget.value = entry;
  showDeleteConfirm.value = true;
}

async function handleDelete(): Promise<void> {
  if (!deleteTarget.value) return;
  const ok = await store.deleteCatalogEntry(deleteTarget.value.id);
  showDeleteConfirm.value = false;
  if (ok) {
    await loadCatalog();
    await store.fetchStats();
  }
}

// --- Init ---
onMounted(async () => {
  await Promise.all([
    store.fetchLocations(),
    store.fetchStats(),
  ]);
  await loadCatalog();
});
</script>

<template>
  <div>
    <PageHeader title="Archive Management" icon="mdi-archive">
      <template #subtitle>
        Manage archive locations and browse archived files
      </template>
    </PageHeader>

    <v-tabs v-model="activeTab" class="mb-4" color="deep-purple" density="comfortable">
      <v-tab value="overview">
        <v-icon start size="18">mdi-chart-box</v-icon>
        Overview
      </v-tab>
      <v-tab value="catalog">
        <v-icon start size="18">mdi-book-search</v-icon>
        Catalog
      </v-tab>
      <v-tab value="locations">
        <v-icon start size="18">mdi-harddisk</v-icon>
        Locations
      </v-tab>
    </v-tabs>

    <!-- ═══════ Overview Tab ═══════ -->
    <div v-if="activeTab === 'overview'">
      <!-- Stats cards -->
      <v-row class="mb-4">
        <v-col cols="6" md="3">
          <v-card class="bg-grey-darken-4 pa-4" variant="outlined">
            <div class="text-caption text-grey mb-1">Total Archived Files</div>
            <div class="text-h5 font-weight-bold">{{ totalFilesFormatted }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card class="bg-grey-darken-4 pa-4" variant="outlined">
            <div class="text-caption text-grey mb-1">Total Archive Size</div>
            <div class="text-h5 font-weight-bold">{{ totalSizeFormatted }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card class="bg-grey-darken-4 pa-4" variant="outlined">
            <div class="text-caption text-grey mb-1">Locations</div>
            <div class="text-h5 font-weight-bold">{{ store.locations.length }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" md="3">
          <v-card class="bg-grey-darken-4 pa-4" variant="outlined">
            <div class="text-caption text-grey mb-1">Active Locations</div>
            <div class="text-h5 font-weight-bold">
              {{ store.locations.filter(l => l.enabled).length }}
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Per-location breakdown -->
      <div v-if="store.stats?.locationBreakdown?.length" class="mb-4">
        <div class="text-subtitle-1 font-weight-medium mb-3">Location Breakdown</div>
        <v-row>
          <v-col
            v-for="loc in store.stats.locationBreakdown"
            :key="loc.locationId"
            cols="12"
            sm="6"
            lg="4"
          >
            <v-card class="bg-grey-darken-4 pa-3" variant="outlined">
              <div class="d-flex align-center mb-2">
                <v-icon size="18" color="deep-purple" class="mr-2">mdi-harddisk</v-icon>
                <span class="font-weight-medium">{{ loc.locationName }}</span>
                <v-spacer />
                <v-chip
                  :color="loc.enabled ? 'success' : 'grey'"
                  size="x-small"
                  variant="tonal"
                >
                  {{ loc.enabled ? 'Active' : 'Off' }}
                </v-chip>
              </div>
              <div class="d-flex gap-4 text-body-2">
                <div>{{ loc.fileCount.toLocaleString() }} files</div>
                <div>{{ formatSize(loc.totalSize) }}</div>
              </div>
            </v-card>
          </v-col>
        </v-row>
      </div>

      <!-- Recent activity -->
      <div v-if="store.stats?.recentActivity?.length">
        <div class="text-subtitle-1 font-weight-medium mb-3">Recent Activity</div>
        <v-card class="bg-grey-darken-4" variant="outlined">
          <v-table density="compact" class="bg-transparent">
            <thead>
              <tr>
                <th>File</th>
                <th>Space</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in store.stats.recentActivity.slice(0, 10)" :key="entry.id">
                <td class="text-truncate" style="max-width: 300px;">{{ fileName(entry.originalPath) }}</td>
                <td>{{ entry.originalSpace }}</td>
                <td>
                  <v-chip :color="statusColor(entry.status)" size="x-small" variant="tonal">
                    {{ entry.status }}
                  </v-chip>
                </td>
                <td class="text-caption">{{ formatDate(entry.archivedAt) }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </div>
    </div>

    <!-- ═══════ Catalog Tab ═══════ -->
    <div v-if="activeTab === 'catalog'">
      <!-- Filters -->
      <v-card class="bg-grey-darken-4 pa-3 mb-4" variant="outlined">
        <v-row dense align="center">
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="catalogSearch"
              prepend-inner-icon="mdi-magnify"
              label="Search files..."
              variant="outlined"
              density="compact"
              hide-details
              clearable
            />
          </v-col>
          <v-col cols="6" sm="3">
            <v-select
              v-model="catalogLocationFilter"
              :items="[{ title: 'All Locations', value: null }, ...store.locations.map(l => ({ title: l.name, value: l.id }))]"
              variant="outlined"
              density="compact"
              hide-details
              label="Location"
            />
          </v-col>
          <v-col cols="6" sm="3">
            <v-select
              v-model="catalogStatusFilter"
              :items="[
                { title: 'All Statuses', value: '' },
                { title: 'Archived', value: 'archived' },
                { title: 'Archiving', value: 'archiving' },
                { title: 'Restored', value: 'restored' },
                { title: 'Failed', value: 'failed' },
              ]"
              variant="outlined"
              density="compact"
              hide-details
              label="Status"
            />
          </v-col>
          <v-col cols="12" sm="2" class="text-right">
            <span class="text-caption text-grey">{{ catalogTotal }} entries</span>
          </v-col>
        </v-row>
      </v-card>

      <!-- Catalog table -->
      <v-card class="bg-grey-darken-4" variant="outlined">
        <v-data-table
          :headers="catalogHeaders"
          :items="catalogEntries"
          :loading="store.isCatalogLoading"
          density="compact"
          class="bg-transparent"
          :items-per-page="catalogPageSize"
          hide-default-footer
        >
          <template #item.originalPath="{ item }">
            <div class="text-truncate" style="max-width: 280px;" :title="item.originalPath">
              <v-icon size="16" class="mr-1" color="grey">mdi-file</v-icon>
              {{ fileName(item.originalPath) }}
            </div>
          </template>

          <template #item.originalSize="{ item }">
            {{ formatSize(item.originalSize) }}
          </template>

          <template #item.archivedAt="{ item }">
            <span class="text-caption">{{ formatDate(item.archivedAt) }}</span>
          </template>

          <template #item.status="{ item }">
            <v-chip :color="statusColor(item.status)" size="x-small" variant="tonal">
              {{ item.status }}
            </v-chip>
          </template>

          <template #item.actions="{ item }">
            <div class="d-flex gap-1">
              <v-btn
                v-if="item.status === 'archived'"
                icon="mdi-restore"
                size="x-small"
                variant="text"
                color="success"
                title="Restore"
                :loading="isRestoring === item.id"
                @click="handleRestore(item)"
              />
              <v-btn
                icon="mdi-delete"
                size="x-small"
                variant="text"
                color="error"
                title="Delete from archive"
                @click="confirmDelete(item)"
              />
            </div>
          </template>

          <template #bottom>
            <div v-if="catalogPageCount > 1" class="d-flex justify-center pa-2">
              <v-pagination
                v-model="catalogPage"
                :length="catalogPageCount"
                :total-visible="5"
                density="compact"
                size="small"
              />
            </div>
          </template>
        </v-data-table>
      </v-card>
    </div>

    <!-- ═══════ Locations Tab ═══════ -->
    <div v-if="activeTab === 'locations'">
      <ArchiveLocationsPanel />
    </div>

    <!-- Delete confirm -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Delete Archive Entry"
      :message="`Delete '${deleteTarget ? fileName(deleteTarget.originalPath) : ''}' from the archive? The archived copy will be removed.`"
      confirm-text="Delete"
      confirm-color="error"
      @confirm="handleDelete"
    />
  </div>
</template>

<style scoped lang="scss">
.gap-4 {
  gap: 16px;
}
.gap-1 {
  gap: 4px;
}
</style>
