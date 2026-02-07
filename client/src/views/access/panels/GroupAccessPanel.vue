<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAccessStore } from '@/stores/access.store';
import { useSpacesStore } from '@/stores/spaces.store';
import InlineMultiSelect from '@/components/common/InlineMultiSelect.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import type { InlineMultiSelectItem } from '@/components/common/InlineMultiSelect.vue';

const store = useAccessStore();
const spacesStore = useSpacesStore();

const groupName = computed(() => store.selectedEntity ?? '');

// --- Add Spaces ---
const showAddSpacePanel = ref(false);
const addSpaceReadonly = ref(false);
const isAddingSpaces = ref(false);
const addSpacePanelRef = ref<InstanceType<typeof InlineMultiSelect> | null>(null);

function toggleAddSpacePanel(): void {
  showAddSpacePanel.value = !showAddSpacePanel.value;
  if (showAddSpacePanel.value) {
    addSpaceReadonly.value = false;
    if (spacesStore.spaces.length === 0) spacesStore.fetchSpaces();
    addSpacePanelRef.value?.reset();
  }
}

function availableSpaces(): InlineMultiSelectItem[] {
  if (!store.groupDetail) return [];
  const currentSpaces = new Set(store.groupDetail.spaces.map((s) => s.spaceName));
  return spacesStore.spaces
    .filter((s) => !currentSpaces.has(s.name))
    .map((s) => ({ value: s.name, title: s.name }));
}

async function handleAddSpaces(spaceNames: string[]): Promise<void> {
  isAddingSpaces.value = true;
  for (const spaceName of spaceNames) {
    await store.addGroupToSpace(spaceName, groupName.value, addSpaceReadonly.value);
  }
  isAddingSpaces.value = false;
  showAddSpacePanel.value = false;
}

// --- Toggle Access ---
async function handleToggleAccess(spaceName: string, currentAccess: string): Promise<void> {
  const newReadonly = currentAccess !== 'readonly';
  await store.setGroupAccess(spaceName, groupName.value, newReadonly);
}

// --- Remove Space ---
const showRemoveConfirm = ref(false);
const removeTarget = ref('');

function confirmRemoveSpace(spaceName: string): void {
  removeTarget.value = spaceName;
  showRemoveConfirm.value = true;
}

async function handleRemoveSpace(): Promise<void> {
  await store.removeGroupFromSpace(removeTarget.value, groupName.value);
  showRemoveConfirm.value = false;
}

// --- Expanded rows (show inheriting users) ---
const expandedSpaces = ref<string[]>([]);

// --- Members ---
const members = computed(() => {
  return store.groupDetail?.users ?? [];
});
</script>

<template>
  <div class="group-access-panel">
    <!-- Header -->
    <div class="d-flex align-center mb-4">
      <v-icon class="mr-2">mdi-account-group</v-icon>
      <span class="text-h6">{{ groupName }}</span>
      <v-chip size="small" variant="tonal" label class="ml-2">
        {{ members.length }} {{ members.length === 1 ? 'member' : 'members' }}
      </v-chip>
    </div>

    <!-- Section 1: Space Access -->
    <div class="d-flex align-center mb-2">
      <div class="text-subtitle-2">
        <v-icon size="small" class="mr-1">mdi-folder-multiple</v-icon>
        Space Access ({{ store.groupAccessRows.length }})
      </div>
      <v-spacer />
      <v-btn
        size="small"
        variant="tonal"
        :color="showAddSpacePanel ? undefined : 'primary'"
        :prepend-icon="showAddSpacePanel ? 'mdi-close' : 'mdi-folder-plus'"
        @click="toggleAddSpacePanel"
      >
        {{ showAddSpacePanel ? 'Cancel' : 'Add Space' }}
      </v-btn>
    </div>

    <!-- Add Spaces Panel -->
    <InlineMultiSelect
      v-if="showAddSpacePanel"
      ref="addSpacePanelRef"
      :items="availableSpaces()"
      :loading="spacesStore.isLoading"
      search-placeholder="Filter spaces..."
      no-data-text="No available spaces"
      icon="mdi-folder-network"
      :is-adding="isAddingSpaces"
      class="mb-4"
      @add="handleAddSpaces"
      @cancel="showAddSpacePanel = false"
    >
      <template #actions-prepend>
        <v-switch
          v-model="addSpaceReadonly"
          label="Read-only"
          color="warning"
          density="compact"
          hide-details
          class="mr-4"
        />
      </template>
    </InlineMultiSelect>

    <!-- Space Access Table -->
    <v-data-table
      v-if="store.groupAccessRows.length"
      v-model:expanded="expandedSpaces"
      :headers="[
        { title: 'Space', key: 'spaceName', sortable: true },
        { title: 'Access Type', key: 'accessType', sortable: true },
        { title: 'Inheriting Users', key: 'inheritingUsers', sortable: false },
        { title: 'Actions', key: 'actions', sortable: false, align: 'end' },
      ]"
      :items="store.groupAccessRows"
      item-value="spaceName"
      density="compact"
      class="mb-6 access-table"
      :items-per-page="-1"
      hide-default-footer
      show-expand
    >
      <template #item.spaceName="{ item }">
        <v-icon size="small" class="mr-1">mdi-folder-network</v-icon>
        {{ item.spaceName }}
      </template>
      <template #item.accessType="{ item }">
        <v-btn
          size="x-small"
          variant="tonal"
          :color="item.accessType === 'readonly' ? 'warning' : 'success'"
          @click="handleToggleAccess(item.spaceName, item.accessType)"
        >
          <v-icon size="x-small" class="mr-1">
            {{ item.accessType === 'readonly' ? 'mdi-eye-outline' : 'mdi-pencil' }}
          </v-icon>
          {{ item.accessType }}
        </v-btn>
      </template>
      <template #item.inheritingUsers="{ item }">
        {{ item.inheritingUsers.length }} {{ item.inheritingUsers.length === 1 ? 'user' : 'users' }}
      </template>
      <template #item.actions="{ item }">
        <v-btn
          icon="mdi-close"
          size="x-small"
          variant="text"
          color="error"
          title="Remove group from space"
          @click="confirmRemoveSpace(item.spaceName)"
        />
      </template>
      <template #expanded-row="{ columns, item }">
        <tr class="expanded-row">
          <td :colspan="columns.length" class="pa-0">
            <div class="expanded-users">
              <v-chip
                v-for="user in item.inheritingUsers"
                :key="user"
                size="x-small"
                variant="tonal"
                label
                class="mr-1 mb-1"
              >
                <v-icon start size="x-small">mdi-account</v-icon>
                {{ user }}
              </v-chip>
            </div>
          </td>
        </tr>
      </template>
    </v-data-table>
    <div v-else class="text-body-2 text-medium-emphasis mb-6">No space access</div>

    <v-divider class="mb-4" />

    <!-- Section 2: Members -->
    <div class="text-subtitle-2 mb-2">
      <v-icon size="small" class="mr-1">mdi-account-multiple</v-icon>
      Members ({{ members.length }})
    </div>

    <div v-if="members.length">
      <v-chip
        v-for="user in members"
        :key="user"
        size="small"
        variant="tonal"
        label
        class="mr-2 mb-1"
      >
        <v-icon start size="small">mdi-account</v-icon>
        {{ user }}
      </v-chip>
    </div>
    <div v-else class="text-body-2 text-medium-emphasis">No members</div>

    <!-- Remove Space Confirm -->
    <ConfirmDialog
      v-model="showRemoveConfirm"
      title="Remove Space Access"
      :message="`Remove group '${groupName}' from space '${removeTarget}'?`"
      confirm-text="Remove"
      confirm-color="error"
      @confirm="handleRemoveSpace"
    />
  </div>
</template>

<style scoped lang="scss">
.group-access-panel {
  padding: 4px;
}

.access-table {
  background: #22252d !important;
  border-radius: 8px;

  :deep(th) {
    color: #9ca3af !important;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
}

.expanded-row {
  background: rgba(59, 130, 246, 0.04) !important;

  &:hover {
    background: rgba(59, 130, 246, 0.04) !important;
  }
}

.expanded-users {
  padding: 8px 16px 8px 40px;
}
</style>
