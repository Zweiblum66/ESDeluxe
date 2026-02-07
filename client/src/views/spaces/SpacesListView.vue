<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useSpacesStore } from '@/stores/spaces.store';
import { useUsersStore } from '@/stores/users.store';
import { useGroupsStore } from '@/stores/groups.store';
import PageHeader from '@/components/common/PageHeader.vue';
import DataTable from '@/components/common/DataTable.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import InlineMultiSelect from '@/components/common/InlineMultiSelect.vue';
import type { InlineMultiSelectItem } from '@/components/common/InlineMultiSelect.vue';
import type { ISpaceDetail, SpaceType } from '@shared/types';

const store = useSpacesStore();
const usersStore = useUsersStore();
const groupsStore = useGroupsStore();

const columns = [
  { key: 'name', title: 'Name', sortable: true },
  { key: 'type', title: 'Type', sortable: true, width: '120px' },
  { key: 'quota', title: 'Quota', sortable: true, width: '100px' },
  { key: 'used', title: 'Used', sortable: true, width: '100px' },
  { key: 'usedPercent', title: '%Used', sortable: true, width: '120px', align: 'end' as const },
  { key: 'actions', title: '', width: '120px', sortable: false },
];

// --- Type filter ---
const typeFilter = ref<SpaceType | 'all'>('all');
const spaceTypes: { title: string; value: SpaceType | 'all' }[] = [
  { title: 'All Types', value: 'all' },
  { title: 'Avid Style', value: 'avidstyle' },
  { title: 'Avid MXF', value: 'avidmxf' },
  { title: 'Managed', value: 'managed' },
  { title: 'Unmanaged', value: 'unmanaged' },
  { title: 'ACL', value: 'acl' },
];

const filteredSpaces = computed(() => {
  if (typeFilter.value === 'all') return store.spaces;
  return store.spaces.filter((s) => s.type === typeFilter.value);
});

// --- Multi-select ---
const selectedSpaces = ref<string[]>([]);

// --- Dialogs ---
const showCreateDialog = ref(false);
const showDetailDialog = ref(false);
const showDeleteConfirm = ref(false);

// --- Create Space ---
const newSpaceName = ref('');
const newSpaceType = ref<SpaceType>('unmanaged');
const newSpaceQuotaGB = ref(100);
const isCreating = ref(false);

async function handleCreate(): Promise<void> {
  if (!newSpaceName.value) return;
  isCreating.value = true;
  const quotaBytes = newSpaceQuotaGB.value * 1024 * 1024 * 1024;
  const success = await store.createSpace(newSpaceName.value, newSpaceType.value, quotaBytes);
  isCreating.value = false;
  if (success) {
    showCreateDialog.value = false;
    newSpaceName.value = '';
    newSpaceType.value = 'unmanaged';
    newSpaceQuotaGB.value = 100;
  }
}

// --- Space Detail ---
const detailSpace = ref<ISpaceDetail | null>(null);

async function openDetail(item: Record<string, unknown>): Promise<void> {
  const name = item.name as string;
  detailSpace.value = await store.fetchSpaceDetail(name);
  if (detailSpace.value) {
    showAddUserPanel.value = false;
    showAddGroupPanel.value = false;
    showDetailDialog.value = true;
  }
}

async function refreshDetail(): Promise<void> {
  if (!detailSpace.value) return;
  detailSpace.value = await store.fetchSpaceDetail(detailSpace.value.name);
}

// --- Add Users (inline panel) ---
const showAddUserPanel = ref(false);
const addUserReadonly = ref(false);
const isAddingUsers = ref(false);
const addUserPanelRef = ref<InstanceType<typeof InlineMultiSelect> | null>(null);

function toggleAddUserPanel(): void {
  showAddUserPanel.value = !showAddUserPanel.value;
  if (showAddUserPanel.value) {
    addUserReadonly.value = false;
    if (usersStore.users.length === 0) {
      usersStore.fetchUsers();
    }
    addUserPanelRef.value?.reset();
  }
}

async function handleAddUsers(usernames: string[]): Promise<void> {
  if (!detailSpace.value) return;
  isAddingUsers.value = true;
  let successCount = 0;
  for (const username of usernames) {
    const success = await store.addUserToSpace(
      detailSpace.value.name,
      username,
      addUserReadonly.value,
    );
    if (success) successCount++;
  }
  isAddingUsers.value = false;
  if (successCount > 0) {
    showAddUserPanel.value = false;
    await refreshDetail();
  }
}

// --- Toggle User Access ---
async function handleToggleUserAccess(username: string, currentReadonly: boolean): Promise<void> {
  if (!detailSpace.value) return;
  const success = await store.setUserAccess(detailSpace.value.name, username, !currentReadonly);
  if (success) {
    await refreshDetail();
  }
}

// --- Remove User (with confirmation) ---
const showRemoveUserConfirm = ref(false);
const removeUserTarget = ref('');

function confirmRemoveUser(username: string): void {
  removeUserTarget.value = username;
  showRemoveUserConfirm.value = true;
}

async function handleRemoveUser(): Promise<void> {
  if (!detailSpace.value) return;
  const success = await store.removeUserFromSpace(detailSpace.value.name, removeUserTarget.value);
  showRemoveUserConfirm.value = false;
  if (success) {
    await refreshDetail();
  }
}

// --- Add Groups (inline panel) ---
const showAddGroupPanel = ref(false);
const addGroupReadonly = ref(false);
const isAddingGroups = ref(false);
const addGroupPanelRef = ref<InstanceType<typeof InlineMultiSelect> | null>(null);

function toggleAddGroupPanel(): void {
  showAddGroupPanel.value = !showAddGroupPanel.value;
  if (showAddGroupPanel.value) {
    addGroupReadonly.value = false;
    if (groupsStore.groups.length === 0) {
      groupsStore.fetchGroups();
    }
    addGroupPanelRef.value?.reset();
  }
}

async function handleAddGroups(groupNames: string[]): Promise<void> {
  if (!detailSpace.value) return;
  isAddingGroups.value = true;
  let successCount = 0;
  for (const groupName of groupNames) {
    const success = await store.addGroupToSpace(
      detailSpace.value.name,
      groupName,
      addGroupReadonly.value,
    );
    if (success) successCount++;
  }
  isAddingGroups.value = false;
  if (successCount > 0) {
    showAddGroupPanel.value = false;
    await refreshDetail();
  }
}

// --- Toggle Group Access ---
async function handleToggleGroupAccess(groupName: string, currentAccessType: string): Promise<void> {
  if (!detailSpace.value) return;
  const newReadonly = currentAccessType === 'readwrite';
  const success = await store.setGroupAccess(detailSpace.value.name, groupName, newReadonly);
  if (success) {
    await refreshDetail();
  }
}

// --- Remove Group (with confirmation) ---
const showRemoveGroupConfirm = ref(false);
const removeGroupTarget = ref('');

function confirmRemoveGroup(groupName: string): void {
  removeGroupTarget.value = groupName;
  showRemoveGroupConfirm.value = true;
}

async function handleRemoveGroup(): Promise<void> {
  if (!detailSpace.value) return;
  const success = await store.removeGroupFromSpace(detailSpace.value.name, removeGroupTarget.value);
  showRemoveGroupConfirm.value = false;
  if (success) {
    await refreshDetail();
  }
}

// --- Delete Space ---
const deleteSpaceName = ref('');

function openDeleteConfirm(name: string): void {
  deleteSpaceName.value = name;
  showDeleteConfirm.value = true;
}

async function handleDelete(): Promise<void> {
  await store.deleteSpace(deleteSpaceName.value);
  showDeleteConfirm.value = false;
  showDetailDialog.value = false;
}

// --- Bulk Delete ---
const showBulkDeleteConfirm = ref(false);
const isBulkDeleting = ref(false);

async function handleBulkDelete(): Promise<void> {
  isBulkDeleting.value = true;
  for (const name of selectedSpaces.value) {
    await store.deleteSpace(name);
  }
  isBulkDeleting.value = false;
  showBulkDeleteConfirm.value = false;
  selectedSpaces.value = [];
}

// --- Available items for inline panels ---
function availableUsers(): InlineMultiSelectItem[] {
  if (!detailSpace.value) return [];
  const currentUsers = new Set(detailSpace.value.users.map((u) => u.username));
  return usersStore.users
    .filter((u) => !currentUsers.has(u.username))
    .map((u) => ({ value: u.username, title: u.username }));
}

function availableGroups(): InlineMultiSelectItem[] {
  if (!detailSpace.value) return [];
  const currentGroups = new Set(detailSpace.value.groups.map((g) => g.groupName));
  return groupsStore.groups
    .filter((g) => !currentGroups.has(g.name))
    .map((g) => ({ value: g.name, title: g.name }));
}

// --- Formatting ---
function formatBytes(bytes: unknown): string {
  if (typeof bytes !== 'number' || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + sizes[i];
}

// Load spaces on mount
onMounted(() => {
  store.fetchSpaces();
});
</script>

<template>
  <div class="spaces-list-view">
    <PageHeader title="Media Spaces" :item-count="filteredSpaces.length">
      <template #actions>
        <v-select
          v-model="typeFilter"
          :items="spaceTypes"
          item-title="title"
          item-value="value"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 180px"
          class="mr-2"
        />
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          @click="showCreateDialog = true"
        >
          Create Space
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
      :items="(filteredSpaces as unknown as Record<string, unknown>[])"
      :loading="store.isLoading"
      item-key="name"
      selectable
      v-model:selected="selectedSpaces"
      search-placeholder="Search spaces..."
      no-data-text="No media spaces found"
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
      <!-- Custom column: type -->
      <template #item.type="{ item }">
        <v-chip
          size="small"
          variant="tonal"
          label
          :color="item.type === 'avidstyle' ? 'primary' : item.type === 'avidmxf' ? 'warning' : 'default'"
        >
          {{ item.type }}
        </v-chip>
      </template>

      <!-- Custom column: quota -->
      <template #item.quota="{ item }">
        {{ formatBytes(item.quota) }}
      </template>

      <!-- Custom column: used -->
      <template #item.used="{ item }">
        {{ formatBytes(item.used) }}
      </template>

      <!-- Custom column: %used -->
      <template #item.usedPercent="{ item }">
        <div class="d-flex align-center gap-2">
          <v-progress-linear
            :model-value="(item.usedPercent as number) || 0"
            :color="(item.usedPercent as number) > 90 ? 'error' : (item.usedPercent as number) > 70 ? 'warning' : 'primary'"
            height="6"
            rounded
            style="min-width: 40px"
          />
          <span class="text-caption">{{ item.usedPercent }}%</span>
        </div>
      </template>

      <!-- Custom column: actions -->
      <template #item.actions="{ item }">
        <v-btn
          icon="mdi-eye"
          size="small"
          variant="text"
          @click.stop="openDetail(item)"
          title="View space"
        />
        <v-btn
          icon="mdi-delete"
          size="small"
          variant="text"
          color="error"
          @click.stop="openDeleteConfirm(item.name as string)"
          title="Delete space"
        />
      </template>
    </DataTable>

    <!-- Create Space Dialog -->
    <v-dialog v-model="showCreateDialog" max-width="520" persistent>
      <v-card>
        <v-card-title>Create New Media Space</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newSpaceName"
            label="Space Name"
            variant="outlined"
            density="compact"
            class="mb-3"
            autofocus
            :rules="[v => !!v || 'Space name is required']"
          />
          <v-select
            v-model="newSpaceType"
            :items="spaceTypes.filter(t => t.value !== 'all')"
            item-title="title"
            item-value="value"
            label="Type"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-text-field
            v-model.number="newSpaceQuotaGB"
            label="Quota (GB)"
            variant="outlined"
            density="compact"
            type="number"
            :rules="[v => v > 0 || 'Quota must be greater than 0']"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showCreateDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="isCreating"
            :disabled="!newSpaceName || newSpaceQuotaGB <= 0"
            @click="handleCreate"
          >
            Create
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Space Detail Dialog -->
    <v-dialog v-model="showDetailDialog" max-width="800" scrollable>
      <v-card v-if="detailSpace">
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2">mdi-folder-network</v-icon>
          {{ detailSpace.name }}
          <v-chip size="small" variant="tonal" label class="ml-2">{{ detailSpace.type }}</v-chip>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showDetailDialog = false" />
        </v-card-title>
        <v-card-text>
          <!-- Space Info -->
          <v-list density="compact" class="mb-4">
            <v-list-item>
              <template #prepend><v-icon size="small">mdi-harddisk</v-icon></template>
              <v-list-item-title>Quota</v-list-item-title>
              <template #append>{{ formatBytes(detailSpace.quota) }}</template>
            </v-list-item>
            <v-list-item>
              <template #prepend><v-icon size="small">mdi-chart-donut</v-icon></template>
              <v-list-item-title>Used</v-list-item-title>
              <template #append>
                {{ formatBytes(detailSpace.used) }} ({{ detailSpace.usedPercent }}%)
              </template>
            </v-list-item>
          </v-list>

          <!-- Users Section -->
          <div class="d-flex align-center mb-2">
            <div class="text-subtitle-2">
              <v-icon size="small" class="mr-1">mdi-account-multiple</v-icon>
              Users ({{ detailSpace.users.length }})
            </div>
            <v-spacer />
            <v-btn
              size="small"
              variant="tonal"
              :color="showAddUserPanel ? undefined : 'primary'"
              :prepend-icon="showAddUserPanel ? 'mdi-close' : 'mdi-account-plus'"
              @click="toggleAddUserPanel"
            >
              {{ showAddUserPanel ? 'Cancel' : 'Add Users' }}
            </v-btn>
          </div>
          <div v-if="detailSpace.users.length" class="mb-2">
            <v-chip
              v-for="user in detailSpace.users"
              :key="user.username"
              size="small"
              variant="tonal"
              label
              class="mr-2 mb-1"
              :color="user.readonly ? 'warning' : 'success'"
            >
              <v-icon start size="small">mdi-account</v-icon>
              {{ user.username }}
              <v-tooltip location="top" text="Click to toggle access">
                <template #activator="{ props: tooltipProps }">
                  <span
                    v-bind="tooltipProps"
                    class="ml-1 text-caption access-toggle"
                    @click.stop="handleToggleUserAccess(user.username, user.readonly)"
                  >
                    <v-icon size="x-small" class="mr-1">{{ user.readonly ? 'mdi-eye-outline' : 'mdi-pencil' }}</v-icon>
                    {{ user.accessType }}
                  </span>
                </template>
              </v-tooltip>
              <template #append>
                <v-icon
                  size="x-small"
                  class="ml-1 chip-close-icon"
                  @click.stop="confirmRemoveUser(user.username)"
                >mdi-close-circle</v-icon>
              </template>
            </v-chip>
          </div>
          <div v-else class="text-body-2 text-medium-emphasis mb-2">No user access</div>

          <!-- Inline Add Users Panel -->
          <InlineMultiSelect
            v-if="showAddUserPanel"
            ref="addUserPanelRef"
            :items="availableUsers()"
            :loading="usersStore.isLoading"
            search-placeholder="Filter users..."
            no-data-text="No available users"
            icon="mdi-account"
            :is-adding="isAddingUsers"
            class="mb-4"
            @add="handleAddUsers"
            @cancel="showAddUserPanel = false"
          >
            <template #actions-prepend>
              <v-switch
                v-model="addUserReadonly"
                label="Read-only"
                color="warning"
                density="compact"
                hide-details
                class="mr-4"
              />
            </template>
          </InlineMultiSelect>
          <div v-else class="mb-4" />

          <!-- Groups Section -->
          <div class="d-flex align-center mb-2">
            <div class="text-subtitle-2">
              <v-icon size="small" class="mr-1">mdi-account-group</v-icon>
              Groups ({{ detailSpace.groups.length }})
            </div>
            <v-spacer />
            <v-btn
              size="small"
              variant="tonal"
              :color="showAddGroupPanel ? undefined : 'primary'"
              :prepend-icon="showAddGroupPanel ? 'mdi-close' : 'mdi-account-group'"
              @click="toggleAddGroupPanel"
            >
              {{ showAddGroupPanel ? 'Cancel' : 'Add Groups' }}
            </v-btn>
          </div>
          <div v-if="detailSpace.groups.length">
            <v-chip
              v-for="group in detailSpace.groups"
              :key="group.groupName"
              size="small"
              variant="tonal"
              label
              class="mr-2 mb-1"
              :color="group.accessType === 'readonly' ? 'warning' : 'success'"
            >
              <v-icon start size="small">mdi-account-group</v-icon>
              {{ group.groupName }}
              <v-tooltip location="top" text="Click to toggle access">
                <template #activator="{ props: tooltipProps }">
                  <span
                    v-bind="tooltipProps"
                    class="ml-1 text-caption access-toggle"
                    @click.stop="handleToggleGroupAccess(group.groupName, group.accessType)"
                  >
                    <v-icon size="x-small" class="mr-1">{{ group.accessType === 'readonly' ? 'mdi-eye-outline' : 'mdi-pencil' }}</v-icon>
                    {{ group.accessType }}
                  </span>
                </template>
              </v-tooltip>
              <template #append>
                <v-icon
                  size="x-small"
                  class="ml-1 chip-close-icon"
                  @click.stop="confirmRemoveGroup(group.groupName)"
                >mdi-close-circle</v-icon>
              </template>
            </v-chip>
          </div>
          <div v-else class="text-body-2 text-medium-emphasis">No group access</div>

          <!-- Inline Add Groups Panel -->
          <InlineMultiSelect
            v-if="showAddGroupPanel"
            ref="addGroupPanelRef"
            :items="availableGroups()"
            :loading="groupsStore.isLoading"
            search-placeholder="Filter groups..."
            no-data-text="No available groups"
            icon="mdi-account-group"
            :is-adding="isAddingGroups"
            class="mt-2"
            @add="handleAddGroups"
            @cancel="showAddGroupPanel = false"
          >
            <template #actions-prepend>
              <v-switch
                v-model="addGroupReadonly"
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
            @click="openDeleteConfirm(detailSpace.name)"
          >
            Delete
          </v-btn>
          <v-spacer />
          <v-btn @click="showDetailDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Remove User Confirm -->
    <ConfirmDialog
      v-model="showRemoveUserConfirm"
      title="Remove User"
      :message="`Remove user '${removeUserTarget}' from space '${detailSpace?.name}'?`"
      confirm-text="Remove"
      confirm-color="error"
      @confirm="handleRemoveUser"
    />

    <!-- Remove Group Confirm -->
    <ConfirmDialog
      v-model="showRemoveGroupConfirm"
      title="Remove Group"
      :message="`Remove group '${removeGroupTarget}' from space '${detailSpace?.name}'?`"
      confirm-text="Remove"
      confirm-color="error"
      @confirm="handleRemoveGroup"
    />

    <!-- Delete Confirm -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Delete Media Space"
      :message="`Are you sure you want to delete space '${deleteSpaceName}'? Media will be moved to trash. This action cannot be undone.`"
      confirm-text="Delete"
      confirm-color="error"
      @confirm="handleDelete"
    />

    <!-- Bulk Delete Confirm -->
    <ConfirmDialog
      v-model="showBulkDeleteConfirm"
      title="Delete Multiple Spaces"
      :message="`Are you sure you want to delete ${selectedSpaces.length} spaces? Media will be moved to trash. This action cannot be undone.`"
      confirm-text="Delete All"
      confirm-color="error"
      @confirm="handleBulkDelete"
    />
  </div>
</template>

<style scoped lang="scss">
.spaces-list-view {
  max-width: 1400px;
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
