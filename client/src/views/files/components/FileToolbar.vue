<script setup lang="ts">
import type { IFileEntry } from '@shared/types';

interface Props {
  selectedEntries: IFileEntry[];
  isLoading: boolean;
  canWrite?: boolean;
  isAdmin?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'create-folder': [];
  upload: [];
  download: [];
  rename: [];
  move: [];
  delete: [];
  refresh: [];
  archive: [];
}>();

const hasSelection = computed(() => props.selectedEntries.length > 0);
const singleSelection = computed(() => props.selectedEntries.length === 1);
const hasFileSelection = computed(() =>
  props.selectedEntries.some((e) => e.type === 'file'),
);
const hasNonStubFiles = computed(() =>
  props.selectedEntries.some((e) => e.type === 'file' && !e.isArchiveStub),
);

import { computed } from 'vue';
</script>

<template>
  <div class="file-toolbar">
    <div class="file-toolbar__left">
      <v-btn
        v-if="props.canWrite !== false"
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-folder-plus"
        @click="emit('create-folder')"
      >
        New Folder
      </v-btn>
      <v-btn
        v-if="props.canWrite !== false"
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-upload"
        @click="emit('upload')"
      >
        Upload
      </v-btn>
    </div>

    <div class="file-toolbar__right">
      <v-btn
        v-if="hasFileSelection"
        size="small"
        variant="tonal"
        prepend-icon="mdi-download"
        @click="emit('download')"
      >
        Download
      </v-btn>
      <v-btn
        v-if="singleSelection && props.canWrite !== false"
        size="small"
        variant="tonal"
        prepend-icon="mdi-rename-box"
        @click="emit('rename')"
      >
        Rename
      </v-btn>
      <v-btn
        v-if="hasSelection && props.canWrite !== false"
        size="small"
        variant="tonal"
        prepend-icon="mdi-file-move"
        @click="emit('move')"
      >
        Move
      </v-btn>
      <v-btn
        v-if="hasNonStubFiles && props.canWrite !== false"
        size="small"
        variant="tonal"
        color="deep-purple"
        prepend-icon="mdi-archive-arrow-up"
        @click="emit('archive')"
      >
        Archive
      </v-btn>
      <v-btn
        v-if="hasSelection && props.canWrite !== false"
        size="small"
        variant="tonal"
        color="error"
        prepend-icon="mdi-delete"
        @click="emit('delete')"
      >
        Delete{{ props.selectedEntries.length > 1 ? ` (${props.selectedEntries.length})` : '' }}
      </v-btn>
      <v-btn
        icon="mdi-refresh"
        size="small"
        variant="text"
        :loading="props.isLoading"
        @click="emit('refresh')"
        title="Refresh"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.file-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  gap: 8px;

  @include phone {
    flex-wrap: wrap;
  }

  &__left,
  &__right {
    display: flex;
    align-items: center;
    gap: 8px;

    @include phone {
      gap: 4px;
      flex-wrap: wrap;
    }
  }
}

// Icon-only buttons on phone
@include phone {
  .file-toolbar :deep(.v-btn .v-btn__prepend + .v-btn__content) {
    display: none;
  }
  .file-toolbar :deep(.v-btn .v-btn__prepend) {
    margin-right: 0;
  }
}
</style>
