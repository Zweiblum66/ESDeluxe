<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTieringBrowserStore } from '@/stores/tiering-browser.store';
import { useTieringStore } from '@/stores/tiering.store';
import { useFilesStore } from '@/stores/files.store';
import { useGoalsStore } from '@/stores/goals.store';
import PageHeader from '@/components/common/PageHeader.vue';
import FileBreadcrumb from '@/views/files/components/FileBreadcrumb.vue';
import SpaceTree from '@/views/files/components/SpaceTree.vue';
import TieringToolbar from './components/TieringToolbar.vue';
import TieringGoalDialog from './components/TieringGoalDialog.vue';
import ContextMenu from '@/components/common/ContextMenu.vue';
import type { ContextMenuItem } from '@/components/common/ContextMenu.vue';
import type { IFileEntry } from '@shared/types';
import type { TreeNode } from '@/views/files/components/SpaceTree.vue';

import { useAuthStore } from '@/stores/auth.store';

const route = useRoute();
const router = useRouter();
const store = useTieringBrowserStore();
const tieringStore = useTieringStore();
const filesStore = useFilesStore();
const goalsStore = useGoalsStore();
const authStore = useAuthStore();

// --- Sidebar ---
const sidebarOpen = ref(true);

// --- Dialogs ---
const showGoalDialog = ref(false);
const showSpaceGoalDialog = ref(false);

// --- Selected entries as objects ---
const selectedEntryObjects = computed(() => {
  return store.entries.filter((e) => store.selectedEntries.includes(e.path));
});

// --- Goal dialog targets ---
const goalTargets = computed(() =>
  selectedEntryObjects.value.map((e) => ({ path: e.path, type: e.type })),
);

const spaceGoalTargets = computed(() => {
  if (!store.currentSpace) return [];
  return [{ path: store.currentSpace, type: 'directory' }];
});

// Current goal for selection (show if single entry selected)
const selectedCurrentGoal = computed(() => {
  if (selectedEntryObjects.value.length !== 1) return null;
  return store.entryGoals.get(selectedEntryObjects.value[0].path) || null;
});

// Total size of selected entries (for the goal dialog)
const selectedDataSize = computed(() => {
  return selectedEntryObjects.value.reduce((sum, e) => sum + (e.size || 0), 0);
});

// --- Column definitions ---
const columns = [
  { key: 'name', title: 'Name', sortable: true },
  { key: 'size', title: 'Size', sortable: true, width: '100px', minWidth: '100px', align: 'end' as const },
  { key: 'mtime', title: 'Modified', sortable: true, width: '160px', minWidth: '160px' },
  { key: 'goal', title: 'Storage Goal', sortable: false, width: '180px', minWidth: '180px' },
];

// --- Formatting ---
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(epoch: number): string {
  if (!epoch) return '—';
  return new Date(epoch * 1000).toLocaleString();
}

function fileIcon(entry: IFileEntry): string {
  if (entry.type === 'directory') return 'mdi-folder';
  const ext = entry.name.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    mp4: 'mdi-file-video', mov: 'mdi-file-video', avi: 'mdi-file-video', mkv: 'mdi-file-video',
    mxf: 'mdi-file-video', wav: 'mdi-file-music', mp3: 'mdi-file-music', aac: 'mdi-file-music',
    jpg: 'mdi-file-image', jpeg: 'mdi-file-image', png: 'mdi-file-image', tiff: 'mdi-file-image',
    pdf: 'mdi-file-pdf-box', xml: 'mdi-file-code', json: 'mdi-file-code',
  };
  return (ext && iconMap[ext]) || 'mdi-file';
}

function getEntryGoal(entry: IFileEntry): string | undefined {
  return store.entryGoals.get(entry.path);
}

function goalColor(goal: string): string {
  const lower = goal.toLowerCase();
  if (lower === 'online' || lower === 'default') return 'success';
  if (lower === 'nearline') return 'info';
  if (lower === 'offline' || lower === 'archive') return 'deep-purple';
  return 'grey';
}

function isFileBeingTiered(entry: IFileEntry): boolean {
  const progress = tieringStore.progress;
  if (!progress || !progress.currentFile) return false;
  const fullPath = `${store.currentSpace}/${entry.path}`;
  return progress.currentFile === fullPath;
}

/** Returns the filename without extension (for files), or full name (for dirs) */
function fileBaseName(entry: IFileEntry): string {
  if (entry.type === 'directory') return entry.name;
  const dotIdx = entry.name.lastIndexOf('.');
  if (dotIdx <= 0) return entry.name;
  return entry.name.slice(0, dotIdx);
}

/** Returns the file extension including dot (e.g. ".mov"), or empty string */
function fileExtension(entry: IFileEntry): string {
  if (entry.type === 'directory') return '';
  const dotIdx = entry.name.lastIndexOf('.');
  if (dotIdx <= 0) return '';
  return entry.name.slice(dotIdx);
}

// --- Navigation ---
function handleTreeNavigate(spaceName: string, path: string): void {
  if (path) {
    router.push(`/tiering-browser/${encodeURIComponent(spaceName)}/${path}`);
  } else {
    router.push(`/tiering-browser/${encodeURIComponent(spaceName)}`);
  }
}

function navigateTo(path: string): void {
  if (!store.currentSpace) return;
  if (path) {
    router.push(`/tiering-browser/${encodeURIComponent(store.currentSpace)}/${path}`);
  } else {
    router.push(`/tiering-browser/${encodeURIComponent(store.currentSpace)}`);
  }
}

function handleSpaceChange(spaceName: string): void {
  router.push(`/tiering-browser/${encodeURIComponent(spaceName)}`);
}

function handleRowClickEvent(_event: Event, row: { item: unknown }): void {
  const entry = row.item as IFileEntry;
  if (entry.type === 'directory') {
    navigateTo(entry.path);
  }
}

// --- Goal operations ---
async function handleSetGoal(goalName: string, recursive: boolean): Promise<void> {
  const paths = store.selectedEntries;
  if (paths.length === 0) return;

  const success = await store.setBulkGoal(paths, goalName, recursive);
  if (success) {
    showGoalDialog.value = false;
    store.selectedEntries = [];
  }
}

async function handleSetSpaceGoal(goalName: string, recursive: boolean): Promise<void> {
  if (!store.currentSpace) return;
  const success = await store.setSpaceGoal(store.currentSpace, goalName, recursive);
  if (success) {
    showSpaceGoalDialog.value = false;
  }
}

// --- Context menu ---
const contextMenu = ref({ show: false, x: 0, y: 0, items: [] as ContextMenuItem[] });
const contextEntry = ref<IFileEntry | null>(null);

function handleTableContextMenu(event: MouseEvent): void {
  const row = (event.target as HTMLElement).closest('.v-data-table__tr');
  if (row) {
    const tbody = row.parentElement;
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('.v-data-table__tr'));
    const index = rows.indexOf(row as Element);
    const entry = store.entries[index];
    if (!entry) return;

    if (!store.selectedEntries.includes(entry.path)) {
      store.selectedEntries = [entry.path];
    }
    contextEntry.value = entry;

    const items: ContextMenuItem[] = [];
    if (entry.type === 'directory') {
      items.push({ label: 'Open', icon: 'mdi-folder-open', action: 'open' });
      items.push({ label: '', icon: '', action: '', divider: true });
    }
    if (authStore.isAdmin || authStore.canManageSpace(store.currentSpace ?? '')) {
      items.push({ label: 'Set Goal', icon: 'mdi-target', action: 'set-goal' });
    }
    items.push({ label: 'Copy Path', icon: 'mdi-content-copy', action: 'copy-path' });

    contextMenu.value = { show: true, x: event.clientX, y: event.clientY, items };
  } else {
    contextMenu.value = {
      show: true,
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: 'Refresh', icon: 'mdi-refresh', action: 'refresh' },
      ],
    };
  }
}

const treeContextNode = ref<TreeNode | null>(null);

function handleTreeContextMenu(event: MouseEvent, node: TreeNode): void {
  treeContextNode.value = node;
  const items: ContextMenuItem[] = [];
  items.push({ label: 'Open', icon: 'mdi-folder-open', action: 'tree-open' });
  items.push({ label: 'Copy Path', icon: 'mdi-content-copy', action: 'tree-copy-path' });
  contextMenu.value = { show: true, x: event.clientX, y: event.clientY, items };
}

function handleContextAction(action: string): void {
  switch (action) {
    case 'open':
      if (contextEntry.value) navigateTo(contextEntry.value.path);
      break;
    case 'set-goal':
      showGoalDialog.value = true;
      break;
    case 'refresh':
      store.refresh();
      break;
    case 'copy-path': {
      const paths = selectedEntryObjects.value.map((e) => e.path);
      const text = paths.length === 1 ? paths[0] : paths.join('\n');
      navigator.clipboard.writeText(text);
      break;
    }
    case 'tree-open':
      if (treeContextNode.value) {
        handleTreeNavigate(treeContextNode.value.spaceName, treeContextNode.value.path);
      }
      break;
    case 'tree-copy-path': {
      if (treeContextNode.value) {
        const node = treeContextNode.value;
        const fullPath = node.path ? `${node.spaceName}/${node.path}` : node.spaceName;
        navigator.clipboard.writeText(fullPath);
      }
      break;
    }
  }
}

// --- Sync route → store ---
function syncFromRoute(): void {
  const spaceName = route.params.spaceName as string;
  const pathMatch = route.params.pathMatch;
  const filePath = Array.isArray(pathMatch) ? pathMatch.join('/') : (pathMatch || '');

  if (spaceName) {
    store.navigate(spaceName, filePath);
  }
}

watch(() => [route.params.spaceName, route.params.pathMatch], syncFromRoute);

onMounted(async () => {
  await Promise.all([
    store.fetchSpaces(),
    filesStore.fetchSpaces(), // SpaceTree uses filesStore internally
    goalsStore.fetchGoals(),
  ]);

  if (route.params.spaceName) {
    syncFromRoute();
  } else if (store.spaces.length > 0) {
    handleSpaceChange(store.spaces[0].name);
  }

  tieringStore.startProgressPolling();
});

onUnmounted(() => {
  tieringStore.stopProgressPolling();
});
</script>

<template>
  <div class="tiering-browser-view">
    <PageHeader title="Tiering Browser">
      <template #actions>
        <v-btn
          :icon="sidebarOpen ? 'mdi-page-layout-sidebar-left' : 'mdi-file-tree'"
          variant="text"
          size="small"
          :title="sidebarOpen ? 'Hide sidebar' : 'Show sidebar'"
          @click="sidebarOpen = !sidebarOpen"
        />
      </template>
    </PageHeader>

    <!-- Error Alert -->
    <v-alert
      v-if="store.error"
      type="error"
      variant="tonal"
      class="mb-4"
      closable
      @click:close="store.error = null"
    >
      {{ store.error }}
    </v-alert>

    <!-- Main content area -->
    <div class="tiering-browser-view__content">
      <!-- Sidebar tree -->
      <div class="tiering-browser-view__sidebar" :class="{ 'tiering-browser-view__sidebar--collapsed': !sidebarOpen }">
        <SpaceTree
          :spaces="store.spaces"
          :current-space="store.currentSpace"
          :current-path="store.currentPath"
          @navigate="handleTreeNavigate"
          @contextmenu="handleTreeContextMenu"
        />
      </div>

      <div v-if="store.currentSpace" class="tiering-browser-view__main">
        <!-- Space Goal Bar -->
        <div class="tiering-browser-view__space-goal">
          <v-icon size="16" class="mr-2" color="grey">mdi-folder-network</v-icon>
          <span class="text-body-2 text-medium-emphasis">Space Goal:</span>
          <v-chip
            v-if="store.spaceGoal"
            size="small"
            variant="tonal"
            color="primary"
            label
            class="ml-2"
          >
            <v-icon start size="small">mdi-target</v-icon>
            {{ store.spaceGoal }}
          </v-chip>
          <span v-else class="text-caption text-medium-emphasis ml-2">Not set</span>
          <v-btn
            v-if="authStore.isAdmin || authStore.canManageSpace(store.currentSpace ?? '')"
            size="x-small"
            variant="text"
            icon="mdi-pencil"
            class="ml-1"
            title="Change space goal"
            @click="showSpaceGoalDialog = true"
          />
        </div>

        <!-- Breadcrumb -->
        <FileBreadcrumb
          :items="store.breadcrumbs"
          :space-name="store.currentSpace"
          @navigate="navigateTo"
        />

        <!-- Toolbar -->
        <TieringToolbar
          :selected-entries="selectedEntryObjects"
          :is-loading="store.isLoading"
          :is-admin="authStore.isAdmin || authStore.canManageSpace(store.currentSpace ?? '')"
          @set-goal="showGoalDialog = true"
          @refresh="store.refresh()"
        />

        <!-- File table -->
        <div class="tiering-browser-view__table" @contextmenu.prevent="handleTableContextMenu">
          <v-data-table
            v-model="store.selectedEntries"
            :headers="columns"
            :items="(store.entries as unknown as Record<string, unknown>[])"
            :loading="store.isLoading"
            show-select
            item-value="path"
            density="comfortable"
            hover
            no-data-text="Empty directory"
            class="tiering-table"
            @click:row="handleRowClickEvent"
          >
            <!-- Name column -->
            <template #item.name="{ item }">
              <div class="tiering-table__name-cell">
                <v-icon
                  size="20"
                  :color="(item as any).type === 'directory' ? '#f59e0b' : '#6b7280'"
                  class="mr-2 flex-shrink-0"
                >
                  {{ fileIcon(item as any) }}
                </v-icon>
                <span
                  class="tiering-table__name-text"
                  :class="{ 'font-weight-medium': (item as any).type === 'directory' }"
                  :title="(item as any).name"
                >
                  <span class="tiering-table__name-base">{{ fileBaseName(item as any) }}</span><span v-if="fileExtension(item as any)" class="tiering-table__name-ext">{{ fileExtension(item as any) }}</span>
                </span>
              </div>
            </template>

            <!-- Size column -->
            <template #item.size="{ item }">
              <span class="text-medium-emphasis">
                {{ (item as any).type === 'directory' ? '—' : formatBytes((item as any).size) }}
              </span>
            </template>

            <!-- Modified column -->
            <template #item.mtime="{ item }">
              <span class="text-medium-emphasis text-caption">
                {{ formatDate((item as any).mtime) }}
              </span>
            </template>

            <!-- Goal column -->
            <template #item.goal="{ item }">
              <!-- Currently being tiered -->
              <v-chip
                v-if="isFileBeingTiered(item as any)"
                size="small"
                variant="tonal"
                color="warning"
                label
              >
                <v-progress-circular size="12" width="2" indeterminate class="mr-1" />
                Tiering...
              </v-chip>
              <!-- Loading goals -->
              <div v-else-if="store.isLoadingGoals" class="d-flex align-center">
                <v-progress-circular size="14" width="2" indeterminate color="grey" />
              </div>
              <!-- Goal chip with color -->
              <v-chip
                v-else-if="getEntryGoal(item as any)"
                size="small"
                variant="tonal"
                :color="goalColor(getEntryGoal(item as any)!)"
                label
              >
                <v-icon start size="small">mdi-target</v-icon>
                {{ getEntryGoal(item as any) }}
              </v-chip>
              <span v-else class="text-caption text-medium-emphasis">—</span>
            </template>
          </v-data-table>
        </div>

        <!-- Summary bar -->
        <div class="tiering-browser-view__summary">
          <span>{{ store.totalDirs }} folders, {{ store.totalFiles }} files</span>
          <span v-if="store.totalSize > 0" class="ml-3">
            Total: {{ formatBytes(store.totalSize) }}
          </span>
        </div>
      </div>

      <!-- No space selected -->
      <div v-if="!store.currentSpace" class="tiering-browser-view__empty">
        <v-icon size="64" color="grey">mdi-layers-triple-outline</v-icon>
        <div class="text-body-1 text-medium-emphasis mt-4">
          Select a media space to manage storage goals
        </div>
      </div>
    </div>

    <!-- Goal Dialog (for selected files/folders) -->
    <TieringGoalDialog
      v-model="showGoalDialog"
      :current-goal="selectedCurrentGoal"
      :targets="goalTargets"
      :selected-data-size="selectedDataSize"
      :is-saving="store.isSavingGoal"
      @save="handleSetGoal"
    />

    <!-- Goal Dialog (for space-level goal) -->
    <TieringGoalDialog
      v-model="showSpaceGoalDialog"
      :current-goal="store.spaceGoal"
      :targets="spaceGoalTargets"
      :selected-data-size="store.totalSize"
      :is-saving="store.isSavingGoal"
      @save="handleSetSpaceGoal"
    />

    <!-- Context Menu -->
    <ContextMenu
      v-model="contextMenu.show"
      :position="{ x: contextMenu.x, y: contextMenu.y }"
      :items="contextMenu.items"
      @action="handleContextAction"
    />
  </div>
</template>

<style scoped lang="scss">
.tiering-browser-view {
  max-width: 1600px;

  @include phone {
    max-width: 100%;
  }

  &__content {
    display: flex;
    gap: 0;
    border: 1px solid rgba(55, 65, 81, 0.3);
    border-radius: 8px;
    overflow: hidden;
    background-color: #22252d;
    min-height: 500px;

    @include phone {
      flex-direction: column;
      min-height: 300px;
      border-radius: 6px;
    }
  }

  &__sidebar {
    width: 260px;
    min-width: 260px;
    overflow: hidden;
    transition: width 0.2s ease, min-width 0.2s ease;

    &--collapsed {
      width: 0;
      min-width: 0;

      @include phone {
        max-height: 0;
      }
    }

    @include phone {
      width: 100%;
      min-width: 100%;
      max-height: 200px;
      border-right: none;
      border-bottom: 1px solid rgba(55, 65, 81, 0.3);
      overflow-y: auto;
    }
  }

  &__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 12px 16px;
    min-width: 0;

    @include phone {
      padding: 8px 10px;
    }
  }

  &__space-goal {
    display: flex;
    align-items: center;
    padding: 6px 0 8px;
    border-bottom: 1px solid rgba(55, 65, 81, 0.2);
    margin-bottom: 8px;
  }

  &__table {
    flex: 1;
    overflow: auto;

    @include phone {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
  }

  &__summary {
    display: flex;
    align-items: center;
    padding: 8px 0 0;
    font-size: 12px;
    color: #6b7280;
    border-top: 1px solid rgba(55, 65, 81, 0.2);
    margin-top: 8px;
  }

  &__empty {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;

    @include phone {
      min-height: 200px;
    }
  }
}

// Hide Modified and Goal columns on phone
@include phone {
  .tiering-table {
    :deep(thead th:nth-child(4)),
    :deep(.v-data-table__tr td:nth-child(4)),
    :deep(thead th:nth-child(5)),
    :deep(.v-data-table__tr td:nth-child(5)) {
      display: none;
    }
  }
}

.tiering-table {
  background: transparent !important;

  :deep(table) {
    table-layout: fixed;
  }

  :deep(.v-data-table__thead) {
    background: #2a2d35;
  }

  :deep(.v-data-table__thead th) {
    color: #9ca3af !important;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid rgba(55, 65, 81, 0.3) !important;
  }

  :deep(.v-data-table__tr) {
    cursor: pointer;

    &:hover {
      background-color: rgba(59, 130, 246, 0.06) !important;
    }
  }

  :deep(.v-data-table__td) {
    border-bottom: 1px solid rgba(55, 65, 81, 0.2) !important;
    font-size: 14px;
  }

  &__name-cell {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  &__name-text {
    display: flex;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
  }

  &__name-base {
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
  }

  &__name-ext {
    flex-shrink: 0;
  }
}
</style>
