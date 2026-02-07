<script setup lang="ts">
import { ref, computed, watch } from 'vue';

interface Column {
  key: string;
  title: string;
  sortable?: boolean;
  width?: string;
  align?: 'start' | 'center' | 'end';
}

interface Props {
  columns: Column[];
  items: Record<string, unknown>[];
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  selectable?: boolean;
  selected?: string[];
  itemKey?: string;
  noDataText?: string;
  density?: 'default' | 'comfortable' | 'compact';
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  searchable: true,
  searchPlaceholder: 'Search...',
  selectable: false,
  selected: () => [],
  itemKey: 'id',
  noDataText: 'No data available',
  density: 'comfortable',
});

const emit = defineEmits<{
  'click:row': [item: Record<string, unknown>];
  'update:selected': [value: string[]];
}>();

function handleRowClick(event: Event, row: { item: Record<string, unknown> }) {
  // Don't open detail when clicking the checkbox column
  const target = event.target as HTMLElement;
  if (target.closest('.v-selection-control, .v-checkbox, .v-data-table__td--select-row')) return;
  emit('click:row', row.item);
}

const search = ref('');

// Internal selection model bound to Vuetify's v-data-table
const internalSelected = ref<string[]>([...props.selected]);

// Sync parent → internal when parent changes
watch(
  () => props.selected,
  (newVal) => {
    if (JSON.stringify(newVal) !== JSON.stringify(internalSelected.value)) {
      internalSelected.value = [...newVal];
    }
  },
);

// Sync internal → parent when user selects/deselects
watch(internalSelected, (newVal) => {
  if (JSON.stringify(newVal) !== JSON.stringify(props.selected)) {
    emit('update:selected', [...newVal]);
  }
});

function clearSelection(): void {
  internalSelected.value = [];
}

const headers = computed(() => {
  return props.columns.map((col) => ({
    key: col.key,
    title: col.title,
    sortable: col.sortable !== false,
    width: col.width,
    align: col.align || 'start',
  }));
});

const filteredItems = computed(() => {
  if (!search.value) return props.items;

  const query = search.value.toLowerCase();
  return props.items.filter((item) =>
    Object.values(item).some(
      (val) => val != null && String(val).toLowerCase().includes(query)
    )
  );
});
</script>

<template>
  <div class="data-table-wrapper">
    <!-- Search bar -->
    <div v-if="searchable" class="data-table-wrapper__toolbar">
      <v-text-field
        v-model="search"
        :placeholder="searchPlaceholder"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        hide-details
        clearable
        single-line
        class="data-table-wrapper__search"
      />
      <slot name="toolbar-actions" />
    </div>

    <!-- Bulk action bar -->
    <div v-if="selectable && internalSelected.length > 0" class="data-table-wrapper__bulk-bar">
      <v-icon size="small" class="mr-2">mdi-checkbox-marked</v-icon>
      <span class="text-body-2 font-weight-medium">
        {{ internalSelected.length }} {{ internalSelected.length === 1 ? 'item' : 'items' }} selected
      </span>
      <v-btn size="small" variant="text" class="ml-2" @click="clearSelection">
        Clear
      </v-btn>
      <v-spacer />
      <slot name="bulk-actions" :selected="internalSelected" :count="internalSelected.length" />
    </div>

    <!-- Data table -->
    <v-data-table
      v-model="internalSelected"
      :headers="headers"
      :items="filteredItems"
      :loading="loading"
      :show-select="selectable"
      :item-value="itemKey"
      :density="density"
      :no-data-text="noDataText"
      hover
      class="data-table-wrapper__table"
      @click:row="handleRowClick"
    >
      <!-- Pass through all slots -->
      <template v-for="(_, name) in $slots" :key="name" #[name]="slotData">
        <slot :name="name" v-bind="slotData || {}" />
      </template>
    </v-data-table>
  </div>
</template>

<style scoped lang="scss">
.data-table-wrapper {
  &__toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  &__search {
    max-width: 320px;
  }

  &__bulk-bar {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    margin-bottom: 8px;
    border-radius: 8px;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
  }

  &__table {
    background-color: transparent !important;
    border-radius: 8px;
    overflow: hidden;
  }
}

:deep(.v-data-table) {
  background: #22252d !important;

  .v-data-table__thead {
    background: #2a2d35;
  }

  .v-data-table__thead th {
    color: #9ca3af !important;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid rgba(55, 65, 81, 0.3) !important;
  }

  .v-data-table__tr {
    &:hover {
      background-color: rgba(59, 130, 246, 0.06) !important;
    }
  }

  .v-data-table__td {
    border-bottom: 1px solid rgba(55, 65, 81, 0.2) !important;
    font-size: 14px;
  }
}
</style>
