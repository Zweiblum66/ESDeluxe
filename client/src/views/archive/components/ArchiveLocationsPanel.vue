<script setup lang="ts">
import { ref } from 'vue';
import { useArchiveStore } from '@/stores/archive.store';
import ArchiveLocationDialog from './ArchiveLocationDialog.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import type { IArchiveLocation } from '@shared/types';

const store = useArchiveStore();

const showDialog = ref(false);
const editLocation = ref<IArchiveLocation | null>(null);
const showDeleteConfirm = ref(false);
const deleteTarget = ref<IArchiveLocation | null>(null);
const testingId = ref<number | null>(null);
const testResults = ref<Record<number, { ok: boolean; message: string }>>({});

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function openCreate(): void {
  editLocation.value = null;
  showDialog.value = true;
}

function openEdit(location: IArchiveLocation): void {
  editLocation.value = location;
  showDialog.value = true;
}

function confirmDelete(location: IArchiveLocation): void {
  deleteTarget.value = location;
  showDeleteConfirm.value = true;
}

async function handleDelete(): Promise<void> {
  if (!deleteTarget.value) return;
  await store.deleteLocation(deleteTarget.value.id);
  showDeleteConfirm.value = false;
}

async function toggleEnabled(location: IArchiveLocation): Promise<void> {
  await store.updateLocation(location.id, { enabled: !location.enabled });
}

async function testConnection(location: IArchiveLocation): Promise<void> {
  testingId.value = location.id;
  const result = await store.testLocation(location.id);
  testResults.value[location.id] = result;
  testingId.value = null;

  // Clear result after 5 seconds
  setTimeout(() => {
    delete testResults.value[location.id];
  }, 5000);
}

function locationIcon(type: string): string {
  switch (type) {
    case 'local': return 'mdi-harddisk';
    case 'smb': return 'mdi-server-network';
    case 's3': return 'mdi-cloud';
    default: return 'mdi-tape-drive';
  }
}
</script>

<template>
  <div class="locations-panel">
    <div class="locations-panel__header">
      <div class="locations-panel__title">Storage Locations</div>
      <v-btn color="primary" size="small" @click="openCreate">
        <v-icon start size="16">mdi-plus</v-icon>
        Add Location
      </v-btn>
    </div>

    <div v-if="store.locations.length > 0" class="locations-panel__grid">
      <div
        v-for="location in store.locations"
        :key="location.id"
        class="locations-panel__card"
      >
        <div class="locations-panel__card-header">
          <v-icon
            :color="location.enabled ? 'deep-purple' : 'grey'"
            class="mr-2"
            size="20"
          >
            {{ locationIcon(location.type) }}
          </v-icon>
          <span class="locations-panel__card-name">{{ location.name }}</span>
          <v-spacer />
          <v-chip
            :color="location.enabled ? 'success' : 'grey'"
            size="x-small"
            variant="tonal"
          >
            {{ location.enabled ? 'Active' : 'Disabled' }}
          </v-chip>
        </div>

        <div class="locations-panel__card-body">
          <div v-if="location.description" class="locations-panel__description">
            {{ location.description }}
          </div>

          <div class="locations-panel__stats">
            <div>
              <span class="locations-panel__stats-label">Files:</span>
              <span class="locations-panel__stats-value">{{ location.fileCount.toLocaleString() }}</span>
            </div>
            <div>
              <span class="locations-panel__stats-label">Size:</span>
              <span class="locations-panel__stats-value">{{ formatSize(location.totalSize) }}</span>
            </div>
          </div>

          <div class="locations-panel__type">
            Type: {{ location.type.toUpperCase() }}
            <span class="ml-3">Priority: {{ location.priority }}</span>
          </div>

          <!-- Test result -->
          <v-alert
            v-if="testResults[location.id]"
            :type="testResults[location.id].ok ? 'success' : 'error'"
            variant="tonal"
            density="compact"
            class="mt-2"
            closable
            @click:close="delete testResults[location.id]"
          >
            {{ testResults[location.id].message }}
          </v-alert>
        </div>

        <div class="locations-panel__card-actions">
          <v-btn
            variant="text"
            size="small"
            :color="location.enabled ? 'warning' : 'success'"
            @click="toggleEnabled(location)"
          >
            {{ location.enabled ? 'Disable' : 'Enable' }}
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            color="info"
            :loading="testingId === location.id"
            @click="testConnection(location)"
          >
            Test
          </v-btn>
          <v-spacer />
          <v-btn variant="text" size="small" @click="openEdit(location)">
            <v-icon size="18">mdi-pencil</v-icon>
          </v-btn>
          <v-btn variant="text" size="small" color="error" @click="confirmDelete(location)">
            <v-icon size="18">mdi-delete</v-icon>
          </v-btn>
        </div>
      </div>
    </div>

    <div v-else class="locations-panel__empty">
      <v-icon size="48" color="grey" class="mb-3">mdi-archive-off</v-icon>
      <div class="locations-panel__empty-title">No archive locations configured</div>
      <div class="locations-panel__empty-subtitle">
        Create an archive location to start archiving files
      </div>
      <v-btn color="primary" class="mt-4" @click="openCreate">
        <v-icon start>mdi-plus</v-icon>
        Add Location
      </v-btn>
    </div>

    <ArchiveLocationDialog
      v-model="showDialog"
      :edit-location="editLocation"
      @saved="store.fetchLocations()"
    />

    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Delete Archive Location"
      :message="`Delete archive location '${deleteTarget?.name}'? This cannot be undone.`"
      confirm-text="Delete"
      confirm-color="error"
      @confirm="handleDelete"
    />
  </div>
</template>

<style scoped lang="scss">
.locations-panel {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  &__title {
    font-size: 16px;
    font-weight: 500;
    color: #e5e7eb;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;

    @include phone {
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }

  &__card {
    background-color: #22252d;
    border: 1px solid rgba(55, 65, 81, 0.3);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
  }

  &__card-header {
    display: flex;
    align-items: center;
    padding: 12px 16px 4px;
  }

  &__card-name {
    font-size: 14px;
    font-weight: 500;
    color: #e5e7eb;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__card-body {
    padding: 4px 16px 12px;
    flex: 1;
  }

  &__description {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 8px;
  }

  &__stats {
    display: flex;
    gap: 16px;
    font-size: 13px;
    margin-bottom: 8px;
  }

  &__stats-label {
    color: #6b7280;
  }

  &__stats-value {
    color: #e5e7eb;
    font-weight: 500;
    margin-left: 4px;
  }

  &__type {
    font-size: 12px;
    color: #6b7280;
  }

  &__card-actions {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    border-top: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__empty {
    background-color: #22252d;
    border: 1px solid rgba(55, 65, 81, 0.3);
    border-radius: 8px;
    padding: 48px;
    text-align: center;
  }

  &__empty-title {
    font-size: 14px;
    color: #9ca3af;
    margin-bottom: 4px;
  }

  &__empty-subtitle {
    font-size: 13px;
    color: #6b7280;
  }
}
</style>
