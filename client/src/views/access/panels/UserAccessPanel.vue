<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAccessStore } from '@/stores/access.store';
import { useSpacesStore } from '@/stores/spaces.store';
import EffectiveAccessChip from '../components/EffectiveAccessChip.vue';
import AccessSourceLabel from '../components/AccessSourceLabel.vue';
import InlineMultiSelect from '@/components/common/InlineMultiSelect.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import type { InlineMultiSelectItem } from '@/components/common/InlineMultiSelect.vue';

const store = useAccessStore();
const spacesStore = useSpacesStore();

const username = computed(() => store.selectedEntity ?? '');

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
  if (!store.userDetail) return [];
  // Exclude spaces the user already has direct access to
  const currentSpaces = new Set(store.userDetail.spaces.map((s) => s.spaceName));
  return spacesStore.spaces
    .filter((s) => !currentSpaces.has(s.name))
    .map((s) => ({ value: s.name, title: s.name }));
}

async function handleAddSpaces(spaceNames: string[]): Promise<void> {
  isAddingSpaces.value = true;
  for (const spaceName of spaceNames) {
    await store.addUserToSpace(spaceName, username.value, addSpaceReadonly.value);
  }
  isAddingSpaces.value = false;
  showAddSpacePanel.value = false;
}

// --- Toggle Access ---
async function handleToggleAccess(spaceName: string, currentAccess: string): Promise<void> {
  const newReadonly = currentAccess !== 'readonly';
  await store.setUserAccess(spaceName, username.value, newReadonly);
}

// --- Remove Space ---
const showRemoveConfirm = ref(false);
const removeTarget = ref('');

function confirmRemoveSpace(spaceName: string): void {
  removeTarget.value = spaceName;
  showRemoveConfirm.value = true;
}

async function handleRemoveSpace(): Promise<void> {
  await store.removeUserFromSpace(removeTarget.value, username.value);
  showRemoveConfirm.value = false;
}

// --- Group Memberships ---
const groupMemberships = computed(() => {
  return store.userDetail?.groups ?? [];
});

// --- Reset Override ---
async function handleResetOverride(spaceName: string): Promise<void> {
  await store.resetUserOverride(spaceName, username.value);
}

// Check if user has an override for this space
function hasOverride(row: typeof store.userAccessRows[number]): boolean {
  return row.source.type === 'multiple' && row.source.hasDirect === true;
}
</script>

<template>
  <div class="user-access-panel">
    <!-- Header -->
    <div class="d-flex align-center mb-4">
      <v-icon class="mr-2">mdi-account</v-icon>
      <span class="text-h6">{{ username }}</span>
      <v-chip v-if="store.userDetail" size="small" variant="tonal" label class="ml-2">
        {{ store.userDetail.identitySource }}
      </v-chip>
    </div>

    <!-- Section 1: Space Access -->
    <div class="d-flex align-center mb-2">
      <div class="text-subtitle-2">
        <v-icon size="small" class="mr-1">mdi-folder-multiple</v-icon>
        Space Access ({{ store.userAccessRows.length }})
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
      v-if="store.userAccessRows.length"
      :headers="[
        { title: 'Space', key: 'spaceName', sortable: true },
        { title: 'Effective', key: 'effectiveAccess', sortable: true },
        { title: 'Source', key: 'source', sortable: true, sort: (a, b) => {
          const getSourcePriority = (source: any) => {
            if (source.type === 'multiple' && source.hasDirect) return 1; // Override (Direct + Group)
            if (source.type === 'direct') return 2; // Direct only
            if (source.type === 'group') return 3; // Group only
            if (source.type === 'multiple') return 4; // Multiple groups
            return 5;
          };
          return getSourcePriority(a) - getSourcePriority(b);
        }},
        { title: 'Direct Access', key: 'directAccess', sortable: true },
        { title: 'Actions', key: 'actions', sortable: false, align: 'end' },
      ]"
      :items="store.userAccessRows"
      item-value="spaceName"
      density="compact"
      class="mb-6 access-table"
      :items-per-page="-1"
      hide-default-footer
    >
      <template #item.spaceName="{ item }">
        <v-icon size="small" class="mr-1">mdi-folder-network</v-icon>
        {{ item.spaceName }}
      </template>
      <template #item.effectiveAccess="{ item }">
        <EffectiveAccessChip :effective-access="item.effectiveAccess" />
      </template>
      <template #item.source="{ item }">
        <AccessSourceLabel :source="item.source" />
      </template>
      <template #item.directAccess="{ item }">
        <div class="d-flex align-center gap-1">
          <template v-if="item.directAccess">
            <v-btn
              size="x-small"
              variant="tonal"
              :color="item.directAccess === 'readonly' ? 'warning' : 'success'"
              @click="handleToggleAccess(item.spaceName, item.directAccess!)"
            >
              <v-icon size="x-small" class="mr-1">
                {{ item.directAccess === 'readonly' ? 'mdi-eye-outline' : 'mdi-pencil' }}
              </v-icon>
              {{ item.directAccess === 'admin' ? 'readwrite' : item.directAccess }}
            </v-btn>
            <v-tooltip v-if="hasOverride(item)" location="top" text="Reset to group default">
              <template #activator="{ props: tp }">
                <v-btn
                  v-bind="tp"
                  icon="mdi-restore"
                  size="x-small"
                  variant="text"
                  color="grey"
                  @click="handleResetOverride(item.spaceName)"
                />
              </template>
            </v-tooltip>
          </template>
          <span v-else class="text-caption text-medium-emphasis">--</span>
        </div>
      </template>
      <template #item.actions="{ item }">
        <v-btn
          v-if="item.directAccess && item.groupAccesses.length === 0"
          icon="mdi-close"
          size="x-small"
          variant="text"
          color="error"
          title="Remove direct access"
          @click="confirmRemoveSpace(item.spaceName)"
        />
        <v-tooltip
          v-else-if="item.directAccess && item.groupAccesses.length > 0"
          location="top"
          text="Cannot remove — user also has access via group"
        >
          <template #activator="{ props: tp }">
            <v-icon v-bind="tp" size="x-small" color="grey">mdi-lock-outline</v-icon>
          </template>
        </v-tooltip>
      </template>
    </v-data-table>
    <div v-else class="text-body-2 text-medium-emphasis mb-6">No space access</div>

    <v-divider class="mb-4" />

    <!-- Section 2: Group Memberships -->
    <div class="text-subtitle-2 mb-2">
      <v-icon size="small" class="mr-1">mdi-account-group</v-icon>
      Group Memberships ({{ groupMemberships.length }})
    </div>

    <div v-if="groupMemberships.length">
      <v-chip
        v-for="group in groupMemberships"
        :key="group"
        size="small"
        variant="tonal"
        label
        class="mr-2 mb-1"
      >
        <v-icon start size="small">mdi-account-group</v-icon>
        {{ group }}
      </v-chip>
    </div>
    <div v-else class="text-body-2 text-medium-emphasis">No group memberships</div>

    <!-- Remove Space Confirm -->
    <ConfirmDialog
      v-model="showRemoveConfirm"
      title="Remove Space Access"
      :message="`Remove direct access for user '${username}' from space '${removeTarget}'?`"
      confirm-text="Remove"
      confirm-color="error"
      @confirm="handleRemoveSpace"
    />
  </div>
</template>

<style scoped lang="scss">
.user-access-panel {
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
</style>
