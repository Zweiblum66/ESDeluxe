<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { IFileEntry, ISpace } from '@shared/types';
import SpaceTree from './SpaceTree.vue';

interface Props {
  modelValue: boolean;
  entries: IFileEntry[];
  currentSpace: string;
  spaces: ISpace[];
  isMoving: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  move: [destinationSpace: string, destinationPath: string];
}>();

// --- Destination selection state ---
const destSpace = ref<string | null>(null);
const destPath = ref<string>('');

const destinationLabel = computed(() => {
  if (!destSpace.value) return '';
  if (!destPath.value) return destSpace.value;
  return `${destSpace.value} / ${destPath.value.replace(/\//g, ' / ')}`;
});

const isSameLocation = computed(() => {
  return destSpace.value === props.currentSpace && destPath.value === (props.entries[0]?.path?.split('/').slice(0, -1).join('/') || '');
});

const canMove = computed(() => {
  return destSpace.value && !isSameLocation.value && !props.isMoving;
});

function handleSelect(spaceName: string, path: string): void {
  destSpace.value = spaceName;
  destPath.value = path;
}

function handleMove(): void {
  if (!destSpace.value) return;
  emit('move', destSpace.value, destPath.value);
}

function handleClose(): void {
  emit('update:modelValue', false);
}

// Reset selection when dialog opens
watch(() => props.modelValue, (open) => {
  if (open) {
    destSpace.value = null;
    destPath.value = '';
  }
});
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="560"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card class="move-dialog">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-file-move</v-icon>
        Move {{ entries.length }} item{{ entries.length !== 1 ? 's' : '' }}
      </v-card-title>

      <v-card-text>
        <!-- Source info -->
        <div class="move-dialog__source mb-3">
          <div class="text-caption text-medium-emphasis mb-1">Moving from {{ currentSpace }}:</div>
          <div class="move-dialog__file-list">
            <v-chip
              v-for="entry in entries.slice(0, 5)"
              :key="entry.path"
              size="small"
              variant="tonal"
              :prepend-icon="entry.type === 'directory' ? 'mdi-folder' : 'mdi-file'"
              class="mr-1 mb-1"
            >
              {{ entry.name }}
            </v-chip>
            <v-chip v-if="entries.length > 5" size="small" variant="outlined" class="mb-1">
              +{{ entries.length - 5 }} more
            </v-chip>
          </div>
        </div>

        <!-- Destination picker -->
        <div class="text-caption text-medium-emphasis mb-1">Select destination:</div>
        <div class="move-dialog__tree">
          <SpaceTree
            :spaces="spaces"
            :current-space="currentSpace"
            :current-path="''"
            :selection-mode="true"
            @select="handleSelect"
          />
        </div>

        <!-- Selected destination -->
        <div v-if="destSpace" class="move-dialog__dest mt-3">
          <v-icon size="16" class="mr-1">mdi-arrow-right</v-icon>
          <span class="text-caption">Destination: </span>
          <span class="text-caption font-weight-medium" :class="{ 'text-warning': isSameLocation }">
            {{ destinationLabel }}
          </span>
          <span v-if="isSameLocation" class="text-caption text-warning ml-1">(same location)</span>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="handleClose" :disabled="isMoving">Cancel</v-btn>
        <v-btn
          color="primary"
          :loading="isMoving"
          :disabled="!canMove"
          @click="handleMove"
        >
          Move Here
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.move-dialog {
  &__source {
    padding: 8px 12px;
    background-color: rgba(55, 65, 81, 0.2);
    border-radius: 6px;
  }

  &__file-list {
    display: flex;
    flex-wrap: wrap;
  }

  &__tree {
    border: 1px solid rgba(55, 65, 81, 0.3);
    border-radius: 6px;
    overflow: hidden;
    background-color: #1e2028;
  }

  &__dest {
    display: flex;
    align-items: center;
    padding: 6px 10px;
    background-color: rgba(59, 130, 246, 0.08);
    border-radius: 4px;
  }
}
</style>
