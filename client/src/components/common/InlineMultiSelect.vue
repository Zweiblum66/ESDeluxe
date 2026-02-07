<script setup lang="ts">
import { ref, computed } from 'vue';

export interface InlineMultiSelectItem {
  value: string;
  title: string;
  subtitle?: string;
}

const props = withDefaults(
  defineProps<{
    items: InlineMultiSelectItem[];
    loading?: boolean;
    searchPlaceholder?: string;
    noDataText?: string;
    icon?: string;
    maxHeight?: string;
    isAdding?: boolean;
  }>(),
  {
    loading: false,
    searchPlaceholder: 'Search...',
    noDataText: 'No items available',
    icon: undefined,
    maxHeight: '240px',
    isAdding: false,
  },
);

const emit = defineEmits<{
  add: [selectedValues: string[]];
  cancel: [];
}>();

const searchQuery = ref('');
const selectedValues = ref<string[]>([]);

const filteredItems = computed(() => {
  if (!searchQuery.value) return props.items;
  const query = searchQuery.value.toLowerCase();
  return props.items.filter(
    (item) =>
      item.title.toLowerCase().includes(query) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(query)),
  );
});

const addButtonLabel = computed(() => {
  const count = selectedValues.value.length;
  if (count === 0) return 'Add Selected';
  return `Add ${count} Selected`;
});

function reset(): void {
  searchQuery.value = '';
  selectedValues.value = [];
}

function handleAdd(): void {
  if (selectedValues.value.length === 0) return;
  emit('add', [...selectedValues.value]);
}

function handleCancel(): void {
  reset();
  emit('cancel');
}

defineExpose({ reset });
</script>

<template>
  <v-card variant="outlined" class="inline-multi-select mt-2">
    <v-card-text class="pa-3">
      <v-text-field
        v-model="searchQuery"
        :placeholder="searchPlaceholder"
        variant="outlined"
        density="compact"
        prepend-inner-icon="mdi-magnify"
        hide-details
        clearable
        class="mb-2"
      />

      <v-list
        density="compact"
        class="inline-multi-select__list"
        :style="{ maxHeight: maxHeight }"
      >
        <template v-if="loading">
          <v-list-item>
            <template #prepend>
              <v-progress-circular indeterminate size="20" width="2" class="mr-2" />
            </template>
            <v-list-item-title class="text-medium-emphasis">Loading...</v-list-item-title>
          </v-list-item>
        </template>

        <template v-else-if="filteredItems.length === 0">
          <v-list-item>
            <v-list-item-title class="text-medium-emphasis text-body-2">
              {{ items.length === 0 ? noDataText : 'No matches found' }}
            </v-list-item-title>
          </v-list-item>
        </template>

        <template v-else>
          <v-list-item
            v-for="item in filteredItems"
            :key="item.value"
            :value="item.value"
            density="compact"
            @click="
              selectedValues.includes(item.value)
                ? (selectedValues = selectedValues.filter((v) => v !== item.value))
                : selectedValues.push(item.value)
            "
          >
            <template #prepend>
              <v-checkbox-btn
                :model-value="selectedValues.includes(item.value)"
                density="compact"
                color="primary"
                @update:model-value="
                  (checked: boolean) =>
                    checked
                      ? selectedValues.push(item.value)
                      : (selectedValues = selectedValues.filter((v) => v !== item.value))
                "
                @click.stop
              />
            </template>
            <template #default>
              <v-list-item-title>
                <v-icon v-if="icon" :icon="icon" size="small" class="mr-1" />
                {{ item.title }}
              </v-list-item-title>
              <v-list-item-subtitle v-if="item.subtitle">
                {{ item.subtitle }}
              </v-list-item-subtitle>
            </template>
          </v-list-item>
        </template>
      </v-list>
    </v-card-text>

    <v-card-actions class="pt-0 px-3 pb-3">
      <slot name="actions-prepend" />
      <v-spacer />
      <v-btn size="small" variant="text" @click="handleCancel">Cancel</v-btn>
      <v-btn
        size="small"
        variant="tonal"
        color="primary"
        :loading="isAdding"
        :disabled="selectedValues.length === 0 || isAdding"
        @click="handleAdd"
      >
        {{ addButtonLabel }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<style scoped lang="scss">
.inline-multi-select__list {
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}
</style>
