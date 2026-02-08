<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFilesStore } from '@/stores/files.store';
import PageHeader from '@/components/common/PageHeader.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import FileBreadcrumb from './components/FileBreadcrumb.vue';
import FileToolbar from './components/FileToolbar.vue';
import FileDetailPanel from './components/FileDetailPanel.vue';
import UploadDialog from './components/UploadDialog.vue';
import AclEditor from './components/AclEditor.vue';
import GoalSelector from './components/GoalSelector.vue';
import SpaceTree from './components/SpaceTree.vue';
import MoveDialog from './components/MoveDialog.vue';
import ContextMenu from '@/components/common/ContextMenu.vue';
import type { ContextMenuItem } from '@/components/common/ContextMenu.vue';
import { useResponsive } from '@/composables/useResponsive';
import type { IFileEntry, ISetAclRequest } from '@shared/types';

const route = useRoute();
const router = useRouter();
const store = useFilesStore();
const responsive = useResponsive();

// --- Space selection ---
const selectedSpace = ref<string>('');

// --- Sidebar ---
const sidebarOpen = ref(true);

// --- Dialogs ---
const showCreateFolderDialog = ref(false);
const showUploadDialog = ref(false);
const showDeleteConfirm = ref(false);
const showRenameDialog = ref(false);
const showAclEditor = ref(false);
const showGoalSelector = ref(false);
const showMoveDialog = ref(false);

// --- Create folder ---
const newFolderName = ref('');
const isCreating = ref(false);

// --- Rename ---
const renameTarget = ref<IFileEntry | null>(null);
const newName = ref('');
const isRenaming = ref(false);

// --- Upload ---
const isUploading = ref(false);

// --- ACL ---
const isSavingAcl = ref(false);

// --- Goal ---
const isSavingGoal = ref(false);

// --- Move ---
const isMoving = ref(false);

// --- Selected entries as objects ---
const selectedEntryObjects = computed(() => {
  return store.entries.filter((e) => store.selectedEntries.includes(e.path));
});

// --- Column definitions for the file table ---
const columns = [
  { key: 'name', title: 'Name', sortable: true },
  { key: 'size', title: 'Size', sortable: true, width: '100px', minWidth: '100px', align: 'end' as const },
  { key: 'mtime', title: 'Modified', sortable: true, width: '180px', minWidth: '180px' },
  { key: 'owner', title: 'Owner', sortable: true, width: '100px', minWidth: '100px' },
];

// --- Formatting ---
function formatBytes(bytes: number): string {
  if (bytes === 0) return '—';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fileIcon(entry: IFileEntry): string {
  if (entry.type === 'directory') return 'mdi-folder';
  const ext = entry.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mxf': case 'mov': case 'mp4': case 'avi': case 'mkv':
      return 'mdi-filmstrip';
    case 'wav': case 'mp3': case 'aac': case 'flac':
      return 'mdi-music-note';
    case 'jpg': case 'jpeg': case 'png': case 'tiff': case 'exr': case 'dpx':
      return 'mdi-image';
    case 'xml': case 'json': case 'txt': case 'log':
      return 'mdi-file-document';
    default:
      return 'mdi-file';
  }
}

// --- Navigation ---
function handleSpaceChange(spaceName: string): void {
  if (!spaceName) return;
  router.push(`/files/${encodeURIComponent(spaceName)}`);
}

function navigateTo(path: string): void {
  if (!selectedSpace.value) return;
  if (path) {
    router.push(`/files/${encodeURIComponent(selectedSpace.value)}/${path}`);
  } else {
    router.push(`/files/${encodeURIComponent(selectedSpace.value)}`);
  }
}

function handleTreeNavigate(spaceName: string, path: string): void {
  if (path) {
    router.push(`/files/${encodeURIComponent(spaceName)}/${path}`);
  } else {
    router.push(`/files/${encodeURIComponent(spaceName)}`);
  }
}

function handleRowClickEvent(_event: Event, row: { item: Record<string, unknown> }): void {
  handleRowClick(row.item);
}

function handleRowClick(item: Record<string, unknown>): void {
  const entry = item as unknown as IFileEntry;
  if (entry.type === 'directory') {
    navigateTo(entry.path);
  } else {
    // Show detail panel for files
    store.fetchEntryAcl(entry);
  }
}

function handleRowSelect(entry: IFileEntry): void {
  store.fetchEntryAcl(entry);
}

// --- CRUD handlers ---
async function handleCreateFolder(): Promise<void> {
  if (!newFolderName.value) return;
  isCreating.value = true;
  const success = await store.createDirectory(newFolderName.value);
  isCreating.value = false;
  if (success) {
    showCreateFolderDialog.value = false;
    newFolderName.value = '';
  }
}

async function handleUpload(files: File[]): Promise<void> {
  isUploading.value = true;
  await store.uploadFiles(files);
  isUploading.value = false;
  showUploadDialog.value = false;
}

async function handleDelete(): Promise<void> {
  const paths = store.selectedEntries;
  if (paths.length === 0) return;
  await store.deleteEntries(paths);
  showDeleteConfirm.value = false;
  store.clearDetail();
}

function openRenameDialog(): void {
  if (selectedEntryObjects.value.length !== 1) return;
  renameTarget.value = selectedEntryObjects.value[0];
  newName.value = renameTarget.value.name;
  showRenameDialog.value = true;
}

async function handleRename(): Promise<void> {
  if (!renameTarget.value || !newName.value) return;
  isRenaming.value = true;
  const success = await store.renameEntry(renameTarget.value.path, newName.value);
  isRenaming.value = false;
  if (success) {
    showRenameDialog.value = false;
    renameTarget.value = null;
  }
}

function handleDownload(): void {
  const files = selectedEntryObjects.value.filter((e) => e.type === 'file');
  for (const file of files) {
    store.downloadEntry(file.path);
  }
}

// --- ACL ---
async function handleSaveAcl(request: ISetAclRequest): Promise<void> {
  if (!store.detailEntry) return;
  isSavingAcl.value = true;
  const success = await store.setFileAcl(store.detailEntry.path, request);
  isSavingAcl.value = false;
  if (success) {
    showAclEditor.value = false;
  }
}

// --- Goal ---
async function handleSaveGoal(goalName: string, recursive: boolean): Promise<void> {
  if (!store.detailEntry) return;
  isSavingGoal.value = true;
  const success = await store.setFileGoal(store.detailEntry.path, goalName, recursive);
  isSavingGoal.value = false;
  if (success) {
    showGoalSelector.value = false;
  }
}

// --- Move ---
const moveWarning = ref<string | null>(null);

async function handleMove(destSpace: string, destPath: string): Promise<void> {
  const paths = store.selectedEntries;
  if (paths.length === 0) return;
  isMoving.value = true;
  moveWarning.value = null;
  const { success, partialMoves } = await store.moveEntries(paths, destSpace, destPath);
  isMoving.value = false;
  if (success || partialMoves > 0) {
    showMoveDialog.value = false;
    store.clearDetail();
    if (partialMoves > 0) {
      moveWarning.value = `${partialMoves} file(s) copied to destination but source could not be deleted (permission denied). The original files remain in place.`;
    }
  }
}

// --- Context menu ---
const contextMenu = ref({ show: false, x: 0, y: 0, items: [] as ContextMenuItem[] });
const contextEntry = ref<IFileEntry | null>(null);

function handleTableContextMenu(event: MouseEvent): void {
  // Check if right-clicked on a table row
  const row = (event.target as HTMLElement).closest('.v-data-table__tr');
  if (row) {
    // Find which entry was clicked via the row's data-path or by matching text
    const tbody = row.parentElement;
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('.v-data-table__tr'));
    const index = rows.indexOf(row as Element);
    const entry = store.entries[index];
    if (!entry) return;

    // Select this entry if not already selected
    if (!store.selectedEntries.includes(entry.path)) {
      store.selectedEntries = [entry.path];
    }
    contextEntry.value = entry;

    // Build menu items based on entry type and selection
    const items: ContextMenuItem[] = [];
    const selected = selectedEntryObjects.value;
    const isFile = selected.some((e) => e.type === 'file');
    const isSingle = selected.length === 1;

    if (isSingle && entry.type === 'directory') {
      items.push({ label: 'Open', icon: 'mdi-folder-open', action: 'open' });
      items.push({ label: '', icon: '', action: '', divider: true });
    }
    if (isFile) {
      items.push({ label: 'Download', icon: 'mdi-download', action: 'download' });
    }
    if (isSingle) {
      items.push({ label: 'Rename', icon: 'mdi-rename-box', action: 'rename' });
    }
    items.push({ label: 'Move', icon: 'mdi-file-move', action: 'move' });
    items.push({ label: 'Delete', icon: 'mdi-delete', action: 'delete', color: 'error', divider: true });

    contextMenu.value = { show: true, x: event.clientX, y: event.clientY, items };
  } else {
    // Right-clicked on empty area (background)
    contextMenu.value = {
      show: true,
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: 'New Folder', icon: 'mdi-folder-plus', action: 'create-folder' },
        { label: 'Upload', icon: 'mdi-upload', action: 'upload' },
        { label: 'Refresh', icon: 'mdi-refresh', action: 'refresh' },
      ],
    };
  }
}

function handleContextAction(action: string): void {
  switch (action) {
    case 'open':
      if (contextEntry.value) navigateTo(contextEntry.value.path);
      break;
    case 'download':
      handleDownload();
      break;
    case 'rename':
      openRenameDialog();
      break;
    case 'move':
      showMoveDialog.value = true;
      break;
    case 'delete':
      showDeleteConfirm.value = true;
      break;
    case 'create-folder':
      showCreateFolderDialog.value = true;
      break;
    case 'upload':
      showUploadDialog.value = true;
      break;
    case 'refresh':
      store.refresh();
      break;
  }
}

// --- Sync route → store ---
function syncFromRoute(): void {
  const spaceName = route.params.spaceName as string;
  const pathMatch = route.params.pathMatch;
  const filePath = Array.isArray(pathMatch) ? pathMatch.join('/') : (pathMatch || '');

  if (spaceName && spaceName !== selectedSpace.value) {
    selectedSpace.value = spaceName;
  }

  if (spaceName) {
    store.navigate(spaceName, filePath);
  }
}

watch(() => [route.params.spaceName, route.params.pathMatch], syncFromRoute);

onMounted(async () => {
  await store.fetchSpaces();

  // If we have route params, navigate to that space
  if (route.params.spaceName) {
    syncFromRoute();
  } else if (store.spaces.length > 0) {
    // Auto-select first space
    selectedSpace.value = store.spaces[0].name;
    handleSpaceChange(selectedSpace.value);
  }
});
</script>

<template>
  <div class="file-browser-view">
    <PageHeader title="File Browser">
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

    <!-- Move warning (partial move — source not deleted) -->
    <v-alert
      v-if="moveWarning"
      type="warning"
      variant="tonal"
      class="mb-4"
      closable
      @click:close="moveWarning = null"
    >
      {{ moveWarning }}
    </v-alert>

    <!-- Main content area -->
    <div class="file-browser-view__content">
      <!-- Sidebar tree -->
      <div class="file-browser-view__sidebar" :class="{ 'file-browser-view__sidebar--collapsed': !sidebarOpen }">
        <SpaceTree
          :spaces="store.spaces"
          :current-space="store.currentSpace"
          :current-path="store.currentPath"
          @navigate="handleTreeNavigate"
        />
      </div>

      <div v-if="store.currentSpace" class="file-browser-view__main">
        <!-- Breadcrumb -->
        <FileBreadcrumb
          :items="store.breadcrumbs"
          :space-name="store.currentSpace"
          @navigate="navigateTo"
        />

        <!-- Toolbar -->
        <FileToolbar
          :selected-entries="selectedEntryObjects"
          :is-loading="store.isLoading"
          @create-folder="showCreateFolderDialog = true"
          @upload="showUploadDialog = true"
          @download="handleDownload"
          @rename="openRenameDialog"
          @move="showMoveDialog = true"
          @delete="showDeleteConfirm = true"
          @refresh="store.refresh()"
        />

        <!-- File table -->
        <div class="file-browser-view__table" @contextmenu.prevent="handleTableContextMenu">
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
            class="file-table"
            @click:row="handleRowClickEvent"
          >
            <!-- Name column -->
            <template #item.name="{ item }">
              <div class="file-table__name-cell">
                <v-icon
                  size="20"
                  :color="(item as any).type === 'directory' ? '#f59e0b' : '#6b7280'"
                  class="mr-2 flex-shrink-0"
                >
                  {{ fileIcon(item as any) }}
                </v-icon>
                <span
                  class="file-table__name-text"
                  :class="{ 'font-weight-medium': (item as any).type === 'directory' }"
                  :title="(item as any).name"
                >
                  {{ (item as any).name }}
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

            <!-- Owner column -->
            <template #item.owner="{ item }">
              <span class="text-medium-emphasis text-caption">
                {{ (item as any).owner }}
              </span>
            </template>
          </v-data-table>
        </div>

        <!-- Summary bar -->
        <div class="file-browser-view__summary">
          <span>{{ store.totalDirs }} folders, {{ store.totalFiles }} files</span>
          <span v-if="store.totalSize > 0" class="ml-3">
            Total: {{ formatBytes(store.totalSize) }}
          </span>
        </div>
      </div>

      <!-- Detail panel: inline on desktop, bottom sheet on phone -->
      <FileDetailPanel
        v-if="store.detailEntry && !responsive.isPhone.value"
        :entry="store.detailEntry"
        :acl="store.detailAcl"
        :goal="store.detailGoal"
        :dir-info="store.detailDirInfo"
        :is-loading="store.isDetailLoading"
        @close="store.clearDetail()"
        @edit-acl="showAclEditor = true"
        @edit-goal="showGoalSelector = true"
        @download="store.downloadEntry($event)"
      />

      <!-- No space selected — shown inside content area alongside sidebar -->
      <div v-if="!store.currentSpace" class="file-browser-view__empty">
        <v-icon size="64" color="grey">mdi-folder-open-outline</v-icon>
        <div class="text-body-1 text-medium-emphasis mt-4">
          Select a media space to browse files
        </div>
      </div>
    </div>

    <!-- Detail panel: bottom sheet on phone -->
    <v-bottom-sheet v-if="responsive.isPhone.value" :model-value="!!store.detailEntry" @update:model-value="!$event && store.clearDetail()">
      <v-card class="file-browser-view__detail-sheet">
        <FileDetailPanel
          v-if="store.detailEntry"
          :entry="store.detailEntry"
          :acl="store.detailAcl"
          :goal="store.detailGoal"
          :dir-info="store.detailDirInfo"
          :is-loading="store.isDetailLoading"
          @close="store.clearDetail()"
          @edit-acl="showAclEditor = true"
          @edit-goal="showGoalSelector = true"
          @download="store.downloadEntry($event)"
        />
      </v-card>
    </v-bottom-sheet>

    <!-- Create Folder Dialog -->
    <v-dialog v-model="showCreateFolderDialog" max-width="440" persistent>
      <v-card>
        <v-card-title>New Folder</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newFolderName"
            label="Folder Name"
            variant="outlined"
            density="compact"
            autofocus
            :rules="[
              (v: string) => !!v || 'Folder name is required',
              (v: string) => !v.includes('/') || 'Name cannot contain slashes',
            ]"
            @keyup.enter="handleCreateFolder"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showCreateFolderDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="isCreating"
            :disabled="!newFolderName || newFolderName.includes('/')"
            @click="handleCreateFolder"
          >
            Create
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Upload Dialog -->
    <UploadDialog
      v-model="showUploadDialog"
      :current-path="store.currentPath || '/'"
      :is-uploading="isUploading"
      @upload="handleUpload"
    />

    <!-- Rename Dialog -->
    <v-dialog v-model="showRenameDialog" max-width="440" persistent>
      <v-card>
        <v-card-title>Rename</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newName"
            label="New Name"
            variant="outlined"
            density="compact"
            autofocus
            :rules="[
              (v: string) => !!v || 'Name is required',
              (v: string) => !v.includes('/') || 'Name cannot contain slashes',
            ]"
            @keyup.enter="handleRename"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showRenameDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="isRenaming"
            :disabled="!newName || newName.includes('/')"
            @click="handleRename"
          >
            Rename
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirm -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Delete Items"
      :message="`Are you sure you want to delete ${store.selectedEntries.length} item(s)? This action cannot be undone.`"
      confirm-text="Delete"
      confirm-color="error"
      @confirm="handleDelete"
    />

    <!-- ACL Editor -->
    <AclEditor
      v-model="showAclEditor"
      :acl="store.detailAcl"
      :path="store.detailEntry?.path || ''"
      :is-saving="isSavingAcl"
      @save="handleSaveAcl"
    />

    <!-- Goal Selector -->
    <GoalSelector
      v-model="showGoalSelector"
      :current-goal="store.detailGoal"
      :path="store.detailEntry?.path || ''"
      :is-directory="store.detailEntry?.type === 'directory'"
      :is-saving="isSavingGoal"
      @save="handleSaveGoal"
    />

    <!-- Move Dialog -->
    <MoveDialog
      v-model="showMoveDialog"
      :entries="selectedEntryObjects"
      :current-space="store.currentSpace || ''"
      :spaces="store.spaces"
      :is-moving="isMoving"
      @move="handleMove"
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
.file-browser-view {
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

  &__detail-sheet {
    max-height: 60vh;
    overflow-y: auto;
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

// Hide Owner and Modified columns on phone for file table
@include phone {
  .file-table {
    :deep(thead th:nth-child(4)),
    :deep(.v-data-table__tr td:nth-child(4)),
    :deep(thead th:nth-child(5)),
    :deep(.v-data-table__tr td:nth-child(5)) {
      display: none;
    }
  }
}

.file-table {
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
}
</style>
