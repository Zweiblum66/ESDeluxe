<script setup lang="ts">
import { ref, computed } from 'vue';
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
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <div class="text-h6 font-weight-medium">Storage Locations</div>
      <v-spacer />
      <v-btn color="deep-purple" variant="flat" size="small" @click="openCreate">
        <v-icon start>mdi-plus</v-icon>
        Add Location
      </v-btn>
    </div>

    <v-row v-if="store.locations.length > 0">
      <v-col
        v-for="location in store.locations"
        :key="location.id"
        cols="12"
        sm="6"
        lg="4"
      >
        <v-card class="bg-grey-darken-4 h-100" variant="outlined">
          <v-card-title class="d-flex align-center pa-3 pb-1">
            <v-icon
              :color="location.enabled ? 'deep-purple' : 'grey'"
              class="mr-2"
              size="20"
            >
              {{ location.type === 'local' ? 'mdi-harddisk' : location.type === 'smb' ? 'mdi-server-network' : location.type === 's3' ? 'mdi-cloud' : 'mdi-tape-drive' }}
            </v-icon>
            <span class="text-body-1 font-weight-medium text-truncate">{{ location.name }}</span>
            <v-spacer />
            <v-chip
              :color="location.enabled ? 'success' : 'grey'"
              size="x-small"
              variant="tonal"
            >
              {{ location.enabled ? 'Active' : 'Disabled' }}
            </v-chip>
          </v-card-title>

          <v-card-text class="pa-3 pt-1">
            <div v-if="location.description" class="text-caption text-grey mb-2">
              {{ location.description }}
            </div>

            <div class="d-flex gap-4 text-body-2 mb-2">
              <div>
                <span class="text-grey-lighten-1">Files:</span>
                <span class="ml-1 font-weight-medium">{{ location.fileCount.toLocaleString() }}</span>
              </div>
              <div>
                <span class="text-grey-lighten-1">Size:</span>
                <span class="ml-1 font-weight-medium">{{ formatSize(location.totalSize) }}</span>
              </div>
            </div>

            <div class="text-caption text-grey">
              Type: {{ location.type.toUpperCase() }}
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
          </v-card-text>

          <v-divider />

          <v-card-actions class="pa-2">
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
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-card v-else class="bg-grey-darken-4 pa-8 text-center" variant="outlined">
      <v-icon size="48" color="grey" class="mb-3">mdi-archive-off</v-icon>
      <div class="text-body-1 text-grey mb-2">No archive locations configured</div>
      <div class="text-body-2 text-grey-darken-1 mb-4">
        Create an archive location to start archiving files
      </div>
      <v-btn color="deep-purple" variant="flat" @click="openCreate">
        <v-icon start>mdi-plus</v-icon>
        Add Location
      </v-btn>
    </v-card>

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
