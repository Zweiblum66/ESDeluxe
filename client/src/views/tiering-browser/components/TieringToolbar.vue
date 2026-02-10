<script setup lang="ts">
import type { IFileEntry } from '@shared/types';

interface Props {
  selectedEntries: IFileEntry[];
  isLoading: boolean;
  isAdmin?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'set-goal': [];
  refresh: [];
}>();
</script>

<template>
  <div class="tiering-toolbar">
    <div class="tiering-toolbar__left">
      <span v-if="props.selectedEntries.length > 0" class="text-body-2 text-medium-emphasis">
        {{ props.selectedEntries.length }} selected
      </span>
    </div>
    <div class="tiering-toolbar__right">
      <v-btn
        v-if="props.selectedEntries.length > 0 && props.isAdmin !== false"
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-target"
        @click="emit('set-goal')"
      >
        Set Goal
      </v-btn>
      <v-btn
        icon="mdi-refresh"
        variant="text"
        size="small"
        :loading="props.isLoading"
        title="Refresh"
        @click="emit('refresh')"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.tiering-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 4px 0;
  gap: 8px;

  &__left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 4px;
  }
}
</style>
