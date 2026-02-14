<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useAssetCatalogStore } from '@/stores/asset-catalog.store';
import { useSpacesStore } from '@/stores/spaces.store';
import { useNotification } from '@/composables/useNotification';
import AssetDetailPanel from './components/AssetDetailPanel.vue';
import AssetSpaceTree from './components/AssetSpaceTree.vue';
import type { IAsset, AssetType, AssetArchiveStatus } from '@shared/types';

const catalogStore = useAssetCatalogStore();
const spacesStore = useSpacesStore();
const { success: showSuccess, error: showError } = useNotification();

const authToken = computed(() => localStorage.getItem('es_token') || '');

// ── Tab state ─────────────────────────────────
const activeTab = ref('browse');

// ── Browse filters ────────────────────────────
const searchTerm = ref('');
const spaceFilter = ref<string | null>(null);
const directoryPathFilter = ref<string | null>(null);
const typeFilter = ref<AssetType | ''>('');
const archiveStatusFilter = ref<AssetArchiveStatus | ''>('');
const page = ref(1);
const pageSize = 25;
const sidebarOpen = ref(true);

// Asset count map for tree badges
const spaceAssetCounts = computed(() => {
  const map = new Map<string, number>();
  catalogStore.stats?.bySpace.forEach((s) => map.set(s.spaceName, s.assetCount));
  return map;
});

// Breadcrumb label for current tree selection
const currentFilterLabel = computed(() => {
  if (!spaceFilter.value) return null;
  return directoryPathFilter.value
    ? `${spaceFilter.value} / ${directoryPathFilter.value}`
    : spaceFilter.value;
});

function handleTreeSelect(spaceName: string | null, directoryPath: string | null): void {
  spaceFilter.value = spaceName;
  directoryPathFilter.value = directoryPath;
  page.value = 1;
}

// ── Detail panel ──────────────────────────────
const selectedAsset = ref<IAsset | null>(null);
const showDetail = ref(false);

// ── Scan state ────────────────────────────────
const scanSpace = ref<string | null>(null);

// ── Formatting ────────────────────────────────
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

function assetTypeIcon(type: AssetType): string {
  switch (type) {
    case 'video': return 'mdi-movie';
    case 'audio': return 'mdi-music';
    case 'image': return 'mdi-image';
    case 'avid_mxf': return 'mdi-filmstrip';
    case 'sequence': return 'mdi-image-multiple';
    default: return 'mdi-file';
  }
}

function assetTypeColor(type: AssetType): string {
  switch (type) {
    case 'video': return 'blue';
    case 'audio': return 'green';
    case 'image': return 'orange';
    case 'avid_mxf': return 'purple';
    case 'sequence': return 'teal';
    default: return 'grey';
  }
}

function archiveStatusColor(status?: string): string {
  switch (status) {
    case 'archived': return 'deep-purple';
    case 'partial': return 'warning';
    case 'online': return 'success';
    default: return 'success';
  }
}

function scanStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'success';
    case 'running': return 'info';
    case 'failed': return 'error';
    case 'cancelled': return 'warning';
    default: return 'grey';
  }
}

// ── Browse table headers ──────────────────────
const browseHeaders = [
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Type', key: 'assetType', sortable: true, width: '100px' },
  { title: 'Files', key: 'fileCount', sortable: true, width: '80px' },
  { title: 'Size', key: 'totalSize', sortable: true, width: '100px' },
  { title: 'Directory', key: 'directoryPath', sortable: true },
  { title: 'Archive', key: 'archiveStatus', sortable: true, width: '110px' },
  { title: 'Last Scanned', key: 'lastScannedAt', sortable: true, width: '150px' },
];

// ── Data loading ──────────────────────────────
async function loadAssets() {
  await catalogStore.fetchAssets({
    spaceName: spaceFilter.value || undefined,
    directoryPath: directoryPathFilter.value || undefined,
    assetType: typeFilter.value || undefined,
    archiveStatus: archiveStatusFilter.value || undefined,
    searchTerm: searchTerm.value || undefined,
    limit: pageSize,
    offset: (page.value - 1) * pageSize,
  });
}

onMounted(async () => {
  if (spacesStore.spaces.length === 0) {
    spacesStore.fetchSpaces();
  }
  await Promise.all([
    loadAssets(),
    catalogStore.fetchStats(),
    catalogStore.fetchScanLogs(),
    catalogStore.fetchScanStatus(),
    catalogStore.fetchScanConfigs(),
  ]);
});

// Reload when filters change
watch([spaceFilter, directoryPathFilter, typeFilter, archiveStatusFilter, page], () => loadAssets());

// Debounced search
let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchTerm, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    loadAssets();
  }, 300);
});

// ── Actions ───────────────────────────────────
function handleRowClick(_event: Event, row: { item: IAsset }) {
  openAssetDetail(row.item);
}

async function openAssetDetail(asset: IAsset) {
  selectedAsset.value = null;
  showDetail.value = true;
  const loaded = await catalogStore.fetchAsset(asset.id);
  if (loaded) {
    selectedAsset.value = loaded;
  }
}

async function handleScan() {
  if (!scanSpace.value) return;
  const ok = await catalogStore.triggerScan(scanSpace.value);
  if (ok) {
    showSuccess(`Scan started for ${scanSpace.value}`);
    // Refresh logs after a short delay
    setTimeout(() => {
      catalogStore.fetchScanLogs();
      catalogStore.fetchScanStatus();
    }, 2000);
  } else {
    showError(catalogStore.error || 'Failed to start scan');
  }
}

async function handleDeleteAsset(asset: IAsset) {
  const ok = await catalogStore.deleteAsset(asset.id);
  if (ok) {
    showSuccess('Asset removed from catalog');
    showDetail.value = false;
  } else {
    showError(catalogStore.error || 'Failed to delete asset');
  }
}

// Pagination
const totalPages = computed(() => Math.ceil(catalogStore.totalAssets / pageSize));

const spaceItems = computed(() =>
  spacesStore.spaces.map((s) => ({ title: s.name, value: s.name })),
);

const assetTypeItems = [
  { title: 'All Types', value: '' },
  { title: 'Video', value: 'video' },
  { title: 'Audio', value: 'audio' },
  { title: 'Image', value: 'image' },
  { title: 'Avid/MXF', value: 'avid_mxf' },
  { title: 'Sequence', value: 'sequence' },
  { title: 'Generic', value: 'generic' },
];

const archiveStatusItems = [
  { title: 'All Statuses', value: '' },
  { title: 'Online', value: 'online' },
  { title: 'Partially Archived', value: 'partial' },
  { title: 'Fully Archived', value: 'archived' },
];

async function handleAssetRestored() {
  // Refresh the asset detail and the list
  if (selectedAsset.value) {
    const loaded = await catalogStore.fetchAsset(selectedAsset.value.id);
    if (loaded) selectedAsset.value = loaded;
  }
  await loadAssets();
}
</script>

<template>
  <div class="catalog-view">
    <div class="catalog-view__header">
      <div>
        <h2 class="catalog-view__title">Asset Catalog</h2>
        <p class="catalog-view__subtitle">Browse and manage media assets across spaces</p>
      </div>
    </div>

    <!-- Loading -->
    <v-progress-linear v-if="catalogStore.isLoading" indeterminate color="primary" class="mb-4" />

    <!-- Tabs -->
    <v-tabs v-model="activeTab" class="mb-4">
      <v-tab value="browse">Browse</v-tab>
      <v-tab value="overview">Overview</v-tab>
      <v-tab value="scanning">Scanning</v-tab>
    </v-tabs>

    <!-- ═══ Browse Tab ═══ -->
    <div v-if="activeTab === 'browse'" class="catalog-view__browse-content">
      <!-- Sidebar tree -->
      <AssetSpaceTree
        v-if="sidebarOpen"
        :spaces="spacesStore.spaces"
        :selected-space="spaceFilter"
        :selected-path="directoryPathFilter"
        :space-asset-counts="spaceAssetCounts"
        @select="handleTreeSelect"
      />

      <!-- Main content -->
      <div class="catalog-view__main">
        <!-- Filters -->
        <div class="catalog-view__filters">
          <div class="catalog-view__filter-row">
            <v-btn
              icon
              variant="text"
              size="small"
              :color="sidebarOpen ? 'primary' : undefined"
              @click="sidebarOpen = !sidebarOpen"
            >
              <v-icon>mdi-file-tree</v-icon>
            </v-btn>
            <v-text-field
              v-model="searchTerm"
              prepend-inner-icon="mdi-magnify"
              label="Search assets..."
              variant="outlined"
              density="compact"
              hide-details
              clearable
              class="catalog-view__search"
            />
            <v-select
              v-model="typeFilter"
              :items="assetTypeItems"
              label="Type"
              variant="outlined"
              density="compact"
              hide-details
              class="catalog-view__filter-select"
            />
            <v-select
              v-model="archiveStatusFilter"
              :items="archiveStatusItems"
              label="Archive"
              variant="outlined"
              density="compact"
              hide-details
              class="catalog-view__filter-select"
            />
          </div>
        </div>

        <!-- Selection breadcrumb -->
        <div v-if="currentFilterLabel" class="catalog-view__selection-chip">
          <v-icon size="16" class="mr-1">mdi-folder-outline</v-icon>
          <span>{{ currentFilterLabel }}</span>
          <v-btn
            icon
            variant="text"
            size="x-small"
            @click="handleTreeSelect(null, null)"
          >
            <v-icon size="14">mdi-close</v-icon>
          </v-btn>
        </div>

        <!-- Assets Table -->
        <v-data-table
          :headers="browseHeaders"
          :items="catalogStore.assets"
          :items-per-page="pageSize"
          :loading="catalogStore.isLoading"
          density="comfortable"
          hover
          hide-default-footer
          @click:row="handleRowClick"
        >
          <template #item.name="{ item }">
            <div class="d-flex align-center ga-2">
              <img
                v-if="item.thumbnailPath"
                :src="`/api/v1/catalog/assets/${item.id}/thumbnail?token=${authToken}`"
                class="catalog-view__thumbnail"
              />
              <v-icon v-else :icon="assetTypeIcon(item.assetType)" :color="assetTypeColor(item.assetType)" size="small" />
              <span class="font-weight-medium">{{ item.name }}</span>
            </div>
          </template>

          <template #item.assetType="{ item }">
            <v-chip size="x-small" :color="assetTypeColor(item.assetType)" variant="tonal">
              {{ item.assetType }}
            </v-chip>
          </template>

          <template #item.totalSize="{ item }">
            {{ formatSize(item.totalSize) }}
          </template>

          <template #item.directoryPath="{ item }">
            <span class="text-caption text-medium-emphasis">{{ item.directoryPath }}</span>
          </template>

          <template #item.archiveStatus="{ item }">
            <v-chip
              v-if="item.archiveStatus && item.archiveStatus !== 'online'"
              :color="archiveStatusColor(item.archiveStatus)"
              size="x-small"
              variant="tonal"
            >
              {{ item.archiveStatus }}
            </v-chip>
            <span v-else class="text-caption" style="color: #6b7280;">online</span>
          </template>

          <template #item.lastScannedAt="{ item }">
            {{ formatDate(item.lastScannedAt) }}
          </template>

          <template #no-data>
            <div class="text-center pa-8">
              <v-icon size="48" color="secondary" class="mb-2">mdi-filmstrip-box-multiple</v-icon>
              <p class="text-medium-emphasis">No assets found. Scan a space to populate the catalog.</p>
            </div>
          </template>
        </v-data-table>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="catalog-view__pagination">
          <v-pagination
            v-model="page"
            :length="totalPages"
            :total-visible="5"
            density="compact"
          />
        </div>
      </div>
    </div>

    <!-- ═══ Overview Tab ═══ -->
    <div v-if="activeTab === 'overview'">
      <div v-if="catalogStore.stats" class="catalog-view__stats-grid">
        <!-- Summary cards -->
        <v-card class="catalog-view__stat-card">
          <v-card-text class="text-center">
            <v-icon size="36" color="primary" class="mb-2">mdi-filmstrip-box-multiple</v-icon>
            <div class="text-h5">{{ catalogStore.stats.totalAssets.toLocaleString() }}</div>
            <div class="text-caption text-medium-emphasis">Total Assets</div>
          </v-card-text>
        </v-card>

        <v-card class="catalog-view__stat-card">
          <v-card-text class="text-center">
            <v-icon size="36" color="info" class="mb-2">mdi-file-multiple</v-icon>
            <div class="text-h5">{{ catalogStore.stats.totalFiles.toLocaleString() }}</div>
            <div class="text-caption text-medium-emphasis">Total Files</div>
          </v-card-text>
        </v-card>

        <v-card class="catalog-view__stat-card">
          <v-card-text class="text-center">
            <v-icon size="36" color="success" class="mb-2">mdi-harddisk</v-icon>
            <div class="text-h5">{{ formatSize(catalogStore.stats.totalSize) }}</div>
            <div class="text-caption text-medium-emphasis">Total Size</div>
          </v-card-text>
        </v-card>

        <!-- By Type -->
        <v-card class="catalog-view__breakdown-card">
          <v-card-title class="text-subtitle-1">By Type</v-card-title>
          <v-card-text>
            <div v-for="t in catalogStore.stats.byType" :key="t.assetType" class="catalog-view__breakdown-row">
              <div class="d-flex align-center ga-2">
                <v-icon :icon="assetTypeIcon(t.assetType)" :color="assetTypeColor(t.assetType)" size="small" />
                <span>{{ t.assetType }}</span>
              </div>
              <div class="text-right">
                <span class="font-weight-medium">{{ t.count }}</span>
                <span class="text-caption text-medium-emphasis ml-2">{{ formatSize(t.totalSize) }}</span>
              </div>
            </div>
            <div v-if="catalogStore.stats.byType.length === 0" class="text-center text-medium-emphasis pa-4">
              No assets cataloged yet
            </div>
          </v-card-text>
        </v-card>

        <!-- By Space -->
        <v-card class="catalog-view__breakdown-card">
          <v-card-title class="text-subtitle-1">By Space</v-card-title>
          <v-card-text>
            <div v-for="s in catalogStore.stats.bySpace" :key="s.spaceName" class="catalog-view__breakdown-row">
              <div class="d-flex align-center ga-2">
                <v-icon icon="mdi-folder" size="small" />
                <span>{{ s.spaceName }}</span>
              </div>
              <div class="text-right">
                <span class="font-weight-medium">{{ s.assetCount }} assets</span>
                <span class="text-caption text-medium-emphasis ml-2">{{ formatSize(s.totalSize) }}</span>
              </div>
            </div>
            <div v-if="catalogStore.stats.bySpace.length === 0" class="text-center text-medium-emphasis pa-4">
              No spaces scanned yet
            </div>
          </v-card-text>
        </v-card>
      </div>

      <div v-else class="text-center pa-12">
        <v-progress-circular indeterminate color="primary" />
      </div>
    </div>

    <!-- ═══ Scanning Tab ═══ -->
    <div v-if="activeTab === 'scanning'">
      <!-- Trigger scan -->
      <v-card class="mb-4">
        <v-card-title class="text-subtitle-1">Trigger Manual Scan</v-card-title>
        <v-card-text>
          <div class="d-flex align-center ga-2">
            <v-select
              v-model="scanSpace"
              :items="spaceItems"
              label="Select space to scan"
              variant="outlined"
              density="compact"
              hide-details
              style="max-width: 300px"
            />
            <v-btn
              color="primary"
              :loading="catalogStore.isScanning"
              :disabled="!scanSpace"
              prepend-icon="mdi-radar"
              @click="handleScan"
            >
              Scan
            </v-btn>
          </div>
        </v-card-text>
      </v-card>

      <!-- Scheduler status -->
      <v-card v-if="catalogStore.schedulerStatus" class="mb-4">
        <v-card-title class="text-subtitle-1">Scheduler Status</v-card-title>
        <v-card-text>
          <div class="d-flex ga-4 flex-wrap">
            <v-chip :color="catalogStore.schedulerStatus.isRunning ? 'info' : 'grey'" variant="tonal">
              {{ catalogStore.schedulerStatus.isRunning ? 'Running' : 'Idle' }}
            </v-chip>
            <span class="text-medium-emphasis">
              {{ catalogStore.schedulerStatus.enabledSpaceCount }} space(s) with scheduled scanning
            </span>
            <span v-if="catalogStore.schedulerStatus.lastCheckAt" class="text-caption text-medium-emphasis">
              Last check: {{ formatDate(catalogStore.schedulerStatus.lastCheckAt) }}
            </span>
          </div>
        </v-card-text>
      </v-card>

      <!-- Scan configs -->
      <v-card class="mb-4">
        <v-card-title class="text-subtitle-1">Space Scan Schedules</v-card-title>
        <v-card-text>
          <v-table density="compact">
            <thead>
              <tr>
                <th>Space</th>
                <th>Enabled</th>
                <th>Interval</th>
                <th>Last Scan</th>
                <th>Next Scan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cfg in catalogStore.scanConfigs" :key="cfg.spaceName">
                <td>{{ cfg.spaceName }}</td>
                <td>
                  <v-chip :color="cfg.enabled ? 'success' : 'grey'" size="x-small" variant="tonal">
                    {{ cfg.enabled ? 'Yes' : 'No' }}
                  </v-chip>
                </td>
                <td>{{ cfg.intervalHours }}h</td>
                <td>{{ formatDate(cfg.lastScanAt) }}</td>
                <td>{{ formatDate(cfg.nextScanAt) }}</td>
              </tr>
              <tr v-if="catalogStore.scanConfigs.length === 0">
                <td colspan="5" class="text-center text-medium-emphasis pa-4">
                  No scan schedules configured. Run a manual scan first, then configure a schedule.
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>

      <!-- Recent scan logs -->
      <v-card>
        <v-card-title class="text-subtitle-1">Recent Scans</v-card-title>
        <v-card-text>
          <v-table density="compact">
            <thead>
              <tr>
                <th>Space</th>
                <th>Type</th>
                <th>Status</th>
                <th>Files</th>
                <th>Assets</th>
                <th>Jobs</th>
                <th>Started</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in catalogStore.scanLogs" :key="log.id">
                <td>{{ log.spaceName }}</td>
                <td>
                  <v-chip size="x-small" variant="tonal">{{ log.scanType }}</v-chip>
                </td>
                <td>
                  <v-chip :color="scanStatusColor(log.status)" size="x-small" variant="tonal">
                    {{ log.status }}
                  </v-chip>
                </td>
                <td>
                  <span class="text-caption">
                    {{ log.filesDiscovered }} found
                    <span v-if="log.filesNew > 0" class="text-success"> +{{ log.filesNew }}</span>
                    <span v-if="log.filesRemoved > 0" class="text-error"> -{{ log.filesRemoved }}</span>
                  </span>
                </td>
                <td>
                  <span class="text-caption">
                    <span v-if="log.assetsCreated > 0" class="text-success">+{{ log.assetsCreated }}</span>
                    <span v-if="log.assetsUpdated > 0" class="text-info ml-1">~{{ log.assetsUpdated }}</span>
                    <span v-if="log.assetsCreated === 0 && log.assetsUpdated === 0">—</span>
                  </span>
                </td>
                <td>
                  <span v-if="log.jobsQueued" class="text-caption text-info">{{ log.jobsQueued }} queued</span>
                  <span v-else class="text-caption text-medium-emphasis">—</span>
                </td>
                <td>{{ formatDate(log.startedAt) }}</td>
                <td>
                  <span v-if="log.completedAt" class="text-caption">
                    {{ log.completedAt - log.startedAt }}s
                  </span>
                  <span v-else class="text-caption text-info">running...</span>
                </td>
              </tr>
              <tr v-if="catalogStore.scanLogs.length === 0">
                <td colspan="8" class="text-center text-medium-emphasis pa-4">
                  No scans recorded yet
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </div>

    <!-- ═══ Asset Detail Dialog ═══ -->
    <v-dialog v-model="showDetail" max-width="800" scrollable>
      <AssetDetailPanel
        v-if="selectedAsset"
        :asset="selectedAsset"
        @close="showDetail = false"
        @delete="handleDeleteAsset(selectedAsset!)"
        @restored="handleAssetRestored"
      />
      <v-card v-else>
        <v-card-text class="text-center pa-8">
          <v-progress-circular indeterminate color="primary" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped lang="scss">
.catalog-view {
  max-width: 1460px;
  position: relative;

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 24px;
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

  &__browse-content {
    display: flex;
    background-color: #22252d;
    border: 1px solid rgba(55, 65, 81, 0.3);
    border-radius: 4px;
    min-height: 500px;

    @include phone {
      flex-direction: column;
      min-height: auto;
    }
  }

  &__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  &__filters {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__filter-row {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  &__search {
    flex: 1;
    min-width: 160px;
  }

  &__filter-select {
    width: 160px;
    flex-shrink: 0;
  }

  &__selection-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 16px;
    font-size: 12px;
    color: #60a5fa;
    background-color: rgba(59, 130, 246, 0.08);
    border-bottom: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__thumbnail {
    width: 48px;
    height: 32px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid rgba(55, 65, 81, 0.3);
    background: #1a1c22;
    flex-shrink: 0;
  }

  &__pagination {
    display: flex;
    justify-content: center;
    padding: 12px 0;
    border-top: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  &__stat-card {
    background-color: #22252d !important;
    border: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__breakdown-card {
    background-color: #22252d !important;
    border: 1px solid rgba(55, 65, 81, 0.3);
    grid-column: span 3;
  }

  &__breakdown-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid rgba(55, 65, 81, 0.15);

    &:last-child {
      border-bottom: none;
    }
  }
}
</style>
