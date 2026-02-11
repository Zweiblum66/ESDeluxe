<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useArchiveStore } from '@/stores/archive.store';
import type { IFileEntry } from '@shared/types';

const props = defineProps<{
  modelValue: boolean;
  entries: IFileEntry[];
  spaceName: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  archived: [];
}>();

const archiveStore = useArchiveStore();
const selectedLocationId = ref<number | null>(null);
const isArchiving = ref(false);
const result = ref<{ succeeded: number; failed: number } | null>(null);

const enabledLocations = computed(() =>
  archiveStore.locations.filter((l) => l.enabled),
);

const fileCount = computed(() =>
  props.entries.filter((e) => e.type === 'file' && !e.isArchiveStub).length,
);

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

const totalSize = computed(() => {
  return props.entries
    .filter((e) => e.type === 'file' && !e.isArchiveStub)
    .reduce((sum, e) => sum + e.size, 0);
});

function close(): void {
  result.value = null;
  emit('update:modelValue', false);
}

async function handleArchive(): Promise<void> {
  if (!selectedLocationId.value) return;
  isArchiving.value = true;
  result.value = null;

  const filePaths = props.entries
    .filter((e) => e.type === 'file' && !e.isArchiveStub)
    .map((e) => e.path);

  const res = await archiveStore.archiveFiles(
    props.spaceName,
    filePaths,
    selectedLocationId.value,
  );

  isArchiving.value = false;

  if (res) {
    result.value = { succeeded: res.succeeded.length, failed: res.failed.length };
    if (res.failed.length === 0) {
      emit('archived');
      close();
    }
  }
}

onMounted(() => {
  if (archiveStore.locations.length === 0) {
    archiveStore.fetchLocations();
  }
});
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="500" persistent>
    <v-card class="bg-grey-darken-4">
      <v-card-title class="d-flex align-center pa-4">
        <v-icon class="mr-2" color="deep-purple">mdi-archive-arrow-up</v-icon>
        Archive Files
      </v-card-title>

      <v-card-text class="px-4 pb-2">
        <div class="text-body-2 mb-3">
          Archive <strong>{{ fileCount }}</strong> file(s) ({{ formatSize(totalSize) }}) to an archive location.
          The original files will be replaced with small stub placeholders.
        </div>

        <v-select
          v-model="selectedLocationId"
          :items="enabledLocations.map(l => ({ title: l.name, value: l.id }))"
          label="Archive Location"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          :no-data-text="'No archive locations configured'"
        />

        <!-- File list preview -->
        <div class="text-caption text-grey mb-1">Files to archive:</div>
        <div class="archive-file-list mb-3">
          <div
            v-for="entry in entries.filter(e => e.type === 'file' && !e.isArchiveStub)"
            :key="entry.path"
            class="archive-file-list__item"
          >
            <v-icon size="16" color="grey" class="mr-1">mdi-file</v-icon>
            <span class="text-truncate">{{ entry.name }}</span>
            <v-spacer />
            <span class="text-caption text-grey ml-2">{{ formatSize(entry.size) }}</span>
          </div>
        </div>

        <!-- Result -->
        <v-alert v-if="result && result.failed > 0" type="warning" variant="tonal" density="compact" class="mb-2">
          {{ result.succeeded }} archived, {{ result.failed }} failed
        </v-alert>

        <v-alert v-if="archiveStore.error" type="error" variant="tonal" density="compact" class="mb-2">
          {{ archiveStore.error }}
        </v-alert>
      </v-card-text>

      <v-card-actions class="pa-4 pt-2">
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="deep-purple"
          variant="flat"
          :loading="isArchiving"
          :disabled="!selectedLocationId || fileCount === 0"
          @click="handleArchive"
        >
          Archive {{ fileCount }} File(s)
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.archive-file-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid rgba(55, 65, 81, 0.3);
  border-radius: 6px;
  padding: 4px 0;

  &__item {
    display: flex;
    align-items: center;
    padding: 4px 10px;
    font-size: 13px;
    color: #d1d5db;
  }
}
</style>
