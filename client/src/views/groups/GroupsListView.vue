<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useGroupsStore } from '@/stores/groups.store';
import { useUsersStore } from '@/stores/users.store';
import { useSpacesStore } from '@/stores/spaces.store';
import PageHeader from '@/components/common/PageHeader.vue';
import DataTable from '@/components/common/DataTable.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import InlineMultiSelect from '@/components/common/InlineMultiSelect.vue';
import type { InlineMultiSelectItem } from '@/components/common/InlineMultiSelect.vue';
import type { IGroupDetail } from '@shared/types';

const store = useGroupsStore();
const usersStore = useUsersStore();
const spacesStore = useSpacesStore();

const columns = [
  { key: 'name', title: 'Group Name', sortable: true },
  { key: 'memberCount', title: 'Members', sortable: true, width: '120px' },
  { key: 'actions', title: '', width: '120px', sortable: false },
];

// --- Multi-select ---
const selectedGroups = ref<string[]>([]);

// --- Dialogs ---
const showCreateDialog = ref(false);
const showDetailDialog = ref(false);
const showDeleteConfirm = ref(false);

// --- Create Group ---
const newGroupName = ref('');
const isCreating = ref(false);

async function handleCreate(): Promise<void> {
  if (!newGroupName.value) return;
  isCreating.value = true;
  const success = await store.createGroup(newGroupName.value);
  isCreating.value = false;
  if (success) {
    showCreateDialog.value = false;
    newGroupName.value = '';
  }
}

// --- Group Detail ---
const detailGroup = ref<IGroupDetail | null>(null);

async function openDetail(item: Record<string, unknown>): Promise<void> {
  const name = item.name as string;
  detailGroup.value = await store.fetchGroupDetail(name);
  if (detailGroup.value) {
    showAddMemberPanel.value = false;
    showAddSpacePanel.value = false;
    showDetailDialog.value = true;
  }
}

async function refreshDetail(): Promise<void> {
  if (!detailGroup.value) return;
  detailGroup.value = await store.fetchGroupDetail(detailGroup.value.name);
  // Also refresh the list for member count
  await store.fetchGroups();
}

// --- Add Members (inline panel) ---
const showAddMemberPanel = ref(false);
const isAddingMembers = ref(false);
const addMemberPanelRef = ref<InstanceType<typeof InlineMultiSelect> | null>(null);

function toggleAddMemberPanel(): void {
  showAddMemberPanel.value = !showAddMemberPanel.value;
  if (showAddMemberPanel.value) {
    // Ensure users are loaded for the list
    if (usersStore.users.length === 0) {
      usersStore.fetchUsers();
    }
    addMemberPanelRef.value?.reset();
  }
}

async function handleAddMembers(usernames: string[]): Promise<void> {
  if (!detailGroup.value) return;
  isAddingMembers.value = true;
  let successCount = 0;
  for (const username of usernames) {
    const success = await store.addUserToGroup(detailGroup.value.name, username);
    if (success) successCount++;
  }
  isAddingMembers.value = false;
  if (successCount > 0) {
    showAddMemberPanel.value = false;
    await refreshDetail();
  }
}

// --- Remove Member (with confirmation) ---
const showRemoveMemberConfirm = ref(false);
const removeMemberTarget = ref('');

function confirmRemoveMember(username: string): void {
  removeMemberTarget.value = username;
  showRemoveMemberConfirm.value = true;
}

async function handleRemoveMember(): Promise<void> {
  if (!detailGroup.value) return;
  const success = await store.removeUserFromGroup(detailGroup.value.name, removeMemberTarget.value);
  showRemoveMemberConfirm.value = false;
  if (success) {
    await refreshDetail();
  }
}

// --- Add Spaces (inline panel) ---
const showAddSpacePanel = ref(false);
const addSpaceReadonly = ref(false);
const isAddingSpaces = ref(false);
const addSpacePanelRef = ref<InstanceType<typeof InlineMultiSelect> | null>(null);

function toggleAddSpacePanel(): void {
  showAddSpacePanel.value = !showAddSpacePanel.value;
  if (showAddSpacePanel.value) {
    addSpaceReadonly.value = false;
    // Ensure spaces are loaded for the list
    if (spacesStore.spaces.length === 0) {
      spacesStore.fetchSpaces();
    }
    addSpacePanelRef.value?.reset();
  }
}

async function handleAddSpaces(spaceNames: string[]): Promise<void> {
  if (!detailGroup.value) return;
  isAddingSpaces.value = true;
  let successCount = 0;
  for (const spaceName of spaceNames) {
    const success = await spacesStore.addGroupToSpace(
      spaceName,
      detailGroup.value.name,
      addSpaceReadonly.value,
    );
    if (success) successCount++;
  }
  isAddingSpaces.value = false;
  if (successCount > 0) {
    showAddSpacePanel.value = false;
    await refreshDetail();
  }
}

// --- Toggle Space Access ---
async function handleToggleSpaceAccess(spaceName: string, currentAccessType: string): Promise<void> {
  if (!detailGroup.value) return;
  const newReadonly = currentAccessType === 'readwrite';
  const success = await spacesStore.setGroupAccess(spaceName, detailGroup.value.name, newReadonly);
  if (success) {
    await refreshDetail();
  }
}

// --- Remove Space (with confirmation) ---
const showRemoveSpaceConfirm = ref(false);
const removeSpaceTarget = ref('');

function confirmRemoveSpace(spaceName: string): void {
  removeSpaceTarget.value = spaceName;
  showRemoveSpaceConfirm.value = true;
}

async function handleRemoveSpace(): Promise<void> {
  if (!detailGroup.value) return;
  const success = await spacesStore.removeGroupFromSpace(removeSpaceTarget.value, detailGroup.value.name);
  showRemoveSpaceConfirm.value = false;
  if (success) {
    await refreshDetail();
  }
}

// --- Available items for inline panels ---
function availableUsers(): InlineMultiSelectItem[] {
  if (!detailGroup.value) return [];
  const currentMembers = new Set(detailGroup.value.users);
  return usersStore.users
    .filter((u) => !currentMembers.has(u.username))
    .map((u) => ({ value: u.username, title: u.username }));
}

function availableSpaces(): InlineMultiSelectItem[] {
  if (!detailGroup.value) return [];
  const currentSpaces = new Set(detailGroup.value.spaces.map((s) => s.spaceName));
  return spacesStore.spaces
    .filter((s) => !currentSpaces.has(s.name))
    .map((s) => ({ value: s.name, title: s.name }));
}

// --- Delete Group ---
const deleteGroupName = ref('');

function openDeleteConfirm(name: string): void {
  deleteGroupName.value = name;
  showDeleteConfirm.value = true;
}

async function handleDelete(): Promise<void> {
  await store.deleteGroup(deleteGroupName.value);
  showDeleteConfirm.value = false;
  showDetailDialog.value = false;
}

// --- Bulk Delete ---
const showBulkDeleteConfirm = ref(false);
const isBulkDeleting = ref(false);

async function handleBulkDelete(): Promise<void> {
  isBulkDeleting.value = true;
  for (const name of selectedGroups.value) {
    await store.deleteGroup(name);
  }
  isBulkDeleting.value = false;
  showBulkDeleteConfirm.value = false;
  selectedGroups.value = [];
}

// Load groups on mount
onMounted(() => {
  store.fetchGroups();
});
</script>

<template>
  <div class="groups-list-view">
    <PageHeader title="Groups" :item-count="store.groups.length">
      <template #actions>
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          @click="showCreateDialog = true"
        >
          Create Group
        </v-btn>
      </template>
    </PageHeader>

    <!-- Error Alert -->
    <v-alert
      v-if="store.error"
      type="error"
      variant="tonal"
      class="mb-4"
      closable
      @click:close="store.error = null"
    >
      {{ store.error }}
    </v-alert>

    <DataTable
      :columns="columns"
      :items="(store.groups as unknown as Record<string, unknown>[])"
      :loading="store.isLoading"
      item-key="name"
      selectable
      v-model:selected="selectedGroups"
      search-placeholder="Search groups..."
      no-data-text="No groups found"
      @click:row="openDetail"
    >
      <!-- Bulk actions -->
      <template #bulk-actions="{ count }">
        <v-btn
          size="small"
          variant="tonal"
          color="error"
          prepend-icon="mdi-delete"
          @click="showBulkDeleteConfirm = true"
        >
          Delete {{ count }}
        </v-btn>
      </template>
      <!-- Custom column: member count -->
      <template #item.memberCount="{ item }">
        <v-chip size="small" variant="tonal" label>
          {{ item.memberCount }} {{ (item.memberCount as number) === 1 ? 'user' : 'users' }}
        </v-chip>
      </template>

      <!-- Custom column: actions -->
      <template #item.actions="{ item }">
        <v-btn
          icon="mdi-eye"
          size="small"
          variant="text"
          @click.stop="openDetail(item)"
          title="View group"
        />
        <v-btn
          icon="mdi-delete"
          size="small"
          variant="text"
          color="error"
          @click.stop="openDeleteConfirm(item.name as string)"
          title="Delete group"
        />
      </template>
    </DataTable>

    <!-- Create Group Dialog -->
    <v-dialog v-model="showCreateDialog" max-width="480" persistent>
      <v-card>
        <v-card-title>Create New Group</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newGroupName"
            label="Group Name"
            variant="outlined"
            density="compact"
            autofocus
            :rules="[v => !!v || 'Group name is required']"
            hint="Lowercase, no spaces"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showCreateDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="isCreating"
            :disabled="!newGroupName"
            @click="handleCreate"
          >
            Create
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Group Detail Dialog -->
    <v-dialog v-model="showDetailDialog" max-width="700" scrollable>
      <v-card v-if="detailGroup">
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2">mdi-account-group</v-icon>
          {{ detailGroup.name }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showDetailDialog = false" />
        </v-card-title>
        <v-card-text>
          <!-- Members Section -->
          <div class="d-flex align-center mb-2">
            <div class="text-subtitle-2">
              <v-icon size="small" class="mr-1">mdi-account-multiple</v-icon>
              Members ({{ detailGroup.users.length }})
            </div>
            <v-spacer />
            <v-btn
              size="small"
              variant="tonal"
              :color="showAddMemberPanel ? undefined : 'primary'"
              :prepend-icon="showAddMemberPanel ? 'mdi-close' : 'mdi-account-plus'"
              @click="toggleAddMemberPanel"
            >
              {{ showAddMemberPanel ? 'Cancel' : 'Add Members' }}
            </v-btn>
          </div>
          <div v-if="detailGroup.users.length" class="mb-2">
            <v-chip
              v-for="user in detailGroup.users"
              :key="user"
              size="small"
              variant="tonal"
              label
              class="mr-2 mb-1"
            >
              <v-icon start size="small">mdi-account</v-icon>
              {{ user }}
              <template #append>
                <v-icon
                  size="x-small"
                  class="ml-1 chip-close-icon"
                  @click.stop="confirmRemoveMember(user)"
                >mdi-close-circle</v-icon>
              </template>
            </v-chip>
          </div>
          <div v-else class="text-body-2 text-medium-emphasis mb-2">No members</div>

          <!-- Inline Add Members Panel -->
          <InlineMultiSelect
            v-if="showAddMemberPanel"
            ref="addMemberPanelRef"
            :items="availableUsers()"
            :loading="usersStore.isLoading"
            search-placeholder="Filter users..."
            no-data-text="No available users"
            icon="mdi-account"
            :is-adding="isAddingMembers"
            class="mb-4"
            @add="handleAddMembers"
            @cancel="showAddMemberPanel = false"
          />
          <div v-else class="mb-4" />

          <!-- Spaces Section -->
          <div class="d-flex align-center mb-2">
            <div class="text-subtitle-2">
              <v-icon size="small" class="mr-1">mdi-folder-network</v-icon>
              Spaces ({{ detailGroup.spaces.length }})
            </div>
            <v-spacer />
            <v-btn
              size="small"
              variant="tonal"
              :color="showAddSpacePanel ? undefined : 'primary'"
              :prepend-icon="showAddSpacePanel ? 'mdi-close' : 'mdi-folder-plus'"
              @click="toggleAddSpacePanel"
            >
              {{ showAddSpacePanel ? 'Cancel' : 'Add Spaces' }}
            </v-btn>
          </div>
          <div v-if="detailGroup.spaces.length">
            <v-chip
              v-for="space in detailGroup.spaces"
              :key="space.spaceName"
              size="small"
              variant="tonal"
              label
              class="mr-2 mb-1"
              :color="space.accessType === 'readwrite' ? 'success' : 'warning'"
            >
              <v-icon start size="small">mdi-folder-network</v-icon>
              {{ space.spaceName }}
              <v-tooltip location="top" text="Click to toggle access">
                <template #activator="{ props: tooltipProps }">
                  <span
                    v-bind="tooltipProps"
                    class="ml-1 text-caption access-toggle"
                    @click.stop="handleToggleSpaceAccess(space.spaceName, space.accessType)"
                  >
                    <v-icon size="x-small" class="mr-1">{{ space.accessType === 'readonly' ? 'mdi-eye-outline' : 'mdi-pencil' }}</v-icon>
                    {{ space.accessType }}
                  </span>
                </template>
              </v-tooltip>
              <template #append>
                <v-icon
                  size="x-small"
                  class="ml-1 chip-close-icon"
                  @click.stop="confirmRemoveSpace(space.spaceName)"
                >mdi-close-circle</v-icon>
              </template>
            </v-chip>
          </div>
          <div v-else class="text-body-2 text-medium-emphasis">No space access</div>

          <!-- Inline Add Spaces Panel -->
          <InlineMultiSelect
            v-if="showAddSpacePanel"
            ref="addSpacePanelRef"
            :items="availableSpaces()"
            :loading="spacesStore.isLoading"
            search-placeholder="Filter spaces..."
            no-data-text="No available spaces"
            icon="mdi-folder-network"
            :is-adding="isAddingSpaces"
            class="mt-2"
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
        </v-card-text>
        <v-card-actions>
          <v-btn
            color="error"
            variant="tonal"
            prepend-icon="mdi-delete"
            @click="openDeleteConfirm(detailGroup.name)"
          >
            Delete
          </v-btn>
          <v-spacer />
          <v-btn @click="showDetailDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Remove Member Confirm -->
    <ConfirmDialog
      v-model="showRemoveMemberConfirm"
      title="Remove Member"
      :message="`Remove user '${removeMemberTarget}' from group '${detailGroup?.name}'?`"
      confirm-text="Remove"
      confirm-color="error"
      @confirm="handleRemoveMember"
    />

    <!-- Remove Space Confirm -->
    <ConfirmDialog
      v-model="showRemoveSpaceConfirm"
      title="Remove Space"
      :message="`Remove group '${detailGroup?.name}' from space '${removeSpaceTarget}'?`"
      confirm-text="Remove"
      confirm-color="error"
      @confirm="handleRemoveSpace"
    />

    <!-- Delete Confirm -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Delete Group"
      :message="`Are you sure you want to delete group '${deleteGroupName}'? This action cannot be undone.`"
      confirm-text="Delete"
      confirm-color="error"
      @confirm="handleDelete"
    />

    <!-- Bulk Delete Confirm -->
    <ConfirmDialog
      v-model="showBulkDeleteConfirm"
      title="Delete Multiple Groups"
      :message="`Are you sure you want to delete ${selectedGroups.length} groups? This action cannot be undone.`"
      confirm-text="Delete All"
      confirm-color="error"
      @confirm="handleBulkDelete"
    />
  </div>
</template>

<style scoped lang="scss">
.groups-list-view {
  max-width: 1200px;
}

.chip-close-icon {
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
  }
}

.access-toggle {
  cursor: pointer;
  border-radius: 3px;
  padding: 0 3px;
  transition: background-color 0.15s;

  &:hover {
    background-color: rgba(255, 255, 255, 0.12);
  }
}
</style>
